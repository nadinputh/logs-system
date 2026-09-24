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

/**
 * Operator-only path to superadmin — deliberately the only one. No signup
 * flow, no in-app control, ever sets User.isSuperAdmin. Mirrors the trust
 * level of the seeded admin@example.com account in scripts/seed.ts.
 *
 * Usage:
 *   npx tsx scripts/grant-superadmin.ts user@example.com
 *   npx tsx scripts/grant-superadmin.ts user@example.com --revoke
 */
async function main() {
  const email = process.argv[2];
  const revoke = process.argv.includes("--revoke");

  if (!email || email.startsWith("--")) {
    console.error("Usage: npx tsx scripts/grant-superadmin.ts <email> [--revoke]");
    process.exit(1);
  }

  await connectDB();

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }

  user.isSuperAdmin = !revoke;
  await user.save();

  console.log(
    `${revoke ? "Revoked" : "Granted"} superadmin ${revoke ? "from" : "to"} ${user.email} (${user._id}).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
