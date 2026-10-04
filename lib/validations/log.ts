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
  // Presence proof minted by the scan page after a dynamic kiosk QR was verified.
  kioskToken: z.string().optional(),
  // Raw coordinates only — geofenceStatus is computed server-side against the
  // location's stored geofence (app/api/logs/route.ts), never trusted from
  // the client.
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  // Only selfies this app uploaded (lib/cloudinary.ts returns a res.cloudinary.com
  // secure_url); an arbitrary URL would be fetched by every admin who opens the log.
  photo: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://res.cloudinary.com/"), "Invalid photo URL")
    .optional(),
  questCardId: z.string().optional(),
});

export const CheckoutSchema = z.object({
  sessionToken: z.string().uuid(),
});

export type CreateLogInput = z.infer<typeof CreateLogSchema>;
export type CheckoutInput = z.infer<typeof CheckoutSchema>;
