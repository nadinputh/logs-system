import { z } from "zod";

/** The transports the WebAuthn spec defines; anything else is dropped. */
export const TRANSPORTS = ["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"] as const;
export type Transport = (typeof TRANSPORTS)[number];

/**
 * @simplewebauthn/server copies `transports` from the client's response
 * unvalidated into its result, and that result is persisted. Keep only known
 * values, deduplicated.
 */
export function safeTransports(list: unknown): Transport[] {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((t): t is Transport => (TRANSPORTS as readonly string[]).includes(t as string)))];
}

const b64 = (max: number) => z.string().max(max);

/**
 * Shape and size bounds for a registration response from an unauthenticated or
 * low-privilege caller (it was `z.any()`). Fields are optional here: the
 * WebAuthn library rejects an incomplete response itself; this only guarantees
 * nothing oversized (or extra) reaches it or the database.
 */
export const RegistrationResponseSchema = z.object({
  id: b64(1023),
  rawId: b64(1400).optional(),
  type: z.string().max(32).optional(),
  authenticatorAttachment: z.string().max(32).nullish(),
  clientExtensionResults: z.record(z.string().max(64), z.unknown()).optional(),
  response: z.object({
    clientDataJSON: b64(4096).optional(),
    attestationObject: b64(16384).optional(),
    authenticatorData: b64(4096).optional(),
    publicKey: b64(2048).optional(),
    publicKeyAlgorithm: z.number().optional(),
    transports: z.array(z.string().max(32)).max(16).optional(),
  }),
});
