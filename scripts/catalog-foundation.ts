import { DatabaseSync, backup } from "node:sqlite";
import { chmodSync, existsSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { loadBootstrapSources } from "../server/catalog/bootstrap";
import {
  BootstrapRefused,
  applyFoundation,
  auditFoundation,
  catalogFingerprint,
  deactivateRetired,
  revertFoundation,
} from "../server/catalog/foundation-audit";
import { Store } from "../server/db/store";
import type { State } from "../server/domain/model";

/**
 * Catalog foundation initialization.
 *   audit   read-only connection, any database profile, Production included.
 *   apply   verified backup, then one transaction that adds the foundation only.
 *   revert  removes only the foundation this tool added, while nothing depends on it.
 *   retire-removed  separate approval: stores the removed 9 October combinations as
 *           inactive. The only mode that touches the commercial catalog.
 * Output is catalog facts and counts. No customer, order, payment or secret is printed.
 * Documentation: docs/product-hub/foundation-bootstrap.md
 */
const PROFILES = {
  test: "test",
  development: "development",
  staging: "release-staging",
  production: "release-production",
} as const;
const CONFIRM = "initialize-production-catalog-foundation";
const CONFIRM_RETIRE = "deactivate-removed-pan-de-muerto-combinations";
class Usage extends Error {}

function readOnly(path: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const profile =
      (
        db.prepare("SELECT mode FROM runtime_profile WHERE id=1").get() as
          { mode: string } | undefined
      )?.mode ?? null;
    const row = db
      .prepare("SELECT document FROM commerce_state WHERE id=1")
      .get() as { document: string } | undefined;
    if (!row) throw new Usage("The database has no commerce state");
    const integrity = (
      db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }
    ).integrity_check;
    return { profile, state: JSON.parse(row.document) as State, integrity };
  } finally {
    db.close();
  }
}
/** Taken from a read-only connection, before anything opens the database for writing. */
async function verifiedBackup(path: string, directory: string, state: State) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const dir = realpathSync(directory);
  const dbDir = realpathSync(dirname(path));
  if (dir === dbDir || dbDir.startsWith(dir + sep))
    throw new Usage("BACKUP_DIR must be separate from the database directory");
  const destination = resolve(dir, `catalog-foundation-${randomUUID()}.sqlite`);
  const source = new DatabaseSync(path, { readOnly: true });
  try {
    await backup(source, destination);
  } finally {
    source.close();
  }
  chmodSync(destination, 0o600);
  const copy = readOnly(destination);
  if (copy.integrity !== "ok") throw new Error("Backup integrity check failed");
  // A backup taken a moment later may hold newer orders; it must hold the same catalog.
  if (
    catalogFingerprint(copy.state.catalog ?? []) !==
    catalogFingerprint(state.catalog ?? [])
  )
    throw new BootstrapRefused(
      "The catalog changed during backup; audit again",
    );
  return destination;
}

let wrote = false;
try {
  process.umask(0o077);
  const mode = process.argv[2] === "dry-run" ? "audit" : process.argv[2];
  const path = process.env.DB_PATH;
  if (!["audit", "apply", "revert", "retire-removed"].includes(mode ?? ""))
    throw new Usage("Mode must be audit, apply, revert or retire-removed");
  if (!path || !isAbsolute(path) || !existsSync(path))
    throw new Usage("DB_PATH must be an absolute path to an existing database");
  const sources = loadBootstrapSources(
    resolve(process.env.SOURCES_ROOT ?? "."),
  );
  const first = readOnly(path);
  const audit = auditFoundation(first.state, sources, first.profile);

  if (mode === "audit") {
    console.log(
      JSON.stringify(
        { mode, integrity: first.integrity, ...audit },
        null,
        process.argv.includes("--pretty") ? 2 : 0,
      ),
    );
    if (audit.decision === "BLOCKED") process.exitCode = 2;
  } else {
    const env = process.env.APP_ENV ?? "";
    const profile = PROFILES[env as keyof typeof PROFILES];
    if (!profile) throw new Usage("APP_ENV must name the target environment");
    if (first.profile !== profile)
      throw new Usage("APP_ENV does not match the database profile");
    const confirm = mode === "retire-removed" ? CONFIRM_RETIRE : CONFIRM;
    if (env === "production" && process.env.CONFIRM !== confirm)
      throw new Usage(`Production needs CONFIRM=${confirm}`);
    if (mode === "retire-removed") {
      const catalog = process.env.EXPECT_CATALOG ?? "";
      const backupDir = process.env.BACKUP_DIR ?? "";
      if (!/^[a-f0-9]{64}$/.test(catalog) || !isAbsolute(backupDir))
        throw new Usage(
          "EXPECT_CATALOG and an absolute BACKUP_DIR are required",
        );
      if (first.integrity !== "ok")
        throw new Usage("Database integrity failed");
      if (audit.database.catalogFingerprint !== catalog)
        throw new BootstrapRefused(
          "The catalog no longer matches the audited fingerprint; audit again",
        );
      const saved = await verifiedBackup(path, backupDir, first.state);
      const store = new Store(path, profile);
      let result;
      try {
        result = deactivateRetired(store, catalog, new Date().toISOString());
        wrote = result.changed.length > 0;
      } finally {
        store.close();
      }
      const after = readOnly(path);
      const check = auditFoundation(after.state, sources, after.profile);
      console.log(
        JSON.stringify({
          mode,
          ...result,
          backup: saved,
          catalogAfter: check.database.catalogFingerprint,
          remainingDiscrepancies: check.discrepancies.length,
          decision: check.decision,
          integrity: after.integrity,
        }),
      );
    } else {
      const revision = process.env.EXPECT_REVISION ?? "";
      const backupDir = process.env.BACKUP_DIR ?? "";
      if (!/^catalog-v1-[a-f0-9]{64}$/.test(revision))
        throw new Usage("EXPECT_REVISION must be the revision from the audit");
      if (!isAbsolute(backupDir))
        throw new Usage("BACKUP_DIR must be an absolute path");
      if (first.integrity !== "ok")
        throw new Usage("Database integrity failed");

      if (mode === "apply") {
        const catalog = process.env.EXPECT_CATALOG ?? "";
        if (!/^[a-f0-9]{64}$/.test(catalog))
          throw new Usage(
            "EXPECT_CATALOG must be the fingerprint from the audit",
          );
        if (audit.decision === "BLOCKED") {
          console.log(
            JSON.stringify({ mode, applied: false, blockers: audit.blockers }),
          );
          process.exitCode = 2;
        } else if (audit.decision === "ALREADY_INITIALIZED") {
          console.log(
            JSON.stringify({
              mode,
              applied: false,
              reason: "already initialized",
              revision: audit.foundation.storedRevision,
            }),
          );
        } else {
          // Checked again inside the transaction; refusing here avoids a needless backup.
          if (
            audit.database.catalogFingerprint !== catalog ||
            audit.foundation.plannedRevision !== revision
          )
            throw new BootstrapRefused(
              "The database no longer matches the audited fingerprints; audit again",
            );
          const saved = await verifiedBackup(path, backupDir, first.state);
          const store = new Store(path, profile);
          let result;
          try {
            result = applyFoundation(store, sources, {
              catalogFingerprint: catalog,
              plannedRevision: revision,
              profile,
            });
            wrote = result.applied;
          } finally {
            store.close();
          }
          const after = readOnly(path);
          const check = auditFoundation(after.state, sources, after.profile);
          console.log(
            JSON.stringify({
              mode,
              ...result,
              backup: saved,
              catalogBefore: audit.database.catalogFingerprint,
              catalogAfter: check.database.catalogFingerprint,
              catalogIdentical:
                audit.database.catalogFingerprint ===
                check.database.catalogFingerprint,
              foundation: check.foundation.status,
              integrity: after.integrity,
            }),
          );
        }
      } else {
        if (first.state.catalogFoundation?.revision.id !== revision)
          throw new BootstrapRefused(
            "The stored revision is not the expected one",
          );
        const saved = await verifiedBackup(path, backupDir, first.state);
        const store = new Store(path, profile);
        let result;
        try {
          result = revertFoundation(store, revision);
          wrote = result.reverted;
        } finally {
          store.close();
        }
        const after = readOnly(path);
        console.log(
          JSON.stringify({
            mode,
            ...result,
            backup: saved,
            catalogIdentical:
              audit.database.catalogFingerprint ===
              catalogFingerprint(after.state.catalog ?? []),
            foundationPresent: !!after.state.catalogFoundation,
            integrity: after.integrity,
          }),
        );
      }
    }
  }
} catch (error) {
  // Messages are authored here; database content never reaches the error stream.
  const state = wrote
    ? "The change was committed; run audit to confirm."
    : "Nothing was written.";
  console.error(
    error instanceof Usage || error instanceof BootstrapRefused
      ? `Refused: ${error.message}. ${state}`
      : `Catalog foundation tool failed. ${state}`,
  );
  process.exitCode = 1;
}
