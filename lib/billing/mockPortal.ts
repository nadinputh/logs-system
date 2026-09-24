import { randomUUID } from "node:crypto";
import { connectDB } from "@/lib/db";
import { Plan } from "@/lib/models/Plan";
import { Subscription } from "@/lib/models/Subscription";
import { Invoice } from "@/lib/models/Invoice";
import { Team } from "@/lib/models/Team";
import { getBillingProvider } from "./provider";
import { handleSubscriptionUpdated, handleInvoicePaid, handleInvoicePaymentFailed } from "./webhookHandlers";
import { mockInvoiceNumber } from "./mockCheckout";

/**
 * Dev-mode stand-in for Stripe's hosted Billing Portal
 * (app/dev/billing/portal/[customerId]) — lets a developer drive the
 * "callback" and "invoice" steps for a subscription that already exists,
 * without needing to run an actual month forward: simulate the next
 * renewal succeeding or failing, or cancel/resume, all via the same
 * lib/billing/webhookHandlers functions the real Stripe webhook uses.
 */

export interface MockPortalView {
  customerId: string;
  teamName: string;
  status: string;
  planName: string;
  billingCycle: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  providerSubscriptionId: string;
  invoices: Array<{
    number: string;
    status: string;
    amountCents: number;
    currency: string;
    issuedAt: Date;
  }>;
}

export async function getMockPortalData(customerId: string): Promise<MockPortalView | null> {
  await connectDB();
  const subscription = await Subscription.findOne({ providerCustomerId: customerId, provider: "mock" }).lean();
  if (!subscription || !subscription.providerSubscriptionId) return null;

  const [team, plan, invoices] = await Promise.all([
    Team.findById(subscription.teamId).select("name").lean(),
    Plan.findById(subscription.planId).select("name billingCycle").lean(),
    Invoice.find({ subscriptionId: subscription._id }).sort({ issuedAt: -1 }).limit(20).lean(),
  ]);

  return {
    customerId,
    teamName: team?.name ?? "Unknown team",
    status: subscription.status,
    planName: plan?.name ?? "Unknown plan",
    billingCycle: plan?.billingCycle ?? "monthly",
    currentPeriodEnd: subscription.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    providerSubscriptionId: subscription.providerSubscriptionId,
    invoices: invoices.map((inv) => ({
      number: inv.number,
      status: inv.status,
      amountCents: inv.amountCents,
      currency: inv.currency,
      issuedAt: inv.issuedAt,
    })),
  };
}

export type MockPortalAction =
  | "renew_success"
  | "renew_failure"
  | "cancel_at_period_end"
  | "resume"
  | "cancel_now";

async function requireMockSubscription(customerId: string) {
  await connectDB();
  const subscription = await Subscription.findOne({ providerCustomerId: customerId, provider: "mock" });
  if (!subscription || !subscription.providerSubscriptionId) {
    throw new Error(`No mock subscription found for customer "${customerId}"`);
  }
  return subscription;
}

export async function runMockPortalAction(customerId: string, action: MockPortalAction): Promise<void> {
  const subscription = await requireMockSubscription(customerId);
  const provider = await getBillingProvider();

  switch (action) {
    case "cancel_at_period_end":
      await provider.cancelAtPeriodEnd(subscription.providerSubscriptionId!, true);
      return;
    case "resume":
      await provider.cancelAtPeriodEnd(subscription.providerSubscriptionId!, false);
      return;
    case "cancel_now":
      await provider.cancelSubscriptionNow(subscription.providerSubscriptionId!);
      return;
    case "renew_success":
      await renewSuccess(subscription);
      return;
    case "renew_failure":
      await renewFailure(subscription);
      return;
  }
}

async function renewSuccess(subscription: { _id: unknown; planId: unknown; providerSubscriptionId?: string; currentPeriodStart?: Date; currentPeriodEnd?: Date }): Promise<void> {
  const plan = await Plan.findById(subscription.planId).select("priceCents currency billingCycle").lean();
  if (!plan) throw new Error("Plan behind this mock subscription no longer exists.");

  const periodStart = subscription.currentPeriodEnd ?? new Date();
  const periodEnd = addDays(periodStart, plan.billingCycle === "annual" ? 365 : 30);

  // Real Stripe fires both events for a successful renewal: the invoice for
  // the charge, and a subscription.updated confirming the new period — the
  // latter is what the "renewed" BillingEvent (see webhookHandlers) records.
  await handleSubscriptionUpdated({
    providerEventId: `evt_mock_renew_${randomUUID()}`,
    providerSubscriptionId: subscription.providerSubscriptionId!,
    planId: null,
    status: "active",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
  });

  await handleInvoicePaid({
    providerEventId: `evt_mock_invoice_${randomUUID()}`,
    providerSubscriptionId: subscription.providerSubscriptionId!,
    providerInvoiceId: `in_mock_${randomUUID()}`,
    number: mockInvoiceNumber(),
    amountCents: plan.priceCents,
    currency: plan.currency,
    periodStart,
    periodEnd,
    provider: "mock",
  });
}

async function renewFailure(subscription: { planId: unknown; providerSubscriptionId?: string; currentPeriodStart?: Date; currentPeriodEnd?: Date }): Promise<void> {
  const plan = await Plan.findById(subscription.planId).select("priceCents currency").lean();
  if (!plan) throw new Error("Plan behind this mock subscription no longer exists.");

  const periodStart = subscription.currentPeriodStart ?? new Date();
  const periodEnd = subscription.currentPeriodEnd ?? new Date();

  // handleInvoicePaymentFailed alone flips status to past_due, records the
  // BillingEvent, and issues the failed Invoice — mirroring only
  // invoice.payment_failed (not also subscription.updated) avoids writing
  // two "payment_failed"-shaped records for one simulated decline.
  await handleInvoicePaymentFailed({
    providerEventId: `evt_mock_invoice_failed_${randomUUID()}`,
    providerSubscriptionId: subscription.providerSubscriptionId!,
    providerInvoiceId: `in_mock_${randomUUID()}`,
    number: mockInvoiceNumber(),
    amountCents: plan.priceCents,
    currency: plan.currency,
    periodStart,
    periodEnd,
    provider: "mock",
  });
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
