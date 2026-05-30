import fs from "node:fs";
import path from "node:path";

function loadLocalEnv() {
  const files = [".env.local", ".env"];
  for (const file of files) {
    const fullPath = path.join(process.cwd(), file);
    if (!fs.existsSync(fullPath)) continue;

    const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!key || process.env[key] !== undefined) continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

import mongoose, { Types } from "mongoose";
import { connectDB } from "../lib/db";
import { Team } from "../lib/models/Team";
import { TeamMember } from "../lib/models/TeamMember";
import { User } from "../lib/models/User";
import { Building } from "../lib/models/Building";
import { Floor } from "../lib/models/Floor";
import { Room } from "../lib/models/Room";
import { Log } from "../lib/models/Log";
import { AuditLog } from "../lib/models/AuditLog";
import { VisitorPasskeyCredential } from "../lib/models/VisitorPasskeyCredential";
import { VisitorPasskeyChallenge } from "../lib/models/VisitorPasskeyChallenge";
import { PasskeyCheckInChallenge } from "../lib/models/PasskeyCheckInChallenge";
import { QuestCard } from "../lib/models/QuestCard";
import { QuestProgress } from "../lib/models/QuestProgress";

const isDryRun = process.argv.includes("--dry-run");

const NO_TEAM_FILTER = {
  $or: [{ teamId: { $exists: false } }, { teamId: null }],
};

type TeamMaps = {
  buildingTeamById: Map<string, string>;
  floorTeamById: Map<string, string>;
  roomTeamById: Map<string, string>;
};

function oid(value: string) {
  return new Types.ObjectId(value);
}

function idOf(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Types.ObjectId) return value.toString();
  if (typeof value.toString === "function") return value.toString();
  return null;
}

async function executeBulk(label: string, model: any, ops: any[]) {
  if (ops.length === 0) {
    console.log(`[${label}] no changes needed`);
    return 0;
  }

  if (isDryRun) {
    console.log(`[${label}] dry-run: would apply ${ops.length} updates`);
    return ops.length;
  }

  const result = await model.bulkWrite(ops, { ordered: false });
  const modified =
    (result as any).modifiedCount ??
    (result as any).nModified ??
    (result as any).upsertedCount ??
    0;
  console.log(`[${label}] applied ${ops.length} updates`);
  return modified;
}

async function ensureDefaultTeam(): Promise<string> {
  let team = await Team.findOne({ slug: "default-team" }).lean<any>();
  if (team) return team._id.toString();

  const admin = await User.findOne({ role: "admin" })
    .sort({ createdAt: 1 })
    .lean<any>();
  const fallbackUser =
    admin ?? (await User.findOne({}).sort({ createdAt: 1 }).lean<any>());
  if (!fallbackUser) {
    throw new Error(
      "No users found. Create at least one user before running team ownership backfill.",
    );
  }

  if (isDryRun) {
    console.log(
      "[Team] dry-run: would create default-team and owner membership",
    );
    return (
      fallbackUser.activeTeamId?.toString?.() ??
      oid("507f1f77bcf86cd799439011").toString()
    );
  }

  team = await Team.create({
    name: "Default Team",
    slug: "default-team",
    ownerUserId: fallbackUser._id,
    createdByUserId: fallbackUser._id,
  });

  await TeamMember.findOneAndUpdate(
    { teamId: team._id, userId: fallbackUser._id },
    {
      teamId: team._id,
      userId: fallbackUser._id,
      role: "owner",
      status: "active",
      joinedAt: new Date(),
    },
    { upsert: true, setDefaultsOnInsert: true },
  );

  await User.updateOne({ _id: fallbackUser._id }, { activeTeamId: team._id });
  console.log("[Team] created default-team and linked owner");
  return team._id.toString();
}

async function getTeamMaps(): Promise<TeamMaps> {
  const [buildings, floors, rooms] = await Promise.all([
    Building.find({ teamId: { $exists: true, $ne: null } })
      .select("_id teamId")
      .lean<any[]>(),
    Floor.find({ teamId: { $exists: true, $ne: null } })
      .select("_id teamId")
      .lean<any[]>(),
    Room.find({ teamId: { $exists: true, $ne: null } })
      .select("_id teamId")
      .lean<any[]>(),
  ]);

  return {
    buildingTeamById: new Map(
      buildings.map((b) => [b._id.toString(), b.teamId.toString()]),
    ),
    floorTeamById: new Map(
      floors.map((f) => [f._id.toString(), f.teamId.toString()]),
    ),
    roomTeamById: new Map(
      rooms.map((r) => [r._id.toString(), r.teamId.toString()]),
    ),
  };
}

async function buildSessionTeamMap(sessionTokens: string[]) {
  if (sessionTokens.length === 0) return new Map<string, string>();

  const rows = await Log.find({
    sessionToken: { $in: sessionTokens },
    teamId: { $exists: true, $ne: null },
  })
    .select("sessionToken teamId timestamp")
    .sort({ timestamp: -1 })
    .lean<any[]>();

  const map = new Map<string, string>();
  for (const row of rows) {
    if (!map.has(row.sessionToken)) {
      map.set(row.sessionToken, row.teamId.toString());
    }
  }
  return map;
}

async function backfillLocations(defaultTeamId: string) {
  const mapsBefore = await getTeamMaps();

  const buildingsMissing = await Building.find(NO_TEAM_FILTER)
    .select("_id")
    .lean<any[]>();
  const buildingOps = buildingsMissing.map((b) => ({
    updateOne: {
      filter: { _id: b._id },
      update: { $set: { teamId: oid(defaultTeamId) } },
    },
  }));
  await executeBulk("Building", Building, buildingOps);

  const mapsAfterBuildings = await getTeamMaps();

  const floorsMissing = await Floor.find(NO_TEAM_FILTER)
    .select("_id buildingId")
    .lean<any[]>();
  const floorOps = floorsMissing.map((f) => {
    const fromBuilding = mapsAfterBuildings.buildingTeamById.get(
      f.buildingId?.toString?.() ?? "",
    );
    const teamId = fromBuilding ?? defaultTeamId;
    return {
      updateOne: {
        filter: { _id: f._id },
        update: { $set: { teamId: oid(teamId) } },
      },
    };
  });
  await executeBulk("Floor", Floor, floorOps);

  const mapsAfterFloors = await getTeamMaps();

  const roomsMissing = await Room.find(NO_TEAM_FILTER)
    .select("_id floorId buildingId")
    .lean<any[]>();
  const roomOps = roomsMissing.map((r) => {
    const fromFloor = mapsAfterFloors.floorTeamById.get(
      r.floorId?.toString?.() ?? "",
    );
    const fromBuilding = mapsAfterFloors.buildingTeamById.get(
      r.buildingId?.toString?.() ?? "",
    );
    const teamId = fromFloor ?? fromBuilding ?? defaultTeamId;
    return {
      updateOne: {
        filter: { _id: r._id },
        update: { $set: { teamId: oid(teamId) } },
      },
    };
  });
  await executeBulk("Room", Room, roomOps);

  const mapsFinal = await getTeamMaps();
  console.log(
    `[Location] team maps ready: buildings=${mapsFinal.buildingTeamById.size}, floors=${mapsFinal.floorTeamById.size}, rooms=${mapsFinal.roomTeamById.size}`,
  );

  return mapsFinal;
}

async function backfillLogs(defaultTeamId: string, maps: TeamMaps) {
  const logsMissing = await Log.find(NO_TEAM_FILTER)
    .select("_id locationType locationId relatedLogId userId sessionToken")
    .lean<any[]>();

  if (logsMissing.length === 0) {
    console.log("[Log] no changes needed");
    return;
  }

  const userIds = Array.from(
    new Set(
      logsMissing
        .map((l) => idOf(l.userId))
        .filter((id): id is string => !!id && Types.ObjectId.isValid(id)),
    ),
  );
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds.map((id) => oid(id)) } })
        .select("_id activeTeamId")
        .lean<any[]>()
    : [];
  const userTeamById = new Map(
    users
      .filter((u) => u.activeTeamId)
      .map((u) => [u._id.toString(), u.activeTeamId.toString()]),
  );

  const relatedIds = Array.from(
    new Set(
      logsMissing
        .map((l) => idOf(l.relatedLogId))
        .filter((id): id is string => !!id && Types.ObjectId.isValid(id)),
    ),
  );
  const relatedLogs = relatedIds.length
    ? await Log.find({ _id: { $in: relatedIds.map((id) => oid(id)) } })
        .select("_id teamId")
        .lean<any[]>()
    : [];
  const relatedTeamById = new Map(
    relatedLogs
      .filter((l) => l.teamId)
      .map((l) => [l._id.toString(), l.teamId.toString()]),
  );

  const ops = logsMissing.map((l) => {
    const locId = l.locationId?.toString?.() ?? "";
    const byLocation =
      l.locationType === "building"
        ? maps.buildingTeamById.get(locId)
        : l.locationType === "floor"
          ? maps.floorTeamById.get(locId)
          : maps.roomTeamById.get(locId);

    const byUser = userTeamById.get(l.userId?.toString?.() ?? "");
    const byRelated = relatedTeamById.get(l.relatedLogId?.toString?.() ?? "");
    const bySessionUser =
      l.sessionToken && Types.ObjectId.isValid(l.sessionToken)
        ? userTeamById.get(l.sessionToken)
        : null;

    const teamId =
      byLocation ?? byUser ?? byRelated ?? bySessionUser ?? defaultTeamId;
    return {
      updateOne: {
        filter: { _id: l._id },
        update: { $set: { teamId: oid(teamId) } },
      },
    };
  });

  await executeBulk("Log", Log, ops);
}

async function backfillAudit(defaultTeamId: string) {
  const auditsMissing = await AuditLog.find(NO_TEAM_FILTER)
    .select("_id logId")
    .lean<any[]>();
  if (auditsMissing.length === 0) {
    console.log("[AuditLog] no changes needed");
    return;
  }

  const logIds = Array.from(
    new Set(
      auditsMissing
        .map((a) => idOf(a.logId))
        .filter((id): id is string => !!id && Types.ObjectId.isValid(id)),
    ),
  );

  const logs = logIds.length
    ? await Log.find({ _id: { $in: logIds.map((id) => oid(id)) } })
        .select("_id teamId")
        .lean<any[]>()
    : [];
  const teamByLogId = new Map(
    logs
      .filter((l) => l.teamId)
      .map((l) => [l._id.toString(), l.teamId.toString()]),
  );

  const ops = auditsMissing.map((a) => {
    const teamId =
      teamByLogId.get(a.logId?.toString?.() ?? "") ?? defaultTeamId;
    return {
      updateOne: {
        filter: { _id: a._id },
        update: { $set: { teamId: oid(teamId) } },
      },
    };
  });

  await executeBulk("AuditLog", AuditLog, ops);
}

async function backfillVisitorPasskeys(defaultTeamId: string) {
  const credsMissing = await VisitorPasskeyCredential.find(NO_TEAM_FILTER)
    .select("_id sessionToken")
    .lean<any[]>();

  const sessionsFromCreds = Array.from(
    new Set(credsMissing.map((c) => c.sessionToken)),
  );
  const sessionTeamMapForCreds = await buildSessionTeamMap(sessionsFromCreds);

  const credOps = credsMissing.map((c) => {
    const teamId = sessionTeamMapForCreds.get(c.sessionToken) ?? defaultTeamId;
    return {
      updateOne: {
        filter: { _id: c._id },
        update: { $set: { teamId: oid(teamId) } },
      },
    };
  });
  await executeBulk(
    "VisitorPasskeyCredential",
    VisitorPasskeyCredential,
    credOps,
  );

  const challengesMissing = await VisitorPasskeyChallenge.find(NO_TEAM_FILTER)
    .select("_id sessionToken")
    .lean<any[]>();
  const sessionsFromChallenges = Array.from(
    new Set(challengesMissing.map((c) => c.sessionToken)),
  );
  const sessionTeamMapForChallenges = await buildSessionTeamMap(
    sessionsFromChallenges,
  );

  const challengeOps = challengesMissing.map((c) => {
    const teamId =
      sessionTeamMapForChallenges.get(c.sessionToken) ?? defaultTeamId;
    return {
      updateOne: {
        filter: { _id: c._id },
        update: { $set: { teamId: oid(teamId) } },
      },
    };
  });
  await executeBulk(
    "VisitorPasskeyChallenge",
    VisitorPasskeyChallenge,
    challengeOps,
  );
}

async function backfillPasskeyIntents(defaultTeamId: string, maps: TeamMaps) {
  const challengesMissing = await PasskeyCheckInChallenge.find(NO_TEAM_FILTER)
    .select("_id locationType locationId sessionToken")
    .lean<any[]>();

  if (challengesMissing.length === 0) {
    console.log("[PasskeyCheckInChallenge] no changes needed");
    return;
  }

  const sessions = Array.from(
    new Set(challengesMissing.map((c) => c.sessionToken)),
  );
  const sessionTeamMap = await buildSessionTeamMap(sessions);

  const ops = challengesMissing.map((c) => {
    const locId = c.locationId?.toString?.() ?? "";
    const byLocation =
      c.locationType === "building"
        ? maps.buildingTeamById.get(locId)
        : c.locationType === "floor"
          ? maps.floorTeamById.get(locId)
          : maps.roomTeamById.get(locId);

    const teamId =
      byLocation ?? sessionTeamMap.get(c.sessionToken) ?? defaultTeamId;
    return {
      updateOne: {
        filter: { _id: c._id },
        update: { $set: { teamId } },
      },
    };
  });

  await executeBulk("PasskeyCheckInChallenge", PasskeyCheckInChallenge, ops);
}

async function backfillQuests(defaultTeamId: string, maps: TeamMaps) {
  const questsMissing = await QuestCard.find(NO_TEAM_FILTER)
    .select("_id issuedBy steps")
    .lean<any[]>();

  if (questsMissing.length === 0) {
    console.log("[QuestCard] no changes needed");
    return;
  }

  const userIds = Array.from(
    new Set(
      questsMissing
        .map((q) => idOf(q.issuedBy))
        .filter((id): id is string => !!id && Types.ObjectId.isValid(id)),
    ),
  );
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds.map((id) => oid(id)) } })
        .select("_id activeTeamId")
        .lean<any[]>()
    : [];
  const userTeamById = new Map(
    users
      .filter((u) => u.activeTeamId)
      .map((u) => [u._id.toString(), u.activeTeamId.toString()]),
  );

  const ops = questsMissing.map((quest) => {
    const stepTeams = (quest.steps ?? [])
      .map((step: any) => {
        const locId = step.locationId?.toString?.() ?? "";
        if (step.locationType === "building") {
          return maps.buildingTeamById.get(locId);
        }
        if (step.locationType === "floor") {
          return maps.floorTeamById.get(locId);
        }
        if (step.locationType === "room") {
          return maps.roomTeamById.get(locId);
        }
        return null;
      })
      .filter((v: string | undefined | null): v is string => !!v);

    const firstStepTeam = stepTeams[0] ?? null;
    const byUser = userTeamById.get(quest.issuedBy?.toString?.() ?? "") ?? null;
    const teamId = firstStepTeam ?? byUser ?? defaultTeamId;

    return {
      updateOne: {
        filter: { _id: quest._id },
        update: { $set: { teamId: oid(teamId) } },
      },
    };
  });

  await executeBulk("QuestCard", QuestCard, ops);
}

async function backfillQuestProgress(defaultTeamId: string) {
  const progressMissing = await QuestProgress.find(NO_TEAM_FILTER)
    .select("_id questCardId sessionToken userId")
    .lean<any[]>();

  if (progressMissing.length === 0) {
    console.log("[QuestProgress] no changes needed");
    return;
  }

  const questIds = Array.from(
    new Set(
      progressMissing
        .map((p) => idOf(p.questCardId))
        .filter((id): id is string => !!id && Types.ObjectId.isValid(id)),
    ),
  );
  const quests = questIds.length
    ? await QuestCard.find({ _id: { $in: questIds.map((id) => oid(id)) } })
        .select("_id teamId")
        .lean<any[]>()
    : [];
  const questTeamById = new Map(
    quests
      .filter((q) => q.teamId)
      .map((q) => [q._id.toString(), q.teamId.toString()]),
  );

  const sessionTokens = Array.from(
    new Set(
      progressMissing
        .map((p) =>
          typeof p.sessionToken === "string" ? p.sessionToken : null,
        )
        .filter((v): v is string => !!v),
    ),
  );
  const sessionTeamByToken = await buildSessionTeamMap(sessionTokens);

  const userIds = Array.from(
    new Set(
      progressMissing
        .map((p) => idOf(p.userId))
        .filter((id): id is string => !!id && Types.ObjectId.isValid(id)),
    ),
  );
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds.map((id) => oid(id)) } })
        .select("_id activeTeamId")
        .lean<any[]>()
    : [];
  const userTeamById = new Map(
    users
      .filter((u) => u.activeTeamId)
      .map((u) => [u._id.toString(), u.activeTeamId.toString()]),
  );

  const ops = progressMissing.map((progress) => {
    const byQuest =
      questTeamById.get(progress.questCardId?.toString?.() ?? "") ?? null;
    const bySession = progress.sessionToken
      ? (sessionTeamByToken.get(progress.sessionToken) ?? null)
      : null;
    const byUser =
      userTeamById.get(progress.userId?.toString?.() ?? "") ?? null;
    const teamId = byQuest ?? bySession ?? byUser ?? defaultTeamId;

    return {
      updateOne: {
        filter: { _id: progress._id },
        update: { $set: { teamId: oid(teamId) } },
      },
    };
  });

  await executeBulk("QuestProgress", QuestProgress, ops);
}

async function normalizeUsersAndMemberships(defaultTeamId: string) {
  const usersMissingTeam = await User.find({
    $or: [{ activeTeamId: { $exists: false } }, { activeTeamId: null }],
  })
    .select("_id")
    .lean<any[]>();

  const userOps = usersMissingTeam.map((u) => ({
    updateOne: {
      filter: { _id: u._id },
      update: { $set: { activeTeamId: oid(defaultTeamId) } },
    },
  }));
  await executeBulk("User(activeTeamId)", User, userOps);

  const usersWithTeam = await User.find({
    activeTeamId: { $exists: true, $ne: null },
  })
    .select("_id activeTeamId")
    .lean<any[]>();
  if (usersWithTeam.length === 0) return;

  const userIds = usersWithTeam.map((u) => u._id.toString());
  const ownerTeams = await Team.find({
    ownerUserId: { $in: userIds.map((id) => oid(id)) },
  })
    .select("_id ownerUserId")
    .lean<any[]>();
  const ownerTeamPairs = new Set(
    ownerTeams.map((t) => `${t._id.toString()}:${t.ownerUserId.toString()}`),
  );

  const memberOps = usersWithTeam.map((u) => {
    const teamId = u.activeTeamId.toString();
    const userId = u._id.toString();
    const role = ownerTeamPairs.has(`${teamId}:${userId}`) ? "owner" : "member";

    return {
      updateOne: {
        filter: { teamId: oid(teamId), userId: oid(userId) },
        update: {
          $setOnInsert: {
            teamId: oid(teamId),
            userId: oid(userId),
            role,
            status: "active",
            joinedAt: new Date(),
          },
        },
        upsert: true,
      },
    };
  });

  await executeBulk("TeamMember(upsert)", TeamMember, memberOps);
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured.");
  }

  console.log(
    `Starting team ownership backfill (${isDryRun ? "dry-run" : "apply"})`,
  );
  await connectDB();

  const defaultTeamId = await ensureDefaultTeam();
  console.log(`[Team] default team id: ${defaultTeamId}`);

  const locationMaps = await backfillLocations(defaultTeamId);
  await backfillLogs(defaultTeamId, locationMaps);
  await backfillAudit(defaultTeamId);
  await backfillQuests(defaultTeamId, locationMaps);
  await backfillQuestProgress(defaultTeamId);
  await backfillVisitorPasskeys(defaultTeamId);
  await backfillPasskeyIntents(defaultTeamId, locationMaps);
  await normalizeUsersAndMemberships(defaultTeamId);

  console.log(`Backfill completed (${isDryRun ? "dry-run" : "apply"}).`);
}

main()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
  });
