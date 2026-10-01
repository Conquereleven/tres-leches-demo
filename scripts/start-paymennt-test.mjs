/** Explicit TEST-only release entrypoint. Never the default production start command. */
import { DatabaseSync, backup } from "node:sqlite";
import {
  readFileSync,
  writeFileSync,
  chmodSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { join, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
try {
  process.umask(0o077);
  const e = process.env;
  if (
    e.RAILWAY_PROJECT_ID !== "1f9a94c1-0574-49a9-b579-bf6af3aad601" ||
    e.RAILWAY_ENVIRONMENT_ID !== "b32d77cf-6597-4b3e-9810-caf275bffb68" ||
    e.RAILWAY_SERVICE_ID !== "fe8c1417-39ca-4038-b94e-68659ab1c659" ||
    e.APP_ENV !== "staging" ||
    e.PROVIDER_MODE !== "test" ||
    e.PAYMENNT_ENVIRONMENT !== "test" ||
    e.META_OUTBOUND_ENABLED !== "false" ||
    !e.DB_PATH ||
    !isAbsolute(e.DB_PATH) ||
    !e.BACKUP_DIR ||
    !isAbsolute(e.BACKUP_DIR)
  )
    throw Error("guard");
  const approved = JSON.parse(
    readFileSync("data-imports/liza-current-menu.json", "utf8"),
  );
  const db = new DatabaseSync(e.DB_PATH, { readOnly: true });
  let file;
  try {
    if (
      db.prepare("SELECT mode FROM runtime_profile WHERE id=1").get()?.mode !==
      "release-staging"
    )
      throw Error("profile");
    const state = JSON.parse(
      db.prepare("SELECT document FROM commerce_state WHERE id=1").get()
        .document,
    );
    const zone = state.zones.find((z) => z.id === "jlt-cluster-c");
    if (
      !zone?.active ||
      zone.minOrderAed !== 30 ||
      zone.deliveryFeeAed !== 0 ||
      zone.freeDelivery !== true
    )
      throw Error("zone");
    const current = state.catalog ?? [];
    const matches =
      current.length === approved.items.length &&
      approved.items.every((item) => {
        const existing = current.find((product) => product.id === item.id);
        return (
          existing?.name === item.name &&
          existing.priceFils === Math.round(Number(item.priceAed) * 100) &&
          existing.active === item.active &&
          existing.availability === item.availability &&
          existing.description === item.description
        );
      });
    console.log(
      JSON.stringify({
        catalogBefore: current.length,
        approvedItems: approved.items.length,
      }),
    );
    if (!matches) {
      mkdirSync(e.BACKUP_DIR, { recursive: true, mode: 0o700 });
      file = join(e.BACKUP_DIR, `approved-catalog-${randomUUID()}.json`);
      writeFileSync(file, JSON.stringify(approved), { mode: 0o600 });
      const dry = spawnSync(
        process.execPath,
        ["dist/node/catalog-import.js", "dry-run", file],
        { stdio: "pipe" },
      );
      if (dry.status !== 0) throw Error("validation");
      // First verified backup happens while the original DB is still read-only.
      const snapshot = join(
        e.BACKUP_DIR,
        `before-direct-checkout-${randomUUID()}.sqlite`,
      );
      await backup(db, snapshot);
      chmodSync(snapshot, 0o600);
      const check = new DatabaseSync(snapshot, { readOnly: true });
      try {
        if (
          check.prepare("PRAGMA integrity_check").get()?.integrity_check !==
          "ok"
        )
          throw Error("backup");
      } finally {
        check.close();
      }
      console.log(
        JSON.stringify({
          catalogValidated: true,
          backupVerified: true,
          backup: snapshot,
        }),
      );
    }
  } finally {
    db.close();
  }
  if (file) {
    try {
      const result = spawnSync(
        process.execPath,
        ["dist/node/catalog-import.js", "apply", file],
        { stdio: "pipe" },
      );
      if (result.status !== 0) throw Error("import");
    } finally {
      rmSync(file, { force: true });
    }
  }
  const verify = new DatabaseSync(e.DB_PATH, { readOnly: true });
  try {
    const state = JSON.parse(
      verify.prepare("SELECT document FROM commerce_state WHERE id=1").get()
        .document,
    );
    if (
      state.catalog.length !== approved.items.length ||
      state.catalog.some((product) => product.id === "pan-de-muerto") ||
      !approved.items.every((item) => {
        const product = state.catalog.find((product) => product.id === item.id);
        return (
          product?.priceFils === Math.round(Number(item.priceAed) * 100) &&
          product.active === true &&
          product.availability === "available"
        );
      })
    )
      throw Error("verification");
    console.log(
      JSON.stringify({
        catalogAfter: state.catalog.length,
        currency: "AED",
        approved: true,
      }),
    );
  } finally {
    verify.close();
  }
  await import("../dist/node/server.mjs");
} catch {
  console.error(
    "TEST checkout startup blocked: inspect target, catalog, confirmed zone and verified backup. No secret values logged.",
  );
  process.exitCode = 1;
}
