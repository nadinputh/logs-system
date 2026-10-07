"use client";

import { useEffect, useRef } from "react";

export interface ClientLogCreatedEvent {
  type: "log.created";
  logId: string;
  action: "in" | "out";
  locationId: string;
  locationType: "building" | "floor" | "room";
  relatedLogId?: string;
  timestamp: string;
}

/**
 * Minimal fetch-based SSE reader. EventSource can only GET, which would put a
 * bearer credential in the URL; this POSTs it in a body instead. It parses
 * just what the server sends (`event:` + `data:` frames separated by a blank
 * line, `:` comments for keep-alive) and, like the EventSource path, does not
 * reconnect on error.
 */
export async function readSse(
  path: string,
  body: unknown,
  signal: AbortSignal,
  onEvent: (event: string, data: string) => void,
) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trim());
      }
      if (data.length) onEvent(event, data.join("\n"));
    }
  }
}

export function useLogRealtime(
  onLogCreated: (event: ClientLogCreatedEvent) => void,
  enabled = true,
  streamPath = "/api/realtime/logs",
  // When set, the stream is opened with POST + this body (for streams whose
  // credential must not appear in a URL). Otherwise plain EventSource.
  body?: unknown,
) {
  const onLogCreatedRef = useRef(onLogCreated);

  useEffect(() => {
    onLogCreatedRef.current = onLogCreated;
  }, [onLogCreated]);

  useEffect(() => {
    if (!enabled) return;

    if (body !== undefined) {
      const ctrl = new AbortController();
      readSse(streamPath, body, ctrl.signal, (event, data) => {
        if (event !== "log.created") return;
        try {
          onLogCreatedRef.current(JSON.parse(data) as ClientLogCreatedEvent);
        } catch {}
      }).catch(() => {});
      return () => ctrl.abort();
    }

    const source = new EventSource(streamPath);

    function handleLogCreated(message: MessageEvent) {
      try {
        onLogCreatedRef.current(
          JSON.parse(message.data) as ClientLogCreatedEvent,
        );
      } catch {}
    }

    source.addEventListener("log.created", handleLogCreated as EventListener);

    source.onerror = () => {
      source.close();
    };

    return () => {
      source.removeEventListener(
        "log.created",
        handleLogCreated as EventListener,
      );
      source.close();
    };
  // body is compared by value: callers pass a fresh object each render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, streamPath, JSON.stringify(body)]);
}
