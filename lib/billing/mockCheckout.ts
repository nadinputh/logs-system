import { randomUUID } from "node:crypto";
import { connectDB } from "@/lib/db";
import { Plan, type IPlan } from "@/lib/models/Plan";
import { MockCheckoutSession, type IMockCheckoutSession } from "@/lib/models/MockCheckoutSession";
import { handleCheckoutCompleted, handleInvoicePaid } from "./webhookHandlers";

/**
 * Simulated outcomes for the dev-mode mock Checkout page
 * (app/dev/billing/checkout/[token]) — every case a real card can hit at
 * Stripe Checkout. "success" and "canceled" are the two outcomes that leave
 * the page (matching Stripe: a successful payment or an abandoned session
 * both navigate away); every decline variant leaves the session open for
 * retry, exactly like Stripe Checkout itself never redirects away from a
 * declined card — the shopper stays on the page and can try another card.
 */
export const MOCK_CHECKOUT_OUTCOMES = [
  "success",
  "card_declined",
  "insufficient_funds",
  "expired_card",
  "processing_error",
  "requires_authentication",
  "canceled",
] as const;

export type MockCheckoutOutcome = (typeof MOCK_CHECKOUT_OUTCOMES)[number];

const DECLINE_MESSAGES: Record<Exclude<MockCheckoutOutcome, "success" | "canceled">, string> = {
  card_declined: "Your card was declined.",
  insufficient_funds: "Your card has insufficient funds.",
  expired_card: "Your card has expired.",
  processing_error: "An error occurred while processing your card. Try again in a little bit.",
  requires_authentication: "Your card requires additional authentication, which was not completed.",
};

export interface MockCheckoutSessionView {
  token: string;
  teamName: string;
  plan: { name: string; billingCycle: string; priceCents: number; currency: string; trialDays: number };
  consumed: boolean;
}

export async function getMockCheckoutSession(token: string): Promise<MockCheckoutSessionView | null> {
  await connectDB();
  const session = await MockCheckoutSession.findOne({ token }).lean();
  if (!session) return null;
  const plan = await Plan.findById(session.planId)
    .select("name billingCycle priceCents currency trialDays")
    .lean();
  if (!plan) return null;

  return {
    token: session.token,
    teamName: session.teamName,
    plan: {
      name: plan.name,
      billingCycle: plan.billingCycle,
      priceCents: plan.priceCents,
      currency: plan.currency,
      trialDays: plan.trialDays,
    },
    consumed: Boolean(session.consumedAt),
  };
}

export interface MockCheckoutResult {
  redirectUrl: string;
  declineMessage?: string;
}

export async function completeMockCheckout(
  token: string,
  outcome: MockCheckoutOutcome,
): Promise<MockCheckoutResult> {
  await connectDB();
  const session = await MockCheckoutSession.findOne({ token });
  if (!session) throw new Error("This mock checkout session has expired or does not exist.");
  if (session.consumedAt) throw new Error("This mock checkout session was already completed.");

  if (outcome === "canceled") {
    session.consumedAt = new Date();
    await session.save();
    return { redirectUrl: session.cancelUrl };
  }

  if (outcome !== "success") {
    // A declined card never completes the Checkout Session on the real
    // Stripe side either — nothing to write, the session stays open for retry.
    return { redirectUrl: "", declineMessage: DECLINE_MESSAGES[outcome] };
  }

  const plan = await Plan.findById(session.planId).lean();
  if (!plan) throw new Error("The plan behind this mock checkout session no longer exists.");

  session.consumedAt = new Date();
  await session.save();

  const { subscriptionId, customerId, status, currentPeriodStart, currentPeriodEnd, trialEndsAt } =
    buildMockSubscriptionTerms(session, plan);

  await handleCheckoutCompleted({
    providerEventId: `evt_mock_checkout_${randomUUID()}`,
    provider: "mock",
    teamId: session.teamId,
    planId: String(plan._id),
    providerCustomerId: customerId,
    providerSubscriptionId: subscriptionId,
    status,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: false,
    trialEndsAt,
  });

  // Stripe doesn't capture a charge (and so never issues a paid invoice) for
  // a $0 trial period — the first real invoice arrives when the trial ends.
  if (status === "active") {
    await handleInvoicePaid({
      providerEventId: `evt_mock_invoice_${randomUUID()}`,
      providerSubscriptionId: subscriptionId,
      providerInvoiceId: `in_mock_${randomUUID()}`,
      number: mockInvoiceNumber(),
      amountCents: plan.priceCents,
      currency: plan.currency,
      periodStart: currentPeriodStart,
      periodEnd: currentPeriodEnd,
      provider: "mock",
    });
  }

  return { redirectUrl: session.successUrl };
}

function buildMockSubscriptionTerms(session: IMockCheckoutSession, plan: IPlan) {
  const now = new Date();
  const customerId = session.customerId ?? `cus_mock_${randomUUID()}`;
  const subscriptionId = `sub_mock_${randomUUID()}`;

  if (session.trialDays > 0) {
    const trialEnd = addDays(now, session.trialDays);
    return {
      subscriptionId,
      customerId,
      status: "trialing" as const,
      currentPeriodStart: now,
      currentPeriodEnd: trialEnd,
      trialEndsAt: trialEnd,
    };
  }

  const periodEnd = plan.billingCycle === "annual" ? addDays(now, 365) : addDays(now, 30);
  return {
    subscriptionId,
    customerId,
    status: "active" as const,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    trialEndsAt: null,
  };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function mockInvoiceNumber(): string {
  return `MOCK-${Date.now().toString(36).toUpperCase()}`;
}
