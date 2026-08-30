import { z } from "zod";

export const CreateBuildingSchema = z.object({
  name: z.string().min(1).max(100),
  address: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
});

export const CreateFloorSchema = z.object({
  buildingId: z.string().min(1),
  number: z.number().int(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const CreateRoomSchema = z.object({
  floorId: z.string().min(1),
  buildingId: z.string().min(1),
  name: z.string().min(1).max(100),
  number: z.string().min(1).max(20),
  type: z.string().max(50).optional(),
  capacity: z.number().int().positive().optional(),
  description: z.string().max(500).optional(),
});

export const CheckInModeEnum = z.enum(["click", "passkey"]);

export const UpdateLocationModeSchema = z.object({
  checkInMode: CheckInModeEnum,
});

// Metadata-only edits — deliberately excludes buildingId/floorId reassignment,
// which carries the same cascade risk as delete and is out of scope here.
export const UpdateBuildingSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  address: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
});

export const UpdateFloorSchema = z.object({
  number: z.number().int().optional(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

export const UpdateRoomSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  number: z.string().min(1).max(20).optional(),
  type: z.string().max(50).optional(),
  capacity: z.number().int().positive().optional(),
  description: z.string().max(500).optional(),
});

export type CreateBuildingInput = z.infer<typeof CreateBuildingSchema>;
export type CreateFloorInput = z.infer<typeof CreateFloorSchema>;
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;
export type CheckInMode = z.infer<typeof CheckInModeEnum>;
export type UpdateBuildingInput = z.infer<typeof UpdateBuildingSchema>;
export type UpdateFloorInput = z.infer<typeof UpdateFloorSchema>;
export type UpdateRoomInput = z.infer<typeof UpdateRoomSchema>;
