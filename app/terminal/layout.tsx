import { requireTeamPageAccess } from "@/lib/server/requireTeamPageAccess";

// Guards `/terminal` at the page boundary rather than in middleware. Middleware
// can only read the JWT, which carries the system role (User.role: admin |
// staff) — the wrong vocabulary. The kiosk requires the team role
// `manager+` (same weight as `terminal.scan` in TEAM_PERMISSION_MIN_ROLE), and
// only a DB read can check it. Doing that in a Node runtime layout costs one
// query per navigation instead of blocking the entire team-owner population
// from their own terminals.
export const runtime = "nodejs";

export default async function TerminalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireTeamPageAccess("manager", "/terminal");
  return <>{children}</>;
}
