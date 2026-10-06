import fs from "node:fs";
import path from "node:path";

function loadLocalEnv() {
  const files = [".env.local", ".env"];
  for (const file of files) {
    const fullPath = path.join(process.cwd(), file);
    if (!fs.existsSync(fullPath)) continue;

    const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!key || process.env[key] !== undefined) continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

import { connectDB } from "../lib/db";
import { Log } from "../lib/models/Log";
import { AuditLog } from "../lib/models/AuditLog";

// Purge legacy selfie URLs (Log.photo). Dry-run unless --apply.
// Each removal is written to AuditLog first (original URL preserved there, so the
// Cloudinary assets can still be located and deleted), then the field is $unset.
// Safe to re-run: only documents that still carry `photo` are touched.
const REASON = "Selfie capture removed; legacy photo URL purged";

async function purge() {
  const apply = process.argv.includes("--apply");
  await connectDB();

  // Native collection: Log.photo is select:false and Mongoose would also stamp updatedAt.
  const docs = await Log.collection
    .find({ photo: { $exists: true } }, { projection: { _id: 1, teamId: 1, photo: 1 } })
    .toArray();

  console.log(`${docs.length} log(s) carry a photo field${apply ? "" : " (dry-run, pass --apply)"}`);
  if (!apply) process.exit(0);

  let purged = 0;
  for (const d of docs) {
    await AuditLog.create({
      teamId: d.teamId,
      logId: d._id,
      field: "photo",
      originalValue: String(d.photo ?? ""),
      newValue: "",
      reasonForChange: REASON,
    });
    await Log.collection.updateOne({ _id: d._id }, { $unset: { photo: "" } });
    purged++;
  }
  console.log(`Purged ${purged}`);
  process.exit(0);
}

purge().catch((err) => {
  console.error(err);
  process.exit(1);
});
