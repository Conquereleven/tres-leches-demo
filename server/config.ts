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
