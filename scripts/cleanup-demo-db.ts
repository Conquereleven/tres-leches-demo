import { DatabaseSync, backup } from "node:sqlite";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { runtimeFindings } from "../server/db/runtime-safety";
import type { State } from "../server/domain/model";
const [input, ...args] = process.argv.slice(2);
if (!input)
  throw new Error(
    "Pass an explicit offline database path. Default is read-only dry run.",
  );
const apply = args.includes("--apply");
const expected = args.includes("--expected-sha")
  ? args[args.indexOf("--expected-sha") + 1]
  : undefined;
const destination = args.includes("--backup")
  ? args[args.indexOf("--backup") + 1]
  : undefined;
if (
  apply &&
  (!expected ||
    !destination ||
    existsSync(destination) ||
    resolve(destination) === resolve(input))
)
  throw new Error(
    "Apply requires the reviewed --expected-sha and a NEW --backup path",
  );
const db = new DatabaseSync(resolve(input), { readOnly: !apply });
const read = () =>
  String(
    db.prepare("SELECT document FROM commerce_state WHERE id=1").get()!
      .document,
  );
const digest = (raw: string) => createHash("sha256").update(raw).digest("hex");
try {
  const raw = read();
  const state = JSON.parse(raw) as State;
  const findings = runtimeFindings(state);
  console.log(
    JSON.stringify(
      {
        dryRun: !apply,
        sha256: digest(raw),
        identified: findings,
        preserves: [
          "zones",
          "runtime_profile",
          "audit",
          "event deduplication receipts",
          "unidentified operational records",
        ],
      },
      null,
      2,
    ),
  );
  if (apply) {
    if (digest(raw) !== expected)
      throw new Error("Database changed: review a fresh dry run");
    await backup(db, resolve(destination!));
    const saved = new DatabaseSync(resolve(destination!), { readOnly: true });
    try {
      if (
        saved.prepare("PRAGMA integrity_check").get()!.integrity_check !== "ok"
      )
        throw new Error("Backup verification failed");
    } finally {
      saved.close();
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      if (digest(read()) !== expected)
        throw new Error("Concurrent write detected; no cleanup applied");
      const ids = new Set(
        findings
          .filter((f) => f.includes(":"))
          .map((f) => f.slice(f.indexOf(":") + 1)),
      );
      const removed = state.conversations.filter((c) => ids.has(c.id));
      const removedPayments = state.payments.filter((p) => ids.has(p.id));
      if (
        removed.some((c) =>
          c.messages.some(
            (m) => m.providerId && !m.providerId.startsWith("mock-wa-"),
          ),
        ) ||
        removedPayments.some(
          (p) =>
            p.provider !== "mock" &&
            !p.providerReference?.startsWith("mock-pay-"),
        ) ||
        state.orders.some(
          (o) => !ids.has(o.id) && o.paymentId && ids.has(o.paymentId),
        )
      )
        throw new Error(
          "Mixed provider evidence or retained order references require manual review; no cleanup applied",
        );
      const phones = new Set(removed.map((c) => c.phone));
      for (const c of removed) for (const m of c.messages) ids.add(m.id);
      state.conversations = state.conversations.filter((c) => !ids.has(c.id));
      state.orders = state.orders.filter((o) => !ids.has(o.id));
      state.payments = state.payments.filter((p) => !ids.has(p.id));
      state.jobs = state.jobs.filter((j) => !ids.has(j.entityId));
      const references = (value: unknown): boolean =>
        typeof value === "string"
          ? ids.has(value)
          : Array.isArray(value)
            ? value.some(references)
            : !!value && typeof value === "object"
              ? Object.values(value).some(references)
              : false;
      state.commands = Object.fromEntries(
        Object.entries(state.commands).filter(
          ([, receipt]) => !references(receipt.result),
        ),
      );
      state.inboundDeliveries = state.inboundDeliveries?.filter((d) => {
        const event = d.event as { phone?: string };
        return !event?.phone || !phones.has(event.phone);
      });
      delete state.uatScenarios;
      // Immutable audit history and event receipts stay intact; do not make old events replayable.
      db.prepare("UPDATE commerce_state SET document=? WHERE id=1").run(
        JSON.stringify(state),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
} finally {
  db.close();
}
