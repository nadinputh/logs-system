import { beforeEach, describe, expect, it, vi } from "vitest";

const BUILDING_ID = "507f1f77bcf86cd799439011";
const FLOOR_ID = "507f1f77bcf86cd799439012";

// Unit square, [lng, lat] order.
const CCW_SQUARE: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
const CW_SQUARE: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]];

describe("normalizeGeofenceWinding", () => {
  it("leaves an already-counterclockwise exterior ring unchanged", async () => {
    const { normalizeGeofenceWinding } = await import("@/lib/geofence");
    expect(normalizeGeofenceWinding([CCW_SQUARE])).toEqual([CCW_SQUARE]);
  });

  it("reverses a clockwise exterior ring drawn in the other click order", async () => {
    const { normalizeGeofenceWinding } = await import("@/lib/geofence");
    const [result] = normalizeGeofenceWinding([CW_SQUARE]);
    expect(result).toEqual([...CW_SQUARE].reverse());
    expect(result).toEqual(CCW_SQUARE);
  });
});

describe("resolveBuildingId", () => {
  it("returns its own _id for a building check-in", async () => {
    const { resolveBuildingId } = await import("@/lib/geofence");
    expect(resolveBuildingId("building", { _id: BUILDING_ID })).toBe(BUILDING_ID);
  });

  it("returns the buildingId field for a floor/room check-in", async () => {
    const { resolveBuildingId } = await import("@/lib/geofence");
    expect(
      resolveBuildingId("floor", { _id: FLOOR_ID, buildingId: BUILDING_ID }),
    ).toBe(BUILDING_ID);
  });

  it("returns null when a floor/room has no buildingId", async () => {
    const { resolveBuildingId } = await import("@/lib/geofence");
    expect(resolveBuildingId("room", { _id: FLOOR_ID })).toBeNull();
  });
});

describe("computeGeofenceStatus", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function setupMocks(building: unknown, matches: boolean) {
    const findByIdLean = vi.fn().mockResolvedValue(building);
    const findById = vi.fn().mockReturnValue({ select: () => ({ lean: findByIdLean }) });
    const exists = vi.fn().mockResolvedValue(matches ? { _id: BUILDING_ID } : null);

    vi.doMock("@/lib/models/Building", () => ({
      Building: { findById, exists },
    }));

    const { computeGeofenceStatus } = await import("@/lib/geofence");
    return { computeGeofenceStatus, findById, exists };
  }

  it("returns undefined when no coordinates were sent", async () => {
    const { computeGeofenceStatus, findById } = await setupMocks(
      { geofence: { type: "Polygon", coordinates: [[[0, 0]]] } },
      true,
    );
    const result = await computeGeofenceStatus(BUILDING_ID, undefined, undefined);
    expect(result).toBeUndefined();
    expect(findById).not.toHaveBeenCalled();
  });

  it("returns undefined when buildingId is null", async () => {
    const { computeGeofenceStatus, findById } = await setupMocks(null, true);
    const result = await computeGeofenceStatus(null, 11.5, 104.9);
    expect(result).toBeUndefined();
    expect(findById).not.toHaveBeenCalled();
  });

  it("returns undefined when the building has no geofence configured", async () => {
    const { computeGeofenceStatus, exists } = await setupMocks({ geofence: null }, true);
    const result = await computeGeofenceStatus(BUILDING_ID, 11.5, 104.9);
    expect(result).toBeUndefined();
    expect(exists).not.toHaveBeenCalled();
  });

  it("returns true when coordinates fall inside the geofence", async () => {
    const { computeGeofenceStatus, exists } = await setupMocks(
      { geofence: { type: "Polygon", coordinates: [[[0, 0]]] } },
      true,
    );
    const result = await computeGeofenceStatus(BUILDING_ID, 11.5564, 104.9282);
    expect(result).toBe(true);
    expect(exists).toHaveBeenCalledWith({
      _id: BUILDING_ID,
      geofence: {
        $geoIntersects: {
          $geometry: { type: "Point", coordinates: [104.9282, 11.5564] },
        },
      },
    });
  });

  it("returns false when coordinates fall outside the geofence", async () => {
    const { computeGeofenceStatus } = await setupMocks(
      { geofence: { type: "Polygon", coordinates: [[[0, 0]]] } },
      false,
    );
    const result = await computeGeofenceStatus(BUILDING_ID, 0, 0);
    expect(result).toBe(false);
  });
});
