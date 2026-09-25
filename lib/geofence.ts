import { Building } from "@/lib/models/Building";
import { LocationType } from "@/lib/locationOwnership";

type Ring = [number, number][];

function signedArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/**
 * MongoDB's 2dsphere index requires GeoJSON's right-hand rule: the exterior
 * ring counterclockwise, any hole rings clockwise (viewed from outside the
 * sphere). A clockwise exterior ring isn't rejected — it's read as the
 * inverse region (everywhere except the drawn area), so a geofence drawn in
 * the "wrong" click order would silently match backwards instead of
 * erroring. Admins click points in whatever order is natural; normalize
 * here rather than trust it.
 */
export function normalizeGeofenceWinding(rings: Ring[]): Ring[] {
  return rings.map((ring, i) => {
    const isExterior = i === 0;
    const isCounterclockwise = signedArea(ring) > 0;
    return isCounterclockwise === isExterior ? ring : [...ring].reverse();
  });
}

/**
 * Which Building a check-in location belongs to, for geofence lookup. A
 * Building check-in owns itself; Floor/Room check-ins carry buildingId
 * directly on the location document.
 */
export function resolveBuildingId(
  locationType: LocationType,
  location: { _id: any; buildingId?: any },
): string | null {
  if (locationType === "building") return location._id.toString();
  return location.buildingId ? location.buildingId.toString() : null;
}

/**
 * Server-side geofence check via Mongo's native $geoIntersects (no
 * hand-rolled point-in-polygon math). Returns true/false only when the
 * building has a geofence AND coordinates were supplied — otherwise
 * undefined ("not evaluated"), never a false negative for an unconfigured
 * building or a client that didn't send a location.
 */
export async function computeGeofenceStatus(
  buildingId: string | null,
  latitude?: number,
  longitude?: number,
): Promise<boolean | undefined> {
  if (!buildingId || latitude === undefined || longitude === undefined) {
    return undefined;
  }

  const building = await Building.findById(buildingId)
    .select("geofence")
    .lean<{ geofence?: unknown } | null>();
  if (!building?.geofence) return undefined;

  const match = await Building.exists({
    _id: buildingId,
    geofence: {
      $geoIntersects: {
        $geometry: { type: "Point", coordinates: [longitude, latitude] },
      },
    },
  });
  return Boolean(match);
}
