import { Types } from "mongoose";
import { Subscription } from "@/lib/models/Subscription";
import { Plan, IPlanLimits } from "@/lib/models/Plan";
import { TeamMember } from "@/lib/models/TeamMember";
import { Building } from "@/lib/models/Building";

const PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

const FALLBACK_FREE_LIMITS: IPlanLimits = {
  maxBuildings: 1,
  maxTeamMembers: 5,
  maxQuestCards: 1,
  logRetentionDays: 30,
  blePush: false,
};

export interface TeamEntitlements {
  limits: IPlanLimits;
  /** True once a past-due subscription has exceeded its 7-day grace window,
   *  or once a subscription has fully lapsed (canceled). Blocks creating new
   *  buildings, team members, and quest cards — never blocks check-in/out
   *  logging itself, since that is this app's core safety function and must
   *  keep working for a team mid-dispute with its payment method. */
  readOnly: boolean;
}

/**
 * A team with no Subscription row (never checked out, or created before
 * billing existed and not yet backfilled) is treated as Free tier — the most
 * restrictive plan — rather than unlimited. Grandfathered teams get
 * `legacy-unlimited` explicitly via scripts/backfill-legacy-plan.ts, so an
 * absent row here is never "unlimited by omission."
 */
export async function getTeamEntitlements(
  teamId: Types.ObjectId | string,
): Promise<TeamEntitlements> {
  const subscription = await Subscription.findOne({ teamId }).lean();

  if (!subscription) {
    const freePlan = await Plan.findOne({ key: "free" }).select("limits").lean();
    return { limits: freePlan?.limits ?? FALLBACK_FREE_LIMITS, readOnly: false };
  }

  const plan = await Plan.findById(subscription.planId).select("limits").lean();
  const limits = plan?.limits ?? FALLBACK_FREE_LIMITS;

  const readOnly =
    subscription.status === "canceled" ||
    (subscription.status === "past_due" &&
      Boolean(subscription.pastDueSince) &&
      Date.now() - new Date(subscription.pastDueSince!).getTime() > PAST_DUE_GRACE_MS);

  return { limits, readOnly };
}

export function readOnlyResponse() {
  return {
    error:
      "This team's subscription is past due and its grace period has ended. Update payment to regain full access.",
  };
}

/**
 * Runs after any plan downgrade (manual revoke, or a Stripe plan-change
 * webhook) to bring a team back within its new limits without deleting
 * anything: newest-joined non-owner members are suspended and newest-created
 * buildings are archived until the team is at or under the new caps. Both
 * are reversible — reactivating a member or unarchiving a building is a
 * normal admin action, never a data-loss event.
 */
export async function enforcePlanLimitsAfterDowngrade(teamId: Types.ObjectId | string) {
  const { limits } = await getTeamEntitlements(teamId);

  if (limits.maxTeamMembers != null) {
    const activeMembers = await TeamMember.find({ teamId, status: "active", role: { $ne: "owner" } })
      .sort({ joinedAt: -1 })
      .select("_id")
      .lean();
    const overBy = activeMembers.length - (limits.maxTeamMembers - 1); // -1 reserves the owner's own seat
    if (overBy > 0) {
      const toSuspend = activeMembers.slice(0, overBy).map((m) => m._id);
      await TeamMember.updateMany({ _id: { $in: toSuspend } }, { status: "suspended" });
    }
  }

  if (limits.maxBuildings != null) {
    // Same reasoning as app/api/buildings/route.ts: pre-isArchived documents
    // have no such field, so an equality match on `false` would undercount.
    const activeBuildings = await Building.find({ teamId, isArchived: { $ne: true } })
      .sort({ createdAt: -1 })
      .select("_id")
      .lean();
    const overBy = activeBuildings.length - limits.maxBuildings;
    if (overBy > 0) {
      const toArchive = activeBuildings.slice(0, overBy).map((b) => b._id);
      await Building.updateMany({ _id: { $in: toArchive } }, { isArchived: true });
    }
  }
}
