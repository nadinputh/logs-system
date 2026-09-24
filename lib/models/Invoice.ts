import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type InvoiceStatus = "paid" | "payment_failed";

/**
 * Local mirror of the invoice Stripe issues for each billing-cycle charge.
 * Nothing here is the system of record for money — Stripe (or, in dev-mode
 * bypass, the mock provider standing in for it) is — this collection exists
 * so the app has something durable and queryable to show a team ("here is
 * what you were charged and when") without round-tripping to Stripe on every
 * page load, and so tests/audits can assert that a checkout or renewal
 * actually reached the "invoice issued" step rather than stopping at
 * "subscription is active."
 */
export interface IInvoice extends Document {
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
  providerEventId?: string; // dedupe key, mirrors BillingEvent.providerEventId
  issuedAt: Date;
}

const InvoiceSchema = new Schema<IInvoice>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: "Subscription", required: true },
    planId: { type: Schema.Types.ObjectId, ref: "Plan", required: true },
    provider: { type: String, enum: ["stripe", "mock"], required: true },
    providerInvoiceId: { type: String, required: true },
    number: { type: String, required: true },
    status: { type: String, enum: ["paid", "payment_failed"], required: true },
    amountCents: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "usd", lowercase: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    pdfUrl: { type: String, default: null },
    providerEventId: { type: String },
    issuedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

InvoiceSchema.index({ teamId: 1, issuedAt: -1 });
InvoiceSchema.index({ providerInvoiceId: 1 }, { unique: true });
InvoiceSchema.index({ providerEventId: 1 });

if (mongoose.models.Invoice && !mongoose.models.Invoice.schema.path("providerInvoiceId")) {
  delete mongoose.models.Invoice;
}

export const Invoice: Model<IInvoice> =
  mongoose.models.Invoice || mongoose.model<IInvoice>("Invoice", InvoiceSchema);
