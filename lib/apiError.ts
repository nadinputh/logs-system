import { readApiError } from "@/lib/clientFetch";

/**
 * API routes answer in English and, for the cases that matter, with a stable
 * `code`. The `apiErrors` namespace is keyed by that code or, when a route has
 * no code yet, by the slug of its English message — so translating a new
 * message is a catalogue entry, not a change to the route.
 */
export function errorSlug(message: string): string {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

type Translator = ((key: string) => string) & { has: (key: string) => boolean };

export function translateApiError(
  t: Translator,
  payload: any,
  fallback: string,
): string {
  const candidates = [
    payload?.code,
    // Some routes put the code itself in `error` (PASSKEY_REQUIRED, KIOSK_TOKEN_*).
    typeof payload?.error === "string" ? payload.error : null,
    typeof payload?.error === "string" ? errorSlug(payload.error) : null,
    typeof payload?.message === "string" ? errorSlug(payload.message) : null,
  ];
  for (const key of candidates) {
    if (typeof key === "string" && key && t.has(key)) return t(key);
  }
  return readApiError(payload, fallback);
}
