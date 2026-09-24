import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { connectDB } from "@/lib/db";
import { Plan } from "@/lib/models/Plan";
import { getBillingProvider } from "@/lib/billing/provider";
import { stripeConfigured, getStripeClient } from "@/lib/billing/providers/stripe";
import {
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaymentFailed,
  handleInvoicePaid,
} from "@/lib/billing/webhookHandlers";

export const runtime = "nodejs";

/**
 * Stripe webhooks are unauthenticated by design (Stripe's own servers call
 * this, not a signed-in browser) — assertSameOrigin/CSRF do not apply here.
 * The signature check below is what proves authenticity instead.
 *
 * This is the ONLY writer of Subscription.status for real Stripe traffic —
 * see lib/billing/webhookHandlers.ts for the actual writes, which this route
 * calls after resolving Stripe-specific shapes (price->Plan, live-subscription
 * fetches) into the provider-agnostic input those handlers expect. The
 * dev-mode mock provider (lib/billing/providers/mock.ts) calls the exact same
 * handlers with locally-known values instead of parsing a Stripe.Event, so a
 * "callback" test passing in dev mode is exercising this route's real
 * write path, not a separate stand-in for it. The self-serve UI and the
 * superadmin portal both read the Subscription collection but never flip
 * status themselves outside the two exceptions this route doesn't touch: a
 * manual grant (provider: "manual", written directly by the grant workflow)
 * and cancelAtPeriodEnd (a customer-initiated soft-cancel, written by the
 * Billing Portal call, then confirmed here on customer.subscription.updated).
 */
export async function POST(req: NextRequest) {
  if (!stripeConfigured()) {
    // Stripe would only be calling this if it were configured on their side
    // too, but a webhook secret can be rotated on one side and not the other.
    // 503, not 200 — Stripe retries a 503, and retrying is exactly right here.
    return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();
  const provider = await getBillingProvider();

  let event: Stripe.Event;
  try {
    event = (await provider.parseWebhookEvent(rawBody, signature)) as Stripe.Event;
  } catch (err) {
    // An invalid signature must 400, never 200 — a 200 tells Stripe (and an
    // attacker probing this endpoint) that a forged event was accepted.
    return NextResponse.json(
      { error: `Invalid signature: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  await connectDB();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const teamId = session.client_reference_id;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      if (!teamId || !subscriptionId || !customerId) break;

      const stripe = await getStripeClient();
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = sub.items.data[0]?.price.id;
      const plan = priceId ? await Plan.findOne({ stripePriceId: priceId }).lean() : null;
      if (!plan) break;

      await handleCheckoutCompleted({
        providerEventId: event.id,
        provider: "stripe",
        teamId,
        planId: String(plan._id),
        providerCustomerId: customerId,
        providerSubscriptionId: subscriptionId,
        status: sub.status === "trialing" ? "trialing" : "active",
        currentPeriodStart: new Date(sub.items.data[0].current_period_start * 1000),
        currentPeriodEnd: new Date(sub.items.data[0].current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      });
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = sub.items.data[0]?.price.id;
      const plan = priceId ? await Plan.findOne({ stripePriceId: priceId }).lean() : null;

      const nextStatus =
        sub.status === "past_due"
          ? "past_due"
          : sub.status === "trialing"
            ? "trialing"
            : sub.status === "canceled"
              ? "canceled"
              : sub.status === "incomplete" || sub.status === "incomplete_expired"
                ? "incomplete"
                : "active";

      await handleSubscriptionUpdated({
        providerEventId: event.id,
        providerSubscriptionId: sub.id,
        planId: plan ? String(plan._id) : null,
        status: nextStatus,
        currentPeriodStart: new Date(sub.items.data[0].current_period_start * 1000),
        currentPeriodEnd: new Date(sub.items.data[0].current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      });
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await handleSubscriptionDeleted({
        providerEventId: event.id,
        providerSubscriptionId: sub.id,
      });
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      // Recent Stripe API versions moved this under `parent.subscription_details`
      // instead of a top-level `invoice.subscription` field.
      const subField = invoice.parent?.subscription_details?.subscription;
      const subscriptionId = typeof subField === "string" ? subField : subField?.id;
      if (!subscriptionId) break;

      await handleInvoicePaymentFailed({
        providerEventId: event.id,
        providerSubscriptionId: subscriptionId,
        providerInvoiceId: invoice.id ?? event.id,
        number: invoice.number ?? invoice.id ?? event.id,
        amountCents: invoice.amount_due,
        currency: invoice.currency,
        periodStart: new Date(invoice.period_start * 1000),
        periodEnd: new Date(invoice.period_end * 1000),
        provider: "stripe",
      });
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subField = invoice.parent?.subscription_details?.subscription;
      const subscriptionId = typeof subField === "string" ? subField : subField?.id;
      if (!subscriptionId) break;

      await handleInvoicePaid({
        providerEventId: event.id,
        providerSubscriptionId: subscriptionId,
        providerInvoiceId: invoice.id ?? event.id,
        number: invoice.number ?? invoice.id ?? event.id,
        amountCents: invoice.amount_paid,
        currency: invoice.currency,
        periodStart: new Date(invoice.period_start * 1000),
        periodEnd: new Date(invoice.period_end * 1000),
        pdfUrl: invoice.invoice_pdf ?? null,
        provider: "stripe",
      });
      break;
    }

    default:
      // Unhandled event types are expected — Stripe sends far more event
      // types than this app acts on. Acknowledge with 200 so Stripe doesn't
      // retry an event this route was never going to do anything with.
      break;
  }

  return NextResponse.json({ ok: true });
}
