import { PAN_OCT13_CORRECTION } from "../server/domain/pan-price-correction";
import { rebaseFoundation } from "../server/catalog/contract";
import { chmodSync, existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Store } from "../server/db/store";
import type { CatalogItem } from "../server/domain/model";
import {
  PAN_PRICE_CHANGES,
  applyPanPriceUpdate,
  planPanPriceUpdate,
} from "../server/domain/pan-price-update";
/**
 * Targeted Pan de Muerto price update (October 2026).
 *   plan   read-only: what would change, and proof nothing else would.
 *   apply  verified backup, then one transactional write of price fields only.
 * Running apply again changes nothing. Prices are public; no secrets are read.
 */
const fingerprint = (items: unknown) =>
  createHash("sha256").update(JSON.stringify(items)).digest("hex").slice(0, 16);
const others = (
  items: CatalogItem[],
  changes: Readonly<Record<string, [number, number]>>,
) =>
  items.map(({ priceFils, ...p }) => ({
    ...p,
    priceFils: p.id in changes ? null : priceFils,
  }));
try {
  process.umask(0o077);
  const argument = process.argv[2];
  const correction = argument?.endsWith("-oct13");
  const mode = correction ? argument!.replace("-oct13", "") : argument;
  const changes = correction ? PAN_OCT13_CORRECTION : PAN_PRICE_CHANGES;
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
      const plan = planPanPriceUpdate(catalog, changes);
      console.log(
        JSON.stringify({
          mode,
          catalogItems: catalog.length,
          catalogFingerprint: fingerprint(catalog),
          untouchedFingerprint: fingerprint(others(catalog, changes)),
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
      const beforeState = store.read();
      const before = beforeState.catalog ?? [];
      const plan = planPanPriceUpdate(before, changes);
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
        const restored = new DatabaseSync(backup, { readOnly: true });
        try {
          const row = restored
            .prepare("SELECT document FROM commerce_state WHERE id=1")
            .get() as { document: string };
          const state = JSON.parse(row.document);
          if (fingerprint(state) !== fingerprint(beforeState))
            throw new Error("Backup catalog does not match plan");
        } finally {
          restored.close();
        }
        let written = 0;
        store.write((s) => {
          // Re-planned inside the write so a concurrent change cannot slip through.
          const protectedState = () =>
            fingerprint({
              ...s,
              catalog: undefined,
              catalogFoundation: undefined,
              audit: undefined,
            });
          const protectedBefore = protectedState();
          const current = s.catalog ?? [];
          const next = applyPanPriceUpdate(current, changes);
          written = next.filter(
            (p, i) => p.priceFils !== current[i]!.priceFils,
          ).length;
          s.catalog = next;
          rebaseFoundation(s, new Date().toISOString());
          if (protectedState() !== protectedBefore)
            throw new Error("Protected business state changed");
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
            untouchedBefore: fingerprint(others(before, changes)),
            untouchedAfter: fingerprint(others(after, changes)),
            untouchedIdentical:
              fingerprint(others(before, changes)) ===
              fingerprint(others(after, changes)),
            remaining: planPanPriceUpdate(after, changes).change.length,
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
