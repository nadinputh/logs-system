import type { Types } from "mongoose";
import { discardIfUndelivered } from "@/lib/verification";
import type { VerificationTokenType } from "@/lib/models/VerificationToken";

/**
 * Sends the mail for a just-issued link and, if it did not go out (the send
 * returned false or threw), drops that link. The two-minute reissue guard
 * assumes the link is in the owner's inbox; without this, a failed send would
 * make the owner's immediate retry a silent no-op. Never throws.
 */
export async function trackedSend(
  userId: Types.ObjectId | string,
  type: VerificationTokenType,
  send: () => Promise<boolean | void>,
): Promise<boolean> {
  let delivered = false;
  try {
    delivered = (await send()) !== false;
  } catch (err) {
    console.error(`[mail:${type}] send failed:`, err);
  }
  await discardIfUndelivered(userId, type, delivered);
  return delivered;
}
