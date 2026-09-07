import { z } from "zod";
import { catalog, locationSchema, states, zoneSchema } from "./model";
const base = {
  id: z.string().min(1).max(100),
  version: z.number().int().nonnegative(),
};
export const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("assign"),
    ...base,
    agent: z.string().max(100).nullable(),
  }),
  z.object({
    type: z.literal("conversationStatus"),
    ...base,
    status: z.enum(["open", "closed"]),
  }),
  z.object({ type: z.literal("read"), ...base }),
  z.object({
    type: z.literal("send"),
    ...base,
    text: z.string().trim().min(1).max(4000),
  }),
  z.object({ type: z.literal("createOrder"), ...base }),
  z.object({
    type: z.literal("editOrder"),
    ...base,
    lines: z
      .array(
        z.object({
          productId: z
            .string()
            .refine((id) => catalog.some((p) => p.id === id)),
          quantity: z.number().int().min(1).max(100),
        }),
      )
      .max(30),
  }),
  z
    .object({
      type: z.literal("location"),
      ...base,
      address: z.string().trim().min(2).max(500).optional(),
      location: locationSchema.optional(),
    })
    .refine(
      (v) => !!v.address !== !!v.location,
      "Provide either address or GPS",
    ),
  z.object({
    type: z.literal("manualZone"),
    ...base,
    zoneId: z.string(),
    reason: z.string().trim().min(5).max(300),
  }),
  z.object({ type: z.literal("requestPayment"), ...base }),
  z.object({ type: z.literal("resendPayment"), ...base }),
  z.object({ type: z.literal("transition"), ...base, state: z.enum(states) }),
  z.object({ type: z.literal("updateZone"), zone: zoneSchema }),
  z.object({ type: z.literal("retryJob"), id: z.string() }),
]);
export type Command = z.infer<typeof commandSchema>;
export const inboundSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    eventId: z.string().min(1).max(150),
    sourceNumberId: z.string(),
    phone: z.string().regex(/^\+?[0-9]{7,16}$/),
    at: z.iso.datetime().optional(),
    customer: z.string().min(1).max(100),
    text: z.string().max(4000),
    location: locationSchema.optional(),
  }),
  z.object({
    type: z.literal("status"),
    eventId: z.string().min(1).max(150),
    providerId: z.string(),
    status: z.enum(["sent", "delivered", "read", "failed"]),
  }),
]);
export const paymentEventSchema = z
  .object({
    eventId: z.string().min(1).max(150),
    reference: z.string(),
    transactionId: z.string().min(1).max(150),
    status: z.enum(["paid", "failed", "expired"]),
    amountFils: z.number().int().positive(),
    currency: z.literal("AED"),
  })
  .strict();
