import { after } from "next/server";

/**
 * Runs `work` after the response is sent. Used where the work only happens for
 * some inputs (mail to an account that exists), so awaiting it would make
 * response time an account-existence oracle. Outside a request scope (unit
 * tests, scripts) `after` throws and the work simply runs inline.
 */
export async function deferred(work: () => Promise<void>): Promise<void> {
  const safe = () =>
    work().catch((err) => console.error("[deferred] background work failed:", err));
  try {
    after(safe);
  } catch {
    await safe();
  }
}

/** The requester's UI language, read while the request is still in scope. */
export async function requestLocale(): Promise<"en" | "km"> {
  try {
    const { cookies } = await import("next/headers");
    return (await cookies()).get("NEXT_LOCALE")?.value === "km" ? "km" : "en";
  } catch {
    return "en";
  }
}
