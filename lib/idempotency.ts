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

// Keys arrive from the client (header or body). Bound them, and keep them in
// their own namespace: this collection is shared with claim() (`kiosk:`,
// `kioskscan:`, `sessionqr:`), and an unprefixed client key could otherwise
// read or overwrite one of those records.
const KEY_RE = /^[\w-]{1,128}$/;
const NS = "idem:";

interface CachedResponse {
  statusCode: number;
  body: unknown;
}

export async function checkIdempotency(
  key: string,
): Promise<CachedResponse | null> {
  if (!KEY_RE.test(key)) return null;
  await connectDB();
  const record = await IdempotencyKey.findOne({ key: NS + key }).lean();
  if (!record) return null;
  try {
    return { statusCode: record.statusCode, body: JSON.parse(record.body) };
  } catch {
    return null;
  }
}

export async function saveIdempotency(
  key: string,
  statusCode: number,
  body: unknown,
): Promise<void> {
  if (!KEY_RE.test(key)) return;
  await connectDB();
  await IdempotencyKey.findOneAndUpdate(
    { key: NS + key },
    { key: NS + key, statusCode, body: JSON.stringify(body) },
    { upsert: true, setDefaultsOnInsert: true },
  );
}
