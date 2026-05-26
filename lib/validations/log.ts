import { z } from "zod";

export const CreateLogSchema = z.object({
  locationId: z.string().min(1),
  locationType: z.enum(["building", "floor", "room"]),
  visitorName: z.string().min(1).max(100).optional(),
  visitorEmail: z.string().email().optional(),
  visitorPhone: z.string().max(30).optional(),
  visitorGender: z.enum(["male", "female", "non_binary", "prefer_not_to_say"]).optional(),
  visitPurpose: z.string().max(200).optional(),
  sessionToken: z.string().uuid(),
  deviceId: z.string().optional(),
  geofenceStatus: z.boolean().optional(),
  photo: z.string().url().optional(),
  questCardId: z.string().optional(),
});

export const CheckoutSchema = z.object({
  sessionToken: z.string().uuid(),
});

export type CreateLogInput = z.infer<typeof CreateLogSchema>;
export type CheckoutInput = z.infer<typeof CheckoutSchema>;
