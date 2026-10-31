// Values copied from .env.local.example, or the first thing anyone types.
const PLACEHOLDER = /^(replace-with|changeme|change-me|secret$|password$|test)/i;
const MIN_LENGTH = 32;

/**
 * A signing secret from the environment, or undefined when it must not be used.
 * In production a secret shorter than 32 characters or still holding the example
 * placeholder is refused: HS256 keys that short are brute-forceable offline from
 * one captured token, and the placeholder is public. Callers already treat a
 * missing secret as fail-closed, so a weak one takes the same path. Development
 * keeps whatever is set so local setup stays frictionless.
 */
export function readSecret(name: string): string | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  if (process.env.NODE_ENV === "production" && (value.length < MIN_LENGTH || PLACEHOLDER.test(value))) {
    console.error(`[secrets] ${name} is shorter than ${MIN_LENGTH} characters or still a placeholder; refusing to use it`);
    return undefined;
  }
  return value;
}
