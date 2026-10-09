import { chmodSync, existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Store } from "../server/db/store";
import type { CatalogItem } from "../server/domain/model";
import {
  applyPanPriceUpdate,
  planPanPriceUpdate,
} from "../server/domain/pan-price-update";
/**
 * Targeted Pan de Muerto price update (October 2026).
 *   plan   read-only: what would change, and proof nothing else would.
 *   apply  verified backup, then one transactional write of price fields only.
 * Running apply again changes nothing. Prices are public; no secrets are read.
 */
const fingerprint = (items: CatalogItem[]) =>
  createHash("sha256").update(JSON.stringify(items)).digest("hex").slice(0, 16);
const others = (items: CatalogItem[]) =>
  items.filter((p) => !p.id.startsWith("pan-de-muerto-"));
try {
  process.umask(0o077);
  const mode = process.argv[2];
  const path = process.env.DB_PATH;
  if (
    !["plan", "apply"].includes(mode ?? "") ||
    !path?.startsWith("/") ||
    !existsSync(path)
  )
    throw new Error("usage");
  if (mode === "plan") {
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      const row = db
        .prepare("SELECT document FROM commerce_state WHERE id=1")
        .get() as { document: string };
      const catalog = (JSON.parse(row.document).catalog ?? []) as CatalogItem[];
      const plan = planPanPriceUpdate(catalog);
      console.log(
        JSON.stringify({
          mode,
          catalogItems: catalog.length,
          catalogFingerprint: fingerprint(catalog),
          untouchedFingerprint: fingerprint(others(catalog)),
          willChange: plan.change,
          alreadyCurrent: plan.current.length,
          blocked: plan.blocked,
          safeToApply: plan.blocked.length === 0,
        }),
      );
    } finally {
      db.close();
    }
  } else {
    if (
      !["staging", "production"].includes(process.env.APP_ENV ?? "") ||
      !process.env.BACKUP_DIR?.startsWith("/")
    )
      throw new Error("usage");
    const store = new Store(
      path,
      process.env.APP_ENV === "production"
        ? "release-production"
        : "release-staging",
    );
    try {
      const before = store.read().catalog ?? [];
      const plan = planPanPriceUpdate(before);
      if (plan.blocked.length) {
        console.log(
          JSON.stringify({ mode, applied: false, blocked: plan.blocked }),
        );
        process.exitCode = 1;
      } else if (!plan.change.length) {
        console.log(
          JSON.stringify({
            mode,
            applied: false,
            reason: "already current",
            alreadyCurrent: plan.current.length,
          }),
        );
      } else {
        const backup = resolve(
          process.env.BACKUP_DIR,
          `pan-prices-${randomUUID()}.sqlite`,
        );
        await store.backup(backup);
        chmodSync(backup, 0o600);
        let written = 0;
        store.write((s) => {
          // Re-planned inside the write so a concurrent change cannot slip through.
          const current = s.catalog ?? [];
          const next = applyPanPriceUpdate(current);
          written = next.filter(
            (p, i) => p.priceFils !== current[i]!.priceFils,
          ).length;
          s.catalog = next;
          s.audit.push({
            at: new Date().toISOString(),
            actor: "catalog-admin",
            action: `Approved Pan de Muerto prices applied: ${written} price fields; backup created`,
          });
        });
        const after = store.read().catalog ?? [];
        console.log(
          JSON.stringify({
            mode,
            applied: true,
            priceFieldsWritten: written,
            catalogItems: after.length,
            untouchedBefore: fingerprint(others(before)),
            untouchedAfter: fingerprint(others(after)),
            untouchedIdentical:
              fingerprint(others(before)) === fingerprint(others(after)),
            remaining: planPanPriceUpdate(after).change.length,
            backup,
          }),
        );
      }
    } finally {
      store.close();
    }
  }
} catch {
  console.error(
    "Pan price update refused. Usage: DB_PATH=/abs/state.sqlite node update-pan-prices.js plan | apply (apply also needs APP_ENV and BACKUP_DIR). Nothing was written.",
  );
  process.exitCode = 1;
}
