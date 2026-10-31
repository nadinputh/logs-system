import { z } from "zod";

// Length alone accepts "password" and "11111111". NIST 800-63B asks for a
// blocklist of known-compromised and trivially guessable secrets instead of
// composition rules; this is the small floor, not a breach corpus.
const COMMON = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd",
  "12345678", "123456789", "1234567890", "qwertyui", "qwerty123", "qwertyuiop",
  "iloveyou", "admin123", "administrator", "welcome1", "welcome123", "letmein1",
  "abc12345", "abcd1234", "11111111", "00000000", "changeme", "trustno1",
]);

export const PasswordSchema = z
  .string()
  .min(8)
  // bcrypt ignores everything past 72 bytes, so a longer password would be
  // silently truncated: refuse it instead.
  .refine((p) => Buffer.byteLength(p) <= 72, "Password is too long")
  .refine(
    (p) => !COMMON.has(p.toLowerCase()) && new Set(p).size > 2,
    "Choose a less common password",
  );
