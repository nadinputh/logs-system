import { Building } from "@/lib/models/Building";
import { Floor } from "@/lib/models/Floor";
import { Room } from "@/lib/models/Room";

export type LocationType = "building" | "floor" | "room";

type LeanLocation = {
  _id: any;
  teamId: any;
  checkInMode?: "click" | "passkey";
};

export function getLocationModel(locationType: LocationType) {
  if (locationType === "room") return Room;
  if (locationType === "floor") return Floor;
  return Building;
}

export async function findOwnedLocationByType(
  locationType: LocationType,
  locationId: string,
): Promise<LeanLocation | null> {
  const model = getLocationModel(locationType) as any;
  const doc = await model
    .findById(locationId)
    .select("teamId checkInMode")
    .lean<LeanLocation | null>();
  return doc;
}

export async function findOwnedLocationById(
  locationId: string,
): Promise<(LeanLocation & { locationType: LocationType }) | null> {
  const [room, floor, building] = await Promise.all([
    Room.findById(locationId)
      .select("teamId checkInMode")
      .lean<LeanLocation | null>(),
    Floor.findById(locationId)
      .select("teamId checkInMode")
      .lean<LeanLocation | null>(),
    Building.findById(locationId)
      .select("teamId checkInMode")
      .lean<LeanLocation | null>(),
  ]);

  if (room) return { ...room, locationType: "room" };
  if (floor) return { ...floor, locationType: "floor" };
  if (building) return { ...building, locationType: "building" };
  return null;
}
