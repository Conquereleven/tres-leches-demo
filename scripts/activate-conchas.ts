import { rebaseFoundation } from "../server/catalog/contract";
import { chmodSync, existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Store } from "../server/db/store";
import type { CatalogItem } from "../server/domain/model";
import { applyConchasActivation, planConchasActivation, CONCHAS_TO_ACTIVATE } from "../server/domain/conchas-activation";

/** Backed-up, targeted availability activation. No full-catalog import. */
const fingerprint = (items: CatalogItem[]) =>
  createHash("sha256").update(JSON.stringify(items)).digest("hex").slice(0, 16);
const others = (items: CatalogItem[]) => items.filter(p => !(p.id in CONCHAS_TO_ACTIVATE));
try {
  process.umask(0o077);
  const mode = process.argv[2], path = process.env.DB_PATH;
  if (!["plan", "apply"].includes(mode ?? "") || !path?.startsWith("/") || !existsSync(path)) throw Error("usage");
  if (mode === "plan") {
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      const row = db.prepare("SELECT document FROM commerce_state WHERE id=1").get() as { document: string } | undefined;
      if (!row) throw Error("no commerce state");
      const catalog = (JSON.parse(row.document).catalog ?? []) as CatalogItem[];
      const plan = planConchasActivation(catalog);
      console.log(JSON.stringify({ mode, catalogItems: catalog.length, catalogFingerprint: fingerprint(catalog), untouchedFingerprint: fingerprint(others(catalog)), willChange: plan.change, alreadyCurrent: plan.current, blocked: plan.blocked, safeToApply: plan.safeToApply }));
    } finally { db.close(); }
  } else {
    if (!["staging", "production"].includes(process.env.APP_ENV ?? "") || !process.env.BACKUP_DIR?.startsWith("/")) throw Error("usage");
    const store = new Store(path, process.env.APP_ENV === "production" ? "release-production" : "release-staging");
    try {
      const before = store.read().catalog ?? [];
      const plan = planConchasActivation(before);
      if (!plan.safeToApply) {
        console.log(JSON.stringify({ mode, applied: false, blocked: plan.blocked }));
        process.exitCode = 1;
      } else if (!plan.change.length) {
        console.log(JSON.stringify({ mode, applied: false, reason: "already current", alreadyCurrent: plan.current.length }));
      } else {
        const backup = resolve(process.env.BACKUP_DIR!, `conchas-activation-${randomUUID()}.sqlite`);
        await store.backup(backup);
        chmodSync(backup, 0o600);
        let written = 0;
        store.write(s => {
          const current = s.catalog ?? [];
          const next = applyConchasActivation(current);
          written = next.filter((item,i) => item.active !== current[i]!.active || item.availability !== current[i]!.availability).length;
          if (written !== plan.change.length) throw Error("Concurrent catalog change");
          s.catalog = next;
          rebaseFoundation(s, new Date().toISOString());
          s.audit.push({ at: new Date().toISOString(), actor: "catalog-admin", action: `Approved Conchas activated: ${written} SKUs; verified backup created` });
        });
        const after = store.read().catalog ?? [];
        console.log(JSON.stringify({ mode, applied: true, activated: written, backup, remaining: planConchasActivation(after).change.length, catalogItems: after.length, untouchedBefore: fingerprint(others(before)), untouchedAfter: fingerprint(others(after)), untouchedIdentical: fingerprint(others(before)) === fingerprint(others(after)) }));
      }
    } finally { store.close(); }
  }
} catch {
  console.error("Conchas activation refused. Use DB_PATH=/abs/state.sqlite node dist/node/activate-conchas.js plan|apply (apply needs APP_ENV and BACKUP_DIR). Refused before modifying SKUs.");
  process.exitCode = 1;
}
