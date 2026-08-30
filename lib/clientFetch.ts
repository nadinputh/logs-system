type JsonRequestInput = RequestInfo | URL;

const inFlightJsonRequests = new Map<string, Promise<unknown>>();

function getRequestKey(input: JsonRequestInput, init?: RequestInit) {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET") return null;

  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  return `${method} ${url}`;
}

export function fetchJsonOnce<T>(
  input: JsonRequestInput,
  init?: RequestInit,
): Promise<T> {
  const key = getRequestKey(input, init);

  if (!key) {
    return fetch(input, init).then((response) => response.json() as Promise<T>);
  }

  const existing = inFlightJsonRequests.get(key);
  if (existing) return existing as Promise<T>;

  const request = fetch(input, init)
    .then((response) => response.json() as Promise<T>)
    .finally(() => {
      inFlightJsonRequests.delete(key);
    });

  inFlightJsonRequests.set(key, request);
  return request;
}

/**
 * Pulls a human-readable message out of a failed API response body. Every
 * route in this app that rejects a request already writes one — the create
 * flows for buildings/floors/rooms were the one place still discarding it in
 * favor of a fixed "Failed to create X", which meant a referential-integrity
 * rejection ("Floor does not belong to the supplied building") and a network
 * hiccup were indistinguishable to the admin who hit either one.
 */
export function readApiError(payload: any, fallback: string): string {
  if (typeof payload?.message === "string") return payload.message;
  if (typeof payload?.error === "string") return payload.error;
  return fallback;
}
