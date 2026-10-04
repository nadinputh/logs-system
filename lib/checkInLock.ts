import { connectDB } from "@/lib/db";
import { CheckInLock } from "@/lib/models/CheckInLock";

/**
 * Check-in is read-then-insert ("is there an open visit?" then write), and an
 * open visit is the *absence* of a later OUT, which no unique index can express.
 * This short mutex serialises that window per visitor and location across every
 * check-in path. Returns a release function, or null if another request for the
 * same visitor holds it. Always call the release in a `finally`.
 */
export async function acquireCheckInLock(
  teamId: string,
  locationId: string,
  holder: string,
): Promise<(() => Promise<void>) | null> {
  await connectDB();
  const key = `in:${teamId}:${locationId}:${holder}`;
  try {
    await CheckInLock.create({ key });
  } catch (err: any) {
    if (err?.code === 11000) return null;
    throw err;
  }
  return async () => {
    await CheckInLock.deleteOne({ key }).catch(() => {});
  };
}
