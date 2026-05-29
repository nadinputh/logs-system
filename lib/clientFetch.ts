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
