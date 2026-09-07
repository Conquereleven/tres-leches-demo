import { DatabaseSync, backup } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { type State, numbers, now } from "../domain/model";
import { zoneSeed } from "../domain/zones";
export function seed(): State {
  return {
    zones: structuredClone(zoneSeed),
    conversations: numbers.map((n, i) => ({
      id: `conversation-${n.id}`,
      customer: ["Ana Torres", "Valentina García", "Mónica Silva"][i]!,
      phone: `+97150000100${i}`,
      sourceNumberId: n.id,
      sourcePhoneNumber: n.phone,
      assignedAgent: null,
      status: "open",
      unread: true,
      version: 0,
      audit: [],
      messages: [
        {
          id: `seed-${n.id}`,
          direction: "in",
          text: "¡Hola! Quiero pedir un pastel para entrega.",
          translation: "Hello! I would like to order a cake for delivery.",
          at: now(),
          status: "received",
        },
      ],
    })),
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
  constructor(
    path: string,
    demo: boolean | "staging" | "development" | "test" = true,
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
    this.db.prepare("INSERT OR IGNORE INTO commerce_state VALUES (1, ?)").run(
      JSON.stringify(
        initial ?? {
          ...seed(),
          ...(demo === true || demo === "development" || demo === "test"
            ? {}
            : { conversations: [] }),
        },
      ),
    );
  }
  read(): State {
    return JSON.parse(
      (
        this.db
          .prepare("SELECT document FROM commerce_state WHERE id=1")
          .get() as { document: string }
      ).document,
    ) as State;
  }
  write<T>(fn: (s: State) => T): T {
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
  healthy() {
    return !!this.db.prepare("SELECT 1 FROM commerce_state WHERE id=1").get();
  }
  close() {
    this.db.close();
  }
}
