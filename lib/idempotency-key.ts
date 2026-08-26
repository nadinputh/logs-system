/**
 * The browser half of the idempotency engine.
 *
 * CLAUDE.md requires every write to carry a deterministic key
 * `sha256(sessionToken + locationId + toISODate(serverDate) + action_type)`.
 * `lib/idempotency.ts` computes the identical string server-side with node
 * `crypto`; this computes it with Web Crypto so a client can send it in the
 * `Idempotency-Key` header.
 *
 * It lives here rather than inside a component because it was previously
 * defined privately in `VisitorPasskey`, which is why the passkey write path
 * had replay protection and the ordinary click path had none.
 *
 * Both `Log` writes are read-then-write (`POST /api/logs` looks for an open
 * check-in, `PATCH /api/logs/[id]` looks for an existing check-out) — correct
 * in sequence, but not atomic. Two taps racing can both read "nothing yet".
 * This key is what closes that window, and on an append-only ledger a
 * duplicate can never be deleted, only corrected through `AuditLog`.
 */
export async function buildIdempotencyKey(
  sessionToken: string,
  locationId: string,
  action: 'in' | 'out',
): Promise<string> {
  const date = new Date().toISOString().slice(0, 10)
  const raw = `${sessionToken}:${locationId}:${date}:${action}`
  const data = new TextEncoder().encode(raw)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
