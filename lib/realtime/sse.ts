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

/**
 * `maxMs` bounds a stream's life so abandoned or hostile connections cannot
 * accumulate; clients that still want updates reconnect. `setup` also receives
 * `close` so a stream can end itself (e.g. when the viewer loses access).
 */
export function createSseStream(
  req: { signal: AbortSignal },
  setup: (send: SendFn, close: () => void) => CleanupFn,
  opts: { maxMs?: number } = {},
): Response {
  let cleanup: CleanupFn = () => {};
  // cancel() and the abort handler can both fire for one disconnect; callers'
  // cleanups keep counters (per-IP stream caps), so run it exactly once.
  let cleaned = false;
  const runCleanup = () => {
    if (cleaned) return;
    cleaned = true;
    cleanup();
  };

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      let lifetime: ReturnType<typeof setTimeout> | undefined;
      const close = () => {
        if (closed) return;
        closed = true;
        if (lifetime) clearTimeout(lifetime);
        runCleanup();
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

      cleanup = setup(send, close);
      if (opts.maxMs) lifetime = setTimeout(close, opts.maxMs);
      req.signal.addEventListener("abort", close, { once: true });
    },
    cancel() {
      runCleanup();
    },
  });

  return new Response(stream, { headers: SSE_RESPONSE_HEADERS });
}
