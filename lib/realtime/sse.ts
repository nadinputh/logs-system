const encoder = new TextEncoder();

export function encodeEvent(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function encodeComment(comment: string): Uint8Array {
  return encoder.encode(`: ${comment}\n\n`);
}

export const SSE_RESPONSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

type SendFn = (chunk: Uint8Array) => void;
type CleanupFn = () => void;

export function createSseStream(
  req: { signal: AbortSignal },
  setup: (send: SendFn) => CleanupFn,
): Response {
  let cleanup: CleanupFn = () => {};

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

      const send: SendFn = (chunk) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          close();
        }
      };

      cleanup = setup(send);
      req.signal.addEventListener("abort", close, { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, { headers: SSE_RESPONSE_HEADERS });
}
