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

export function useLogRealtime(
  onLogCreated: (event: ClientLogCreatedEvent) => void,
  enabled = true,
  streamPath = "/api/realtime/logs",
) {
  const onLogCreatedRef = useRef(onLogCreated);

  useEffect(() => {
    onLogCreatedRef.current = onLogCreated;
  }, [onLogCreated]);

  useEffect(() => {
    if (!enabled) return;

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
  }, [enabled, streamPath]);
}
