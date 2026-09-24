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
import { Plan, type IPlanLimits } from "../lib/models/Plan";

/**
 * Seeds the plan catalog: three purchasable tiers, each as a monthly/annual
 * pair, plus one non-purchasable `legacy-unlimited` row for teams that
 * existed before billing shipped (see scripts/backfill-legacy-plan.ts).
 *
 * stripePriceId is intentionally left unset here — Stripe Price objects are
 * immutable and created via the Stripe dashboard or a separate sync step once
 * STRIPE_SECRET_KEY is configured. Running this script without Stripe keys is
 * safe and expected during local development; checkout for a plan with no
 * stripePriceId simply isn't offered yet (see lib/billing/provider.ts).
 */

const FREE_LIMITS: IPlanLimits = {
  maxBuildings: 1,
  maxTeamMembers: 5,
  maxQuestCards: 1,
  logRetentionDays: 30,
  blePush: false,
};

const PRO_LIMITS: IPlanLimits = {
  maxBuildings: 5,
  maxTeamMembers: 25,
  maxQuestCards: 10,
  logRetentionDays: 365,
  blePush: true,
};

const BUSINESS_LIMITS: IPlanLimits = {
  maxBuildings: null,
  maxTeamMembers: null,
  maxQuestCards: null,
  logRetentionDays: null,
  blePush: true,
};

const UNLIMITED_LIMITS: IPlanLimits = {
  maxBuildings: null,
  maxTeamMembers: null,
  maxQuestCards: null,
  logRetentionDays: null,
  blePush: true,
};

type PlanSeed = {
  key: string;
  name: string;
  billingCycle: "monthly" | "annual";
  priceCents: number;
  trialDays: number;
  limits: IPlanLimits;
};

// Annual = 10x the monthly price ("2 months free", ~17% off — the standard
// SaaS anchor), not a separately-chosen number.
const PLANS: PlanSeed[] = [
  { key: "free", name: "Free", billingCycle: "monthly", priceCents: 0, trialDays: 0, limits: FREE_LIMITS },
  { key: "free", name: "Free", billingCycle: "annual", priceCents: 0, trialDays: 0, limits: FREE_LIMITS },
  { key: "pro", name: "Pro", billingCycle: "monthly", priceCents: 4900, trialDays: 7, limits: PRO_LIMITS },
  { key: "pro", name: "Pro", billingCycle: "annual", priceCents: 49000, trialDays: 7, limits: PRO_LIMITS },
  { key: "business", name: "Business", billingCycle: "monthly", priceCents: 14900, trialDays: 0, limits: BUSINESS_LIMITS },
  { key: "business", name: "Business", billingCycle: "annual", priceCents: 149000, trialDays: 0, limits: BUSINESS_LIMITS },
  // Grandfather plan for pre-billing teams — see the migration step. Not
  // purchasable: no stripePriceId, isActive:false keeps it out of any
  // plan-picker UI that lists `isActive` plans, while still being a valid
  // `planId` for existing Subscription rows to point at.
  { key: "legacy-unlimited", name: "Legacy (unlimited)", billingCycle: "monthly", priceCents: 0, trialDays: 0, limits: UNLIMITED_LIMITS },
];

async function seedPlans() {
  await connectDB();

  for (const p of PLANS) {
    const isLegacy = p.key === "legacy-unlimited";
    const result = await Plan.findOneAndUpdate(
      { key: p.key, billingCycle: p.billingCycle },
      {
        $setOnInsert: {
          key: p.key,
          name: p.name,
          billingCycle: p.billingCycle,
          priceCents: p.priceCents,
          currency: "usd",
          trialDays: p.trialDays,
          limits: p.limits,
          isActive: !isLegacy,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
    console.log(`${result.key}/${result.billingCycle}: $${(result.priceCents / 100).toFixed(2)} — ok`);
  }

  console.log("\nPlan catalog seeded. stripePriceId is unset on every row —");
  console.log("run the Stripe price sync once STRIPE_SECRET_KEY is configured.");
  process.exit(0);
}

seedPlans().catch((err) => {
  console.error(err);
  process.exit(1);
});
