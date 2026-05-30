import { TeamRole } from "@/lib/models/TeamMember";

export const TEAM_ROLE_WEIGHT: Record<TeamRole, number> = {
  auditor: 0,
  member: 1,
  manager: 2,
  admin: 3,
  owner: 4,
};

export type TeamPermission =
  | "locations.read"
  | "locations.write"
  | "locations.mode.update"
  | "logs.read"
  | "logs.write"
  | "logs.correct"
  | "dashboard.read"
  | "team.audit.read"
  | "team.members.read"
  | "team.members.manage"
  | "team.ownership.transfer"
  | "team.invites.read"
  | "team.invites.manage"
  | "terminal.scan";

export const TEAM_PERMISSION_MIN_ROLE: Record<TeamPermission, TeamRole> = {
  "locations.read": "member",
  "locations.write": "manager",
  "locations.mode.update": "admin",
  "logs.read": "member",
  "logs.write": "member",
  "logs.correct": "admin",
  "dashboard.read": "member",
  "team.audit.read": "admin",
  "team.members.read": "member",
  "team.members.manage": "admin",
  "team.ownership.transfer": "owner",
  "team.invites.read": "admin",
  "team.invites.manage": "admin",
  "terminal.scan": "manager",
};

export function hasMinimumTeamRole(role: TeamRole, requiredRole: TeamRole) {
  return TEAM_ROLE_WEIGHT[role] >= TEAM_ROLE_WEIGHT[requiredRole];
}
