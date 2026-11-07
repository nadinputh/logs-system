import { readSecret } from "@/lib/secrets";

// NextAuth and middleware read NEXTAUTH_SECRET straight from the environment, so
// a placeholder or short value would let anyone forge a session cookie. Check it
// once at server start (not at build, where the secret is usually absent) and
// refuse to serve in production rather than run with a guessable signing key.
export function register() {
  if (process.env.NODE_ENV === "production" && !readSecret("NEXTAUTH_SECRET")) {
    throw new Error("NEXTAUTH_SECRET is missing, shorter than 32 characters, or still a placeholder");
  }
}
