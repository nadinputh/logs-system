import { connectDB } from "@/lib/db";
import { IdempotencyKey } from "@/lib/models/IdempotencyKey";

/**
 * Atomic first-writer-wins claim on a key, reusing the 24h-TTL IdempotencyKey
 * collection. Returns null if this call took the claim, else the value the
 * first claimant stored (so a caller can tell "me again" from "someone else").
 */
export async function claim(key: string, value: string): Promise<string | null> {
  await connectDB();
  const filter = { key };
  const prior = await IdempotencyKey.findOneAndUpdate(
    filter,
    { $setOnInsert: { key, statusCode: 0, body: value } },
    { upsert: true },
  )
    .lean<{ body: string }>()
    .catch(() => IdempotencyKey.findOne(filter).lean<{ body: string }>()); // lost the insert race
  return prior ? prior.body : null;
}
