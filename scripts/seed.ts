import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import bcrypt from "bcryptjs";
import { connectDB } from "../lib/db";
import { User } from "../lib/models/User";

async function seed() {
  await connectDB();

  const existing = await User.findOne({ email: "admin@example.com" });
  if (existing) {
    console.log("Admin user already exists.");
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash("admin123", 12);
  await User.create({
    name: "Admin",
    email: "admin@example.com",
    passwordHash,
    role: "admin",
  });

  console.log("Admin user created: admin@example.com / admin123");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
