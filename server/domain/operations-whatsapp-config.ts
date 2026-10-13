import { z } from "zod";
import type { MetaNumber } from "../adapters/meta";
import { parseNotificationCutoff } from "./notifications";

/** Independent internal channel. Never reads or changes META_OUTBOUND_ENABLED. */
export function operationsWhatsAppConfig(
  env: NodeJS.ProcessEnv,
  numbers: MetaNumber[],
  ready: boolean,
) {
  const enabled = env.OPERATIONS_WHATSAPP_ENABLED === "true";
  const recipient = env.WHATSAPP_MANAGER_PHONE?.replace(/[\s-]/g, "") ?? "";
  const sender = numbers.find(
    (n) => n.phoneNumberId === env.OPERATIONS_WHATSAPP_PHONE_NUMBER_ID,
  );
  let activationSince: string | undefined;
  let template:
    | { name: string; language: "en_US"; category: "UTILITY" | "MARKETING" }
    | undefined;
  try {
    activationSince = parseNotificationCutoff(
      env.OPERATIONS_WHATSAPP_ACTIVATION_SINCE,
    );
  } catch {
    /* Disable only this channel; checkout stays available. */
  }
  try {
    const parsed = z
      .object({
        name: z.string().regex(/^[a-z0-9_]{1,512}$/),
        language: z.literal("en_US"),
        category: z.enum(["UTILITY", "MARKETING"]),
      })
      .strict()
      .safeParse(JSON.parse(env.OPERATIONS_WHATSAPP_TEMPLATE_JSON ?? "null"));
    if (parsed.success) template = parsed.data;
  } catch {
    /* Invalid private configuration must never be logged. */
  }
  const missing = [
    ...(!ready ? ["META_CREDENTIALS"] : []),
    ...(!/^\+[1-9]\d{7,14}$/.test(recipient) ? ["WHATSAPP_MANAGER_PHONE"] : []),
    ...(!sender ? ["OPERATIONS_WHATSAPP_PHONE_NUMBER_ID"] : []),
    ...(!template ? ["OPERATIONS_WHATSAPP_TEMPLATE_JSON"] : []),
    ...(!activationSince || Date.parse(activationSince) > Date.now()
      ? ["OPERATIONS_WHATSAPP_ACTIVATION_SINCE"]
      : []),
    ...(env.OPERATIONS_WHATSAPP_SEND_PERMISSION_CONFIRMED !== "true"
      ? ["OPERATIONS_WHATSAPP_SEND_PERMISSION_CONFIRMED"]
      : []),
    ...(env.OPERATIONS_WHATSAPP_TEMPLATE_POLICY_CONFIRMED !== "true"
      ? ["OPERATIONS_WHATSAPP_TEMPLATE_POLICY_CONFIRMED"]
      : []),
    ...(sender &&
    recipient.replace(/\D/g, "") === sender.phone.replace(/\D/g, "")
      ? ["RECIPIENT_SOURCE_COLLISION"]
      : []),
  ];
  return {
    enabled,
    configured: missing.length === 0,
    missing,
    recipient,
    sender,
    template,
    activationSince,
  };
}
