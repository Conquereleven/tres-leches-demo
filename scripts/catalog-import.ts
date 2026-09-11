import { readFileSync, chmodSync, existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { CatalogItem } from "../server/domain/model";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../server/db/store";
import { validateCatalog, importCatalog } from "../server/domain/catalog";
// Explicit local administrator invocation. Do not print source content or validation payloads.
try {
  process.umask(0o077);
  const [mode, file] = process.argv.slice(2);
  if (!["dry-run", "apply", "rollback"].includes(mode ?? "") || !file)
    throw new Error();
  let raw: unknown;
  if (mode === "rollback") {
    const backupDb = new DatabaseSync(file, { readOnly: true });
    try {
      const row = backupDb
        .prepare("SELECT document FROM commerce_state WHERE id=1")
        .get() as { document: string };
      const previous = JSON.parse(row.document).catalog as
        CatalogItem[] | undefined;
      raw = {
        version: 1,
        items: (previous ?? []).map(({ priceFils, ...item }) => ({
          ...item,
          priceAed: (priceFils / 100).toFixed(2),
        })),
      };
    } finally {
      backupDb.close();
    }
  } else raw = JSON.parse(readFileSync(file, "utf8"));
  const products = validateCatalog(raw);
  if (mode === "dry-run")
    console.log(JSON.stringify({ valid: true, count: products.length }));
  else {
    if (
      !["staging", "production"].includes(process.env.APP_ENV ?? "") ||
      !process.env.DB_PATH?.startsWith("/") ||
      !existsSync(process.env.DB_PATH) ||
      !process.env.BACKUP_DIR?.startsWith("/")
    )
      throw new Error();
    const store = new Store(
      process.env.DB_PATH,
      process.env.APP_ENV === "production"
        ? "release-production"
        : "release-staging",
    );
    try {
      const backup = resolve(
        process.env.BACKUP_DIR,
        `catalog-${randomUUID()}.sqlite`,
      );
      const result = await importCatalog(store, raw, true, backup);
      chmodSync(backup, 0o600);
      console.log(JSON.stringify({ ...result, backup }));
    } finally {
      store.close();
    }
  }
} catch {
  console.error(
    "Catalog rejected. Check schema, unique SKU, positive decimal price and staging/backup configuration. No source data logged.",
  );
  process.exitCode = 1;
}
