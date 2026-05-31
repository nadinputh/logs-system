import type { ILog } from "@/lib/models/Log";

export interface LogCreatedEvent {
  type: "log.created";
  teamId: string;
  logId: string;
  action: "in" | "out";
  locationId: string;
  locationType: ILog["locationType"];
  sessionToken: string;
  userId?: string;
  relatedLogId?: string;
  timestamp: string;
}

type LogEventSubscriber = (event: LogCreatedEvent) => void;

declare global {
  var _logRealtimeSubscribers: Map<string, Set<LogEventSubscriber>> | undefined;
}

function getSubscribers() {
  if (!global._logRealtimeSubscribers) {
    global._logRealtimeSubscribers = new Map();
  }
  return global._logRealtimeSubscribers;
}

function stringifyId(value: unknown) {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "toString" in value) {
    const stringValue = (value as { toString: () => string }).toString();
    return stringValue === "[object Object]" ? undefined : stringValue;
  }
  return String(value);
}

function stringifyTimestamp(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number") {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

export function subscribeToLogEvents(
  teamId: string,
  subscriber: LogEventSubscriber,
) {
  const subscribers = getSubscribers();
  const teamSubscribers = subscribers.get(teamId) ?? new Set();
  teamSubscribers.add(subscriber);
  subscribers.set(teamId, teamSubscribers);

  return () => {
    teamSubscribers.delete(subscriber);
    if (teamSubscribers.size === 0) {
      subscribers.delete(teamId);
    }
  };
}

export function publishLogCreated(log: Pick<ILog, keyof ILog>) {
  const teamId = stringifyId(log.teamId);
  const logId = stringifyId(log._id);
  const locationId = stringifyId(log.locationId);
  const sessionToken = stringifyId(log.sessionToken);

  if (!teamId || !logId || !locationId || !sessionToken) return;

  const event: LogCreatedEvent = {
    type: "log.created",
    teamId,
    logId,
    action: log.action,
    locationId,
    locationType: log.locationType,
    sessionToken,
    userId: stringifyId(log.userId),
    relatedLogId: stringifyId(log.relatedLogId),
    timestamp: stringifyTimestamp(log.timestamp),
  };

  getSubscribers()
    .get(teamId)
    ?.forEach((subscriber) => subscriber(event));
}
