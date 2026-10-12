import { DatabaseSync, backup } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { type State } from "../domain/model";
import { zoneSeed } from "../domain/zones";
export function seed(): State {
  return {
    catalog: [],
    paymentNotifications: [],
    zones: structuredClone(zoneSeed),
    conversations: [],
    orders: [],
    payments: [],
    jobs: [],
    events: {},
    commands: {},
    audit: [],
  };
}
export class Store {
  private db: DatabaseSync;
  private transactionState?: State;
  constructor(
    path: string,
    demo:
      | boolean
      | "staging"
      | "development"
      | "test"
      | "release"
      | "release-staging"
      | "release-production" = false,
    initial?: State,
  ) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec(
      readFileSync(new URL("./schema.sql", import.meta.url), "utf8"),
    );
    const existing = this.db
      .prepare("SELECT mode FROM runtime_profile WHERE id=1")
      .get() as { mode: string } | undefined;
    const hasData = !!this.db
      .prepare("SELECT 1 FROM commerce_state WHERE id=1")
      .get();
    const requested =
      typeof demo === "string" ? demo : demo ? "demo" : "integration";
    if (
      (existing && existing.mode !== requested) ||
      (!existing && hasData && demo !== true)
    ) {
      this.db.close();
      throw new Error(
        "Use a separate database for integration; never promote sandbox records",
      );
    }
    this.db
      .prepare("INSERT OR IGNORE INTO runtime_profile VALUES (1, ?)")
      .run(requested);
    this.db
      .prepare("INSERT OR IGNORE INTO commerce_state VALUES (1, ?)")
      .run(JSON.stringify(initial ?? seed()));
    this.write((s) => {
      if (s.events["migration:tl25-commercial"]) return;
      for (const zone of s.zones) {
        if (
          ["jlt-cluster-b", "jlt-cluster-c", "jlt-cluster-d"].includes(
            zone.id,
          ) &&
          zone.minOrderAed !== 30
        ) {
          zone.minOrderAed = 30;
          zone.version++;
          zone.review = "TL-25 minimum confirmed";
        }
        if (zone.id === "remran" && zone.name !== "Remraam") {
          zone.name = "Remraam";
          zone.aliases = [...new Set([...zone.aliases, "REMRAN"])];
          zone.version++;
          zone.review =
            "Delivery fee not supplied; admin confirmation required.";
        }
      }
      s.events["migration:tl25-commercial"] = "resolved";
    });
  }
  read(): State {
    if (this.transactionState) return structuredClone(this.transactionState);
    return JSON.parse(
      (
        this.db
          .prepare("SELECT document FROM commerce_state WHERE id=1")
          .get() as { document: string }
      ).document,
    ) as State;
  }
  /** Compose existing synchronous domain commands in one durable SQLite transaction. */
  transaction<T>(fn: () => T): T {
    if (this.transactionState) return fn();
    return this.write((state) => {
      this.transactionState = state;
      try {
        return fn();
      } finally {
        this.transactionState = undefined;
      }
    });
  }
  write<T>(fn: (s: State) => T): T {
    if (this.transactionState) return fn(this.transactionState);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const s = this.read();
      const result = fn(s);
      this.db
        .prepare("UPDATE commerce_state SET document=? WHERE id=1")
        .run(JSON.stringify(s));
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  async backup(destination: string) {
    await backup(this.db, destination);
    const restored = new DatabaseSync(destination, { readOnly: true });
    try {
      const result = restored.prepare("PRAGMA integrity_check").get() as {
        integrity_check: string;
      };
      if (result.integrity_check !== "ok")
        throw new Error("Backup integrity check failed");
    } finally {
      restored.close();
    }
  }
  /** Content-addressed image bytes. Inside Store.write it joins that transaction. */
  putMedia(media: {
    sha256: string;
    contentType: string;
    bytes: Buffer;
    width: number;
    height: number;
    createdAt: string;
    createdBy: string;
  }) {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO product_hub_media VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        media.sha256,
        media.contentType,
        media.bytes,
        media.width,
        media.height,
        media.createdAt,
        media.createdBy,
      );
  }
  getMedia(sha256: string) {
    const row = this.db
      .prepare(
        "SELECT content_type, bytes FROM product_hub_media WHERE sha256=?",
      )
      .get(sha256) as { content_type: string; bytes: Uint8Array } | undefined;
    return row
      ? { contentType: row.content_type, bytes: Buffer.from(row.bytes) }
      : null;
  }
  healthy() {
    return !!this.db.prepare("SELECT 1 FROM commerce_state WHERE id=1").get();
  }
  close() {
    this.db.close();
  }
}
