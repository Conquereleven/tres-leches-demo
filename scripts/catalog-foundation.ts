import { DatabaseSync } from "node:sqlite";
import { resolve, isAbsolute } from "node:path";
import {
  loadBootstrapSources,
  planCatalogBootstrap,
  applyCatalogBootstrap,
} from "../server/catalog/bootstrap";
import { Store } from "../server/db/store";
import type { State } from "../server/domain/model";

// No Production support in Sprint 1A. Dry-run uses a genuinely read-only connection.
try {
  const mode = process.argv[2];
  const path = process.env.DB_PATH;
  if (!["dry-run", "apply"].includes(mode ?? "") || !path || !isAbsolute(path))
    throw new Error("Explicit mode and absolute DB_PATH required");
  if (
    process.env.NODE_ENV === "production" ||
    !["test", "development"].includes(process.env.APP_ENV ?? "")
  )
    throw new Error("Only isolated test/development databases are allowed");
  const sources = loadBootstrapSources(resolve("."));
  const db = new DatabaseSync(path, { readOnly: true });
  let state: State;
  try {
    const profile = db
      .prepare("SELECT mode FROM runtime_profile WHERE id=1")
      .get() as { mode: string } | undefined;
    if (profile?.mode !== process.env.APP_ENV)
      throw new Error("Database profile mismatch");
    const row = db
      .prepare("SELECT document FROM commerce_state WHERE id=1")
      .get() as { document: string };
    state = JSON.parse(row.document);
  } finally {
    db.close();
  }
  const plan = planCatalogBootstrap(state.catalog ?? [], sources);
  console.log(JSON.stringify({ mode: "dry-run", ...plan.report }));
  if (!plan.report.valid)
    throw new Error("Catalog discrepancies block bootstrap");
  if (mode === "apply") {
    const store = new Store(
      path,
      process.env.APP_ENV as "test" | "development",
    );
    try {
      console.log(JSON.stringify(applyCatalogBootstrap(store, sources)));
    } finally {
      store.close();
    }
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Catalog bootstrap failed",
  );
  process.exitCode = 1;
}
