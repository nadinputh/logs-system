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
import { Team } from "../lib/models/Team";
import { Plan } from "../lib/models/Plan";
import { Subscription } from "../lib/models/Subscription";
import { BillingEvent } from "../lib/models/BillingEvent";

/**
 * One-off backfill, mirroring scripts/backfill-team-ownership.ts's shape:
 * every team that predates billing (i.e. has no Subscription row at all) gets
 * enrolled on the internal, non-purchasable `legacy-unlimited` plan rather
 * than being silently capped down to Free's limits the moment entitlement
 * enforcement ships. Idempotent — a team that already has a Subscription is
 * left untouched, so this is safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/backfill-legacy-plan.ts --dry-run
 *   npx tsx scripts/backfill-legacy-plan.ts
 */
async function main() {
  const dryRun = process.argv.includes("--dry-run");

  await connectDB();

  const legacyPlan = await Plan.findOne({ key: "legacy-unlimited" }).lean();
  if (!legacyPlan) {
    console.error("legacy-unlimited plan not found — run `npm run seed:plans` first.");
    process.exit(1);
  }

  const teamsWithSubscription = await Subscription.distinct("teamId");
  const teamsToBackfill = await Team.find({ _id: { $nin: teamsWithSubscription } })
    .select("_id name slug")
    .lean();

  if (teamsToBackfill.length === 0) {
    console.log("No teams need backfilling — every team already has a Subscription row.");
    process.exit(0);
  }

  console.log(`${teamsToBackfill.length} team(s) to enroll on legacy-unlimited:`);
  for (const team of teamsToBackfill) {
    console.log(`  - ${team.name} (${team.slug})`);
  }

  if (dryRun) {
    console.log("\nDry run — no changes made. Re-run without --dry-run to apply.");
    process.exit(0);
  }

  for (const team of teamsToBackfill) {
    await Subscription.create({
      teamId: team._id,
      planId: legacyPlan._id,
      status: "active",
      provider: "manual",
      grantType: "manual_comp",
      grantReason: "Pre-billing team, grandfathered onto legacy-unlimited",
      currentPeriodStart: new Date(),
    });
    await BillingEvent.create({
      teamId: team._id,
      type: "comped",
      toPlanId: legacyPlan._id,
      note: "Legacy migration — grandfathered onto legacy-unlimited",
    });
    console.log(`Enrolled ${team.name}.`);
  }

  console.log(`\nDone — ${teamsToBackfill.length} team(s) backfilled.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
