import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Plan } from "@/lib/models/Plan";
import { requireSuperAdmin } from "@/lib/middleware/auth";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

export async function GET() {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  await connectDB();
  const plans = await Plan.find({}).sort({ priceCents: 1 }).lean();
  return NextResponse.json({ plans });
}

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const { error } = await requireSuperAdmin();
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body?.key || !body?.name || !body?.billingCycle) {
    return NextResponse.json({ error: "key, name and billingCycle are required" }, { status: 400 });
  }

  await connectDB();

  const existing = await Plan.findOne({ key: body.key, billingCycle: body.billingCycle }).lean();
  if (existing) {
    return NextResponse.json(
      { error: `A plan with key "${body.key}" and cycle "${body.billingCycle}" already exists` },
      { status: 409 },
    );
  }

  const plan = await Plan.create({
    key: body.key,
    name: body.name,
    billingCycle: body.billingCycle,
    priceCents: body.priceCents ?? 0,
    currency: body.currency ?? "usd",
    trialDays: body.trialDays ?? 0,
    limits: {
      maxBuildings: body.limits?.maxBuildings ?? null,
      maxTeamMembers: body.limits?.maxTeamMembers ?? null,
      maxQuestCards: body.limits?.maxQuestCards ?? null,
      logRetentionDays: body.limits?.logRetentionDays ?? null,
      blePush: Boolean(body.limits?.blePush),
    },
    isActive: body.isActive ?? true,
  });

  return NextResponse.json({ plan }, { status: 201 });
}
