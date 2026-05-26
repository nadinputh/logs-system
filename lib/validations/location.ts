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

export type CreateBuildingInput = z.infer<typeof CreateBuildingSchema>;
export type CreateFloorInput = z.infer<typeof CreateFloorSchema>;
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;
export type CheckInMode = z.infer<typeof CheckInModeEnum>;
