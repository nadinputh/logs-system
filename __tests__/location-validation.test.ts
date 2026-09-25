import { describe, expect, it } from "vitest";
import { CreateBuildingSchema, UpdateBuildingSchema } from "@/lib/validations/location";

const CCW_SQUARE: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
const CW_SQUARE: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]];

describe("CreateBuildingSchema geofence normalization", () => {
  it("normalizes a clockwise-drawn polygon to counterclockwise on parse", () => {
    const parsed = CreateBuildingSchema.parse({
      name: "HQ",
      address: "1 Main St",
      geofence: { type: "Polygon", coordinates: [CW_SQUARE] },
    });
    expect(parsed.geofence?.coordinates).toEqual([CCW_SQUARE]);
  });

  it("passes through null (no geofence configured)", () => {
    const parsed = CreateBuildingSchema.parse({
      name: "HQ",
      address: "1 Main St",
      geofence: null,
    });
    expect(parsed.geofence).toBeNull();
  });
});

describe("UpdateBuildingSchema geofence normalization", () => {
  it("normalizes on the PATCH path too", () => {
    const parsed = UpdateBuildingSchema.parse({
      geofence: { type: "Polygon", coordinates: [CW_SQUARE] },
    });
    expect(parsed.geofence?.coordinates).toEqual([CCW_SQUARE]);
  });

  it("rejects a ring with fewer than 4 points", () => {
    const result = UpdateBuildingSchema.safeParse({
      geofence: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [0, 0]]] },
    });
    expect(result.success).toBe(false);
  });
});
