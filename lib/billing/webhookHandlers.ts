import { Types } from "mongoose";
import { Subscription, type SubscriptionStatus } from "@/lib/models/Subscription";
import { BillingEvent } from "@/lib/models/BillingEvent";
import { Invoice, type InvoiceStatus } from "@/lib/models/Invoice";
import { enforcePlanLimitsAfterDowngrade } from "@/lib/entitlements";

/**
 * The actual state-mutating logic behind every billing callback, normalized
 * away from Stripe's wire shapes. app/api/webhooks/stripe/route.ts extracts
 * Stripe-specific fields (retrieving the live subscription, mapping a price
 * id to a Plan, etc.) and calls these; the dev-mode mock provider
 * (lib/billing/providers/mock.ts) already knows those fields directly — it's
 * simulating the callback, not receiving one over the wire — and calls the
 * exact same functions. Two callers, one code path that actually writes to
 * Mongo, so a passing dev-mode test of "checkout success" or "renewal
 * failure" is evidence the real webhook's write logic works too, not just
 * that the mock UI clicked a button.
 */

async function alreadyProcessed(providerEventId: string): Promise<boolean> {
  const existing = await BillingEvent.findOne({ providerEventId }).select("_id").lean();
  return Boolean(existing);
}

export interface CheckoutCompletedInput {
  providerEventId: string;
  provider: "stripe" | "mock";
  teamId: string;
  planId: string;
  providerCustomerId: string;
  providerSubscriptionId: string;
  status: "trialing" | "active";
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: Date | null;
}

export async function handleCheckoutCompleted(
  input: CheckoutCompletedInput,
): Promise<{ deduped: boolean }> {
  if (await alreadyProcessed(input.providerEventId)) return { deduped: true };

  const existing = await Subscription.findOne({ teamId: input.teamId }).select("planId").lean();

  await Subscription.findOneAndUpdate(
    { teamId: input.teamId },
    {
      teamId: input.teamId,
      planId: input.planId,
      status: input.status,
      provider: input.provider,
      providerCustomerId: input.providerCustomerId,
      providerSubscriptionId: input.providerSubscriptionId,
      currentPeriodStart: input.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      trialEndsAt: input.trialEndsAt,
      pastDueSince: null,
      grantType: "paid",
      grantedByUserId: null,
      grantReason: null,
      grantExpiresAt: null,
    },
    { upsert: true, setDefaultsOnInsert: true },
  );

  await BillingEvent.create({
    teamId: input.teamId,
    type: "checkout_completed",
    fromPlanId: existing?.planId,
    toPlanId: input.planId,
    providerEventId: input.providerEventId,
    raw: { subscriptionId: input.providerSubscriptionId, customerId: input.providerCustomerId },
  });

  return { deduped: false };
}

export interface SubscriptionUpdatedInput {
  providerEventId: string;
  providerSubscriptionId: string;
  /** null when the new price didn't map to any known Plan — status/period still apply. */
  planId: string | null;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export async function handleSubscriptionUpdated(
  input: SubscriptionUpdatedInput,
): Promise<{ deduped: boolean; handled: boolean }> {
  if (await alreadyProcessed(input.providerEventId)) return { deduped: true, handled: false };

  const record = await Subscription.findOne({ providerSubscriptionId: input.providerSubscriptionId });
  if (!record) return { deduped: false, handled: false };

  const fromPlanId = record.planId;

  record.status = input.status;
  if (input.planId) record.planId = new Types.ObjectId(input.planId);
  record.currentPeriodStart = input.currentPeriodStart;
  record.currentPeriodEnd = input.currentPeriodEnd;
  record.cancelAtPeriodEnd = input.cancelAtPeriodEnd;
  // Only stamp pastDueSince on the transition INTO past_due — re-stamping on
  // every subsequent event for the same subscription would restart the
  // 7-day grace clock indefinitely.
  if (input.status === "past_due" && !record.pastDueSince) {
    record.pastDueSince = new Date();
  } else if (input.status !== "past_due") {
    record.pastDueSince = null;
  }
  await record.save();

  if (input.planId && String(fromPlanId) !== String(input.planId)) {
    await BillingEvent.create({
      teamId: record.teamId,
      type: "plan_changed",
      fromPlanId,
      toPlanId: input.planId,
      providerEventId: input.providerEventId,
    });
    // Covers both directions — downgrade needs pruning, upgrade is a no-op.
    await enforcePlanLimitsAfterDowngrade(record.teamId);
  } else if (input.status === "past_due") {
    await BillingEvent.create({
      teamId: record.teamId,
      type: "payment_failed",
      toPlanId: record.planId,
      providerEventId: input.providerEventId,
    });
  } else {
    await BillingEvent.create({
      teamId: record.teamId,
      type: "renewed",
      toPlanId: record.planId,
      providerEventId: input.providerEventId,
    });
  }

  return { deduped: false, handled: true };
}

export interface SubscriptionDeletedInput {
  providerEventId: string;
  providerSubscriptionId: string;
}

export async function handleSubscriptionDeleted(
  input: SubscriptionDeletedInput,
): Promise<{ deduped: boolean; handled: boolean }> {
  if (await alreadyProcessed(input.providerEventId)) return { deduped: true, handled: false };

  const record = await Subscription.findOne({ providerSubscriptionId: input.providerSubscriptionId });
  if (!record) return { deduped: false, handled: false };

  record.status = "canceled";
  await record.save();

  await BillingEvent.create({
    teamId: record.teamId,
    type: "canceled",
    fromPlanId: record.planId,
    providerEventId: input.providerEventId,
  });

  return { deduped: false, handled: true };
}

export interface InvoicePaymentFailedInput {
  providerEventId: string;
  providerSubscriptionId: string;
  providerInvoiceId: string;
  number: string;
  amountCents: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  provider: "stripe" | "mock";
}

export async function handleInvoicePaymentFailed(
  input: InvoicePaymentFailedInput,
): Promise<{ deduped: boolean; handled: boolean }> {
  if (await alreadyProcessed(input.providerEventId)) return { deduped: true, handled: false };

  const record = await Subscription.findOne({ providerSubscriptionId: input.providerSubscriptionId });
  if (!record) return { deduped: false, handled: false };

  if (record.status !== "past_due") {
    record.status = "past_due";
    record.pastDueSince = new Date();
    await record.save();
  }

  await BillingEvent.create({
    teamId: record.teamId,
    type: "payment_failed",
    toPlanId: record.planId,
    providerEventId: input.providerEventId,
  });

  await createInvoiceIdempotent({
    teamId: record.teamId,
    subscriptionId: record._id,
    planId: record.planId,
    provider: input.provider,
    providerInvoiceId: input.providerInvoiceId,
    number: input.number,
    status: "payment_failed",
    amountCents: input.amountCents,
    currency: input.currency,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    providerEventId: input.providerEventId,
  });

  return { deduped: false, handled: true };
}

export interface InvoicePaidInput {
  providerEventId: string;
  providerSubscriptionId: string;
  providerInvoiceId: string;
  number: string;
  amountCents: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  pdfUrl?: string | null;
  provider: "stripe" | "mock";
}

/**
 * Issues the local invoice record for a successful charge — the initial
 * checkout invoice and every renewal alike. Unlike the other handlers this
 * doesn't write a BillingEvent (checkout_completed / renewed already cover
 * "what changed"), so it can't dedupe against BillingEvent.providerEventId;
 * Invoice.providerInvoiceId's unique index is the dedupe key instead, via
 * createInvoiceIdempotent below.
 */
export async function handleInvoicePaid(
  input: InvoicePaidInput,
): Promise<{ deduped: boolean; handled: boolean }> {
  const record = await Subscription.findOne({ providerSubscriptionId: input.providerSubscriptionId });
  if (!record) return { deduped: false, handled: false };

  const { deduped } = await createInvoiceIdempotent({
    teamId: record.teamId,
    subscriptionId: record._id,
    planId: record.planId,
    provider: input.provider,
    providerInvoiceId: input.providerInvoiceId,
    number: input.number,
    status: "paid",
    amountCents: input.amountCents,
    currency: input.currency,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    pdfUrl: input.pdfUrl ?? null,
    providerEventId: input.providerEventId,
  });

  return { deduped, handled: true };
}

interface InvoiceDoc {
  teamId: Types.ObjectId;
  subscriptionId: Types.ObjectId;
  planId: Types.ObjectId;
  provider: "stripe" | "mock";
  providerInvoiceId: string;
  number: string;
  status: InvoiceStatus;
  amountCents: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  pdfUrl?: string | null;
  providerEventId?: string;
}

async function createInvoiceIdempotent(doc: InvoiceDoc): Promise<{ deduped: boolean }> {
  try {
    await Invoice.create(doc);
    return { deduped: false };
  } catch (err) {
    // E11000 on the unique providerInvoiceId index — a redelivered event.
    if ((err as { code?: number })?.code === 11000) return { deduped: true };
    throw err;
  }
}
