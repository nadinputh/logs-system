import { NextRequest, NextResponse } from "next/server";
import { requireTeamPermission } from "@/lib/middleware/auth";
import { subscribeToLogEvents } from "@/lib/realtime/logEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function encodeEvent(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function encodeComment(comment: string) {
  return encoder.encode(`: ${comment}\n\n`);
}

export async function GET(req: NextRequest) {
  const auth = await requireTeamPermission("logs.read");
  if (auth.error) return auth.error;
  if (!auth.teamId) {
    return NextResponse.json(
      { error: "No active team selected" },
      { status: 400 },
    );
  }

  const teamId = auth.teamId;
  const userId = (auth.session?.user as any)?.id;
  const role = (auth.session?.user as any)?.role;

  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {}
      };

      const send = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          close();
        }
      };

      const heartbeat = setInterval(() => {
        send(encodeComment("keep-alive"));
      }, 25_000);

      const unsubscribe = subscribeToLogEvents(teamId, (event) => {
        if (role !== "admin" && event.userId !== userId) return;

        const {
          teamId: _teamId,
          sessionToken: _sessionToken,
          userId: _userId,
          ...payload
        } = event;
        send(encodeEvent("log.created", payload));
      });

      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };

      send(encodeComment("connected"));
      req.signal.addEventListener("abort", close, { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
