import { z } from "zod";
import { metaNumbersSchema } from "./adapters/meta";
export function integrationConfig(env: NodeJS.ProcessEnv) {
  if (env.INTEGRATION_MODE !== "true") return null;
  const config = z
    .object({
      PAYMENNT_API_KEY: z.string().min(1),
      PAYMENNT_API_SECRET: z.string().min(1),
      META_ACCESS_TOKEN: z.string().min(1),
      META_APP_SECRET: z.string().min(24),
      META_VERIFY_TOKEN: z.string().min(24),
      META_GRAPH_VERSION: z.string().regex(/^v\d+\.0$/),
      MAPBOX_ACCESS_TOKEN: z.string().min(1),
      MAPBOX_PERMANENT_ENABLED: z.literal("true"),
      DB_PATH: z.string().startsWith("/"),
      APP_ORIGIN: z.url().startsWith("https://"),
      OPERATOR_USERS_JSON: z.string().min(2),
    })
    .parse(env);
  // This sprint permits merchant TEST payments only. A future reviewed pilot release must enable live charging.
  if (env.PAYMENNT_ENVIRONMENT && env.PAYMENNT_ENVIRONMENT !== "test")
    throw new Error("Live payments disabled pending PILOT READY review");
  return {
    ...config,
    paymentTemplate: env.META_PAYMENT_TEMPLATE_JSON
      ? z
          .object({
            name: z.string().regex(/^[a-z0-9_]+$/),
            language: z.string().min(2).max(10),
          })
          .strict()
          .parse(JSON.parse(env.META_PAYMENT_TEMPLATE_JSON))
      : undefined,
    numbers: metaNumbersSchema.parse(JSON.parse(env.META_NUMBERS_JSON ?? "[]")),
  };
}

export const usersSchema = z
  .array(
    z.object({
      id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
      role: z.enum(["admin", "manager", "operator", "agent"]),
      salt: z.string().min(16),
      hash: z.string().regex(/^[a-f0-9]{128}$/),
    }),
  )
  .max(100)
  .refine(
    (users) => new Set(users.map((u) => u.id)).size === users.length,
    "User IDs must be unique",
  );
const httpsOrigin = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.origin === value &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}, "APP_ORIGIN must be an HTTPS origin without path/query/credentials");
export function runtimeConfig(env: NodeJS.ProcessEnv) {
  // NODE_ENV controls framework optimizations, not authorization to operate production.
  const environment = z
    .enum(["development", "test", "staging", "production"])
    .parse(
      env.APP_ENV ??
        (env.NODE_ENV === "test" ||
        (env.DEMO_MODE === "true" && env.NODE_ENV === "production")
          ? "test"
          : env.NODE_ENV === "production"
            ? "production"
            : "development"),
    );
  if (environment === "production")
    throw new Error(
      "Production disabled: explicit release approval and reviewed activation required",
    );
  if (env.PAYMENNT_ENVIRONMENT && env.PAYMENNT_ENVIRONMENT !== "test")
    throw new Error("Paymennt live activation is disabled");
  if (env.META_OUTBOUND_ENABLED && env.META_OUTBOUND_ENABLED !== "false")
    throw new Error("Real WhatsApp sends are disabled in TL-18");
  if (environment !== "staging")
    return { environment, staging: null, sessionTtlSeconds: 28800 };
  const staging = z
    .object({
      APP_ORIGIN: httpsOrigin,
      DB_PATH: z
        .string()
        .startsWith("/")
        .refine((p) => !p.split("/").includes("..")),
      PERSISTENT_VOLUME_CONFIRMED: z.literal("true"),
      BACKUP_DIR: z
        .string()
        .startsWith("/")
        .refine((p) => !p.split("/").includes("..")),
      BACKUP_INTERVAL_MINUTES: z.coerce.number().int().min(15).max(1440),
      BACKUP_RETENTION_COUNT: z.coerce.number().int().min(2).max(168),
      SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(28800),
      SESSION_SECURE: z.literal("true"),
      SAFE_LOGS: z.literal("true"),
      WEBHOOK_SECRET: z.string().min(24),
      PROVIDER_MODE: z.enum(["offline", "test"]),
      PAYMENNT_ENVIRONMENT: z.literal("test"),
      META_OUTBOUND_ENABLED: z.literal("false"),
      OPERATOR_USERS_JSON: z.string().min(2),
      STAGING_SEED: z.enum(["empty", "uat"]),
    })
    .parse(env);
  if (env.DEMO_MODE === "true")
    throw new Error("Staging cannot enable demo mode");
  if (env.INTEGRATION_MODE === "true")
    throw new Error("Staging uses PROVIDER_MODE, not legacy INTEGRATION_MODE");
  const users = usersSchema.parse(JSON.parse(staging.OPERATOR_USERS_JSON));
  for (const role of ["admin", "manager", "operator"])
    if (!users.some((u) => u.role === role))
      throw new Error(`Staging requires a configured ${role} user`);
  return {
    environment,
    staging,
    sessionTtlSeconds: staging.SESSION_TTL_SECONDS,
  };
}
