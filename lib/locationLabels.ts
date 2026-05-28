import { Types } from "mongoose";
import { Building } from "@/lib/models/Building";
import { Floor } from "@/lib/models/Floor";
import { Room } from "@/lib/models/Room";

export type LocationType = "building" | "floor" | "room";

export interface LocationLabel {
  name: string;
  /** Human-readable path, e.g. "HQ › Floor 2 › Conference A" */
  path: string;
}

/**
 * Batch-resolve display labels for a list of (locationType, locationId) pairs.
 * Returns a Map keyed by `${type}:${id}`.
 */
export async function resolveLocationLabels(
  refs: Array<{
    locationType: LocationType;
    locationId: string | Types.ObjectId;
  }>,
): Promise<Map<string, LocationLabel>> {
  const buildingIds = new Set<string>();
  const floorIds = new Set<string>();
  const roomIds = new Set<string>();

  for (const r of refs) {
    const id = r.locationId.toString();
    if (r.locationType === "building") buildingIds.add(id);
    else if (r.locationType === "floor") floorIds.add(id);
    else if (r.locationType === "room") roomIds.add(id);
  }

  const [buildings, floors, rooms] = await Promise.all([
    buildingIds.size
      ? Building.find({ _id: { $in: Array.from(buildingIds) } })
          .select("name")
          .lean<any[]>()
      : [],
    floorIds.size
      ? Floor.find({ _id: { $in: Array.from(floorIds) } })
          .populate("buildingId", "name")
          .select("name number buildingId")
          .lean<any[]>()
      : [],
    roomIds.size
      ? Room.find({ _id: { $in: Array.from(roomIds) } })
          .populate({
            path: "floorId",
            select: "name number buildingId",
            populate: { path: "buildingId", select: "name" },
          })
          .populate("buildingId", "name")
          .select("name number floorId buildingId")
          .lean<any[]>()
      : [],
  ]);

  const map = new Map<string, LocationLabel>();

  for (const b of buildings) {
    map.set(`building:${b._id.toString()}`, { name: b.name, path: b.name });
  }

  for (const f of floors) {
    const bName = f.buildingId?.name ?? "";
    const fLabel = `Floor ${f.number} · ${f.name}`;
    map.set(`floor:${f._id.toString()}`, {
      name: fLabel,
      path: bName ? `${bName} › ${fLabel}` : fLabel,
    });
  }

  for (const r of rooms) {
    const floor = r.floorId;
    const bName = floor?.buildingId?.name ?? r.buildingId?.name ?? "";
    const fLabel = floor ? `Floor ${floor.number}` : "";
    const rLabel = `${r.name} (${r.number})`;
    const path = [bName, fLabel, rLabel].filter(Boolean).join(" › ");
    map.set(`room:${r._id.toString()}`, { name: rLabel, path });
  }

  return map;
}
