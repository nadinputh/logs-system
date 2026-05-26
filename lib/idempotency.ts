import crypto from "crypto";
import { connectDB } from "@/lib/db";
import { IdempotencyKey } from "@/lib/models/IdempotencyKey";

export function buildIdempotencyKey(
  sessionToken: string,
  locationId: string,
  serverDate: Date,
  action: "in" | "out",
): string {
  const raw = `${sessionToken}:${locationId}:${serverDate.toISOString().slice(0, 10)}:${action}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

interface CachedResponse {
  statusCode: number;
  body: unknown;
}

export async function checkIdempotency(
  key: string,
): Promise<CachedResponse | null> {
  await connectDB();
  const record = await IdempotencyKey.findOne({ key }).lean();
  if (!record) return null;
  return { statusCode: record.statusCode, body: JSON.parse(record.body) };
}

export async function saveIdempotency(
  key: string,
  statusCode: number,
  body: unknown,
): Promise<void> {
  await connectDB();
  await IdempotencyKey.findOneAndUpdate(
    { key },
    { key, statusCode, body: JSON.stringify(body) },
    { upsert: true, setDefaultsOnInsert: true },
  );
}
