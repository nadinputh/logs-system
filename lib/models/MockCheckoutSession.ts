import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Dev-mode-bypass-only. Stands in for the state Stripe Checkout holds
 * server-side between "redirect the browser to Checkout" and "Stripe redirects
 * back with an outcome" — the app never sees that intermediate state for real
 * Stripe (Stripe owns it), but the mock provider has no external service to
 * hold it for us, so it lives here for the ~1h a dev is expected to be poking
 * at the mock checkout page. Guarded end-to-end by BILLING_MOCK_MODE; see
 * lib/billing/providers/mock.ts.
 */
export interface IMockCheckoutSession extends Document {
  token: string;
  teamId: string;
  teamName: string;
  planId: string;
  customerId?: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  trialDays: number;
  consumedAt?: Date | null;
  createdAt: Date;
}

const MockCheckoutSessionSchema = new Schema<IMockCheckoutSession>(
  {
    token: { type: String, required: true, unique: true },
    teamId: { type: String, required: true },
    teamName: { type: String, required: true },
    planId: { type: String, required: true },
    customerId: { type: String },
    customerEmail: { type: String },
    successUrl: { type: String, required: true },
    cancelUrl: { type: String, required: true },
    trialDays: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

// Auto-expire after 1 hour, matching how long a real Checkout Session stays live.
MockCheckoutSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

export const MockCheckoutSession: Model<IMockCheckoutSession> =
  mongoose.models.MockCheckoutSession ||
  mongoose.model<IMockCheckoutSession>("MockCheckoutSession", MockCheckoutSessionSchema);
