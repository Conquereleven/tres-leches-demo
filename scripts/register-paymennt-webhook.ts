import { renameSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { privateSecretPath } from "../server/adapters/paymennt-secrets";
import { openSync, writeSync, fsyncSync, closeSync } from "node:fs";
import { PaymenntProvider } from "../server/adapters/paymennt";
// No automatic retry: an uncertain POST may have succeeded. Recover with provider support.
let fd: number | undefined;
try {
  process.umask(0o077);
  const live =
    process.env.APP_ENV === "production" &&
    process.env.PAYMENNT_ENVIRONMENT === "live" &&
    process.env.PROVIDER_MODE === "live" &&
    process.env.APP_ORIGIN === "https://www.3ldubai.ae";
  const test =
    process.env.APP_ENV === "staging" &&
    process.env.PAYMENNT_ENVIRONMENT === "test" &&
    process.env.PROVIDER_MODE === "test";
  if (process.argv[2] !== "register" || !(live || test)) throw new Error();
  const file = process.env.PAYMENNT_WEBHOOK_SECRET_FILE;
  const origin = new URL(process.env.APP_ORIGIN ?? "");
  if (
    !file?.startsWith("/") ||
    origin.protocol !== "https:" ||
    origin.origin !== process.env.APP_ORIGIN
  )
    throw new Error();
  const provider = new PaymenntProvider({
    apiKey: process.env.PAYMENNT_API_KEY ?? "",
    apiSecret: process.env.PAYMENNT_API_SECRET ?? "",
    environment: live ? "live" : "test",
  });
  if (live && file !== "/data/secrets/paymennt-live-webhook.json")
    throw new Error();
  // Exclusive durable intent prevents accidental second registration even after timeout/crash.
  privateSecretPath(file);
  fd = openSync(file, "wx", 0o600);
  writeSync(
    fd,
    "REGISTRATION PENDING — DO NOT RETRY; verify merchant webhook configuration",
  );
  fsyncSync(fd);
  const secret = await provider.registerWebhook(
    origin.origin + "/api/webhooks/payment",
  );
  const pending = file + "." + randomUUID() + ".received";
  const received = openSync(pending, "wx", 0o600);
  try {
    writeSync(received, JSON.stringify(secret));
    fsyncSync(received);
  } finally {
    closeSync(received);
  }
  renameSync(pending, file);
  const parent = openSync(dirname(file), "r");
  try {
    fsyncSync(parent);
  } finally {
    closeSync(parent);
  }
  console.log(
    JSON.stringify({
      status: "WEBHOOK CONFIGURED",
      id: secret.id,
      address: secret.address,
    }),
  );
} catch {
  console.error(
    "WEBHOOK NOT CONFIGURED. Inspect private registration state; never retry an uncertain registration blindly.",
  );
  process.exitCode = 1;
} finally {
  if (fd !== undefined) closeSync(fd);
}
