import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { Store } from "../server/db/store";
import type { State } from "../server/domain/model";
import {
  applyFlexibleDelivery,
  planFlexibleDelivery,
} from "../server/domain/flexible-delivery";

// Explicit administrator tooling only. Never imported by runtime boot.
try {
  process.umask(0o077);
  const [mode, expectedDigest] = process.argv.slice(2);
  const path = process.env.DB_PATH;
  if (
    !path ||
    !isAbsolute(path) ||
    !existsSync(path) ||
    !["dry-run", "apply"].includes(mode ?? "")
  )
    throw new Error(
      "Use dry-run or apply <digest> with an existing absolute DB_PATH",
    );
  const db = new DatabaseSync(path, { readOnly: true });
  let state: State;
  let profile: string;
  try {
    state = JSON.parse(
      (
        db.prepare("SELECT document FROM commerce_state WHERE id=1").get() as {
          document: string;
        }
      ).document,
    );
    profile = (
      db.prepare("SELECT mode FROM runtime_profile WHERE id=1").get() as {
        mode: string;
      }
    ).mode;
  } finally {
    db.close();
  }
  const plan = planFlexibleDelivery(state.zones);
  if (mode === "dry-run") {
    console.log(JSON.stringify(plan, null, 2));
    if (!plan.valid) process.exitCode = 1;
  } else {
    if (
      !plan.valid ||
      expectedDigest !== plan.digest ||
      !process.env.BACKUP_DIR ||
      !isAbsolute(process.env.BACKUP_DIR) ||
      ![
        "test",
        "development",
        "release-staging",
        "release-production",
      ].includes(profile) ||
      !state.events["migration:tl25-commercial"]
    )
      throw new Error(
        "Apply requires a valid current digest, initialized profile and absolute BACKUP_DIR",
      );
    const store = new Store(
      path,
      profile as
        "test" | "development" | "release-staging" | "release-production",
    );
    try {
      console.log(
        JSON.stringify(
          await applyFlexibleDelivery(
            store,
            process.env.BACKUP_DIR,
            expectedDigest,
          ),
        ),
      );
    } finally {
      store.close();
    }
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Delivery policy operation failed",
  );
  process.exitCode = 1;
}
