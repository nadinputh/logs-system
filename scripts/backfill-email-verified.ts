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
import { User } from "../lib/models/User";

// Grandfather existing accounts: any user who already has a password but no
// emailVerified predates the verification guard and should remain able to sign in.
async function backfill() {
  await connectDB();

  const result = await User.updateMany(
    {
      passwordHash: { $exists: true, $ne: null },
      $or: [{ emailVerified: { $exists: false } }, { emailVerified: null }],
    },
    { $set: { emailVerified: new Date() } },
  );

  console.log(`Marked ${result.modifiedCount} existing user(s) as verified.`);
  process.exit(0);
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});
