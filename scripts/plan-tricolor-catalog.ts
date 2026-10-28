/** PLAN ONLY. SQLite is opened read-only. No execute/apply mode exists. */
import { DatabaseSync } from "node:sqlite";
import { loadBootstrapSources } from "../server/catalog/bootstrap";
import { planTricolorCatalog } from "../server/catalog/tricolor-plan";
const path = process.argv[2];
if (!path)
  throw new Error(
    "Usage: node --import tsx scripts/plan-tricolor-catalog.ts /private/backup.sqlite",
  );
const db = new DatabaseSync(path, { readOnly: true });
try {
  if (db.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok")
    throw new Error("SQLite integrity failure");
  const row = db
    .prepare("SELECT document FROM commerce_state WHERE id=1")
    .get();
  if (!row || typeof row.document !== "string")
    throw new Error("State missing");
  console.log(
    JSON.stringify(
      planTricolorCatalog(
        JSON.parse(row.document),
        loadBootstrapSources(process.cwd()),
      ),
      null,
      2,
    ),
  );
} finally {
  db.close();
}
