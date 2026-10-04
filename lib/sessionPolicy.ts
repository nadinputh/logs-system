/** Single source for the sign-in lifetime: lib/auth.ts enforces it, the login
 *  notice quotes it. Client-safe (no server imports). */
export const SESSION_MAX_AGE_DAYS = 14;
