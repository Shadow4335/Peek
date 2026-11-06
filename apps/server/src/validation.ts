import { z } from "zod";

const lat = z.number().finite().min(-90).max(90);
const lng = z.number().finite().min(-180).max(180);
const accuracy = z.number().finite().min(0).max(10_000);

export const GeoFixSchema = z.object({ lat, lng, accuracy_m: accuracy });

export const HeartbeatSchema = GeoFixSchema.extend({
  battery: z.number().min(0).max(1).nullable(),
  updated_at: z.string().max(40),
});

export const FreshFixSchema = HeartbeatSchema.extend({ requestId: z.uuid() });

export const RoomJoinSchema = z.object({ roomId: z.uuid() });
export const StartMatchSchema = z.object({ roomId: z.uuid(), force: z.boolean() });
export const TagSchema = z.object({ hiderPlayerId: z.uuid(), seeker: GeoFixSchema });
export const TagRequestSchema = z.object({ hiderPlayerId: z.uuid() });
export const TagRequestResponseSchema = z.object({ requestId: z.uuid(), accept: z.boolean() });
export const TokenSchema = z.object({ token: z.string().min(10).max(4096) });
