import { describe, expect, it } from "vitest";
import {
  TEAM_PERMISSION_MIN_ROLE,
  TEAM_ROLE_WEIGHT,
  hasMinimumTeamRole,
} from "@/lib/teamPermissions";
import { TeamRole } from "@/lib/models/TeamMember";

describe("team permissions", () => {
  it("grants manual checkout to managers and higher roles", () => {
    const requiredRole = TEAM_PERMISSION_MIN_ROLE["logs.manualCheckout"];
    const roles: TeamRole[] = [
      "auditor",
      "member",
      "manager",
      "admin",
      "owner",
    ];

    const allowedRoles = roles.filter((role) =>
      hasMinimumTeamRole(role, requiredRole),
    );

    expect(requiredRole).toBe("manager");
    expect(allowedRoles).toEqual(["manager", "admin", "owner"]);
  });

  it("keeps log correction stricter than manual checkout", () => {
    expect(
      TEAM_ROLE_WEIGHT[TEAM_PERMISSION_MIN_ROLE["logs.correct"]],
    ).toBeGreaterThan(
      TEAM_ROLE_WEIGHT[TEAM_PERMISSION_MIN_ROLE["logs.manualCheckout"]],
    );
  });
});
