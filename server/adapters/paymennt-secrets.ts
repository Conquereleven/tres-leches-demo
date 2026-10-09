import { readFileSync, statSync, realpathSync } from "node:fs";
import { resolve, dirname, basename, sep } from "node:path";
import { z } from "zod";
export const webhookSecretSchema = z.object({
  id: z.string().min(1),
  hmacKey: z.string().min(1),
  address: z.string().url().startsWith("https://"),
});
export function privateSecretPath(path: string) {
  if (!path.startsWith("/"))
    throw new Error("Absolute private secret path required");
  const canonical = resolve(realpathSync(dirname(path)), basename(path));
  const checkout = realpathSync(process.cwd());
  if (canonical === checkout || canonical.startsWith(checkout + sep))
    throw new Error("Secrets must be outside checkout and static assets");
  return canonical;
}
export function loadWebhookSecret(path?: string) {
  if (!path) return null;
  if (!path.startsWith("/"))
    throw new Error("Absolute private secret path required");
  privateSecretPath(realpathSync(path));
  const stat = statSync(path);
  if (!stat.isFile() || stat.mode & 0o077)
    throw new Error("Webhook secret file must be private (0600)");
  return webhookSecretSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}
