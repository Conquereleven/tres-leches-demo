import type { Store } from "../db/store";
import { zoneSeed } from "./zones";
import { join } from "node:path";
import { mkdirSync, chmodSync } from "node:fs";
import { randomUUID } from "node:crypto";
const marker = "migration:approved-delivery-pickup-2026-10";
/** One-time rules update. Backup precedes the only mutation; orders/payments are never rewritten. */
export async function applyApprovedDeliveryRules(
  store: Store,
  backupDir: string,
) {
  if (store.read().events[marker]) return null;
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const backupPath = join(
    backupDir,
    `before-delivery-rules-${randomUUID()}.sqlite`,
  );
  await store.backup(backupPath);
  chmodSync(backupPath, 0o600);
  store.write((s) => {
    if (s.events[marker]) return;
    const approved = zoneSeed.map((zone) => {
      const existing = s.zones.find((z) => z.id === zone.id);
      return {
        ...existing,
        ...zone,
        aliases: [...new Set([...zone.aliases, ...(existing?.aliases ?? [])])],
        version: (existing?.version ?? 0) + 1,
      };
    });
    // Retired combined Palm rules remain available to historical IDs, never as active choices.
    const retired = s.zones
      .filter((z) => !approved.some((a) => a.id === z.id))
      .map((z) => ({ ...z, active: false, version: z.version + 1 }));
    s.zones = [...approved, ...retired];
    s.events[marker] = "resolved";
  });
  return backupPath;
}
