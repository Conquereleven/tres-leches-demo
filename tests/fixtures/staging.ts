import { scryptSync } from "node:crypto";
import { join } from "node:path";
const hash = scryptSync(
  "fixture-password-not-shipped",
  "fixture-salt-at-least-16",
  64,
).toString("hex");
export const stagingEnv = (dir: string): NodeJS.ProcessEnv => ({
  APP_ENV: "staging",
  NODE_ENV: "production",
  APP_ORIGIN: "https://staging.example.invalid",
  DB_PATH: join(dir, "db", "staging.sqlite"),
  PERSISTENT_VOLUME_CONFIRMED: "true",
  BACKUP_DIR: join(dir, "backups"),
  BACKUP_INTERVAL_MINUTES: "60",
  BACKUP_RETENTION_COUNT: "2",
  SESSION_TTL_SECONDS: "1800",
  SESSION_SECURE: "true",
  SAFE_LOGS: "true",
  WEBHOOK_SECRET: "fixture-secret-at-least-24-characters",
  PROVIDER_MODE: "offline",
  PAYMENNT_ENVIRONMENT: "test",
  META_OUTBOUND_ENABLED: "false",
  STAGING_SEED: "uat",
  OPERATOR_USERS_JSON: JSON.stringify(
    ["admin", "manager", "operator"].map((role) => ({
      id: `test-${role}`,
      role,
      salt: "fixture-salt-at-least-16",
      hash,
    })),
  ),
});
