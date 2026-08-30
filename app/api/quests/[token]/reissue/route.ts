import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { QuestCard } from "@/lib/models/QuestCard";
import { requireTeamAccess } from "@/lib/middleware/auth";
import { assertSameOrigin } from "@/lib/csrf";
import { v4 as uuidv4 } from "uuid";

export const runtime = "nodejs";

// Rotates the card's QR token in place. The lost physical code stops
// resolving to anything the instant this runs (QuestCard.qrToken is looked
// up directly), while QuestProgress — keyed to the card's _id, not its
// token — is untouched, so the replacement QR resumes exactly where the
// lost one left off.
//
// Lives under the same [token] segment as the public quest routes purely
// because Next.js requires sibling dynamic routes to share a slug name —
// the path value passed here is always the card's database _id (from the
// authenticated admin UI), never the public qrToken those routes use.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const auth = await requireTeamAccess({ minRole: "manager" });
  if (auth.error || !auth.teamId) return auth.error;

  const { token: id } = await params;
  await connectDB();

  const card = await QuestCard.findOneAndUpdate(
    { _id: id, teamId: auth.teamId },
    { qrToken: uuidv4() },
    { returnDocument: "after" },
  ).lean();

  if (!card) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(card);
}
