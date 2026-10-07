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

import bcrypt from "bcryptjs";
import { connectDB } from "../lib/db";
import { User } from "../lib/models/User";
import { Team } from "../lib/models/Team";
import { TeamMember } from "../lib/models/TeamMember";

async function seed() {
  // This creates a well-known admin account. Never against production.
  if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_PRODUCTION !== "1") {
    throw new Error("Refusing to seed with NODE_ENV=production (set SEED_ALLOW_PRODUCTION=1 to override).");
  }
  await connectDB();

  let admin = await User.findOne({ email: "admin@example.com" });
  if (!admin) {
    const seedPassword = process.env.SEED_ADMIN_PASSWORD || "admin123";
    const passwordHash = await bcrypt.hash(seedPassword, 12);
    admin = await User.create({
      name: "Admin",
      email: "admin@example.com",
      passwordHash,
      role: "admin",
      emailVerified: new Date(),
    });
    console.log(
      process.env.SEED_ADMIN_PASSWORD
        ? "Admin user created: admin@example.com (password from SEED_ADMIN_PASSWORD)"
        : "Admin user created: admin@example.com / admin123 (dev default; set SEED_ADMIN_PASSWORD to change)",
    );
  } else {
    // Ensure the seeded admin can sign in under the email-verification guard.
    if (!admin.emailVerified) {
      await User.updateOne(
        { _id: admin._id },
        { emailVerified: new Date() },
      );
      console.log("Admin email marked verified.");
    }
    console.log("Admin user already exists.");
  }

  let team = await Team.findOne({ slug: "default-team" });
  if (!team) {
    team = await Team.create({
      name: "Default Team",
      slug: "default-team",
      ownerUserId: admin!._id,
      createdByUserId: admin!._id,
    });
    console.log("Default team created.");
  }

  await TeamMember.findOneAndUpdate(
    { teamId: team._id, userId: admin!._id },
    {
      teamId: team._id,
      userId: admin!._id,
      role: "owner",
      status: "active",
      joinedAt: new Date(),
    },
    { upsert: true, setDefaultsOnInsert: true },
  );

  await User.updateOne({ _id: admin!._id }, { activeTeamId: team._id });
  console.log("Admin linked to default team.");

  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
