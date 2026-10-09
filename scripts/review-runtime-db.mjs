import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
// Read-only inventory: NEVER deletes, rewrites, or promotes a database profile.
const path = process.argv[2];
if (!path) throw new Error("Pass the explicit database path to review");
const db = new DatabaseSync(resolve(path), { readOnly: true });
try {
  const hasProfile = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='runtime_profile'",
    )
    .get();
  const profile = hasProfile
    ? db.prepare("SELECT mode FROM runtime_profile WHERE id=1").get()
    : { mode: "unprofiled-legacy" };
  const row = db
    .prepare("SELECT document FROM commerce_state WHERE id=1")
    .get();
  const state = JSON.parse(row.document);
  const conversations = state.conversations
    .filter(
      (c) =>
        c.messages.some(
          (m) =>
            m.id === `seed-${c.sourceNumberId}` ||
            m.id.startsWith("TEST-MESSAGE-"),
        ) || c.audit.some((a) => a.actor === "staging-seed"),
    )
    .map((c) => c.id);
  const orders = state.orders
    .filter(
      (o) =>
        conversations.includes(o.conversationId) ||
        o.audit.some((a) => a.actor === "staging-seed"),
    )
    .map((o) => o.id);
  const payments = state.payments
    .filter(
      (p) =>
        p.provider === "mock" ||
        p.providerReference?.startsWith("mock-pay-") ||
        orders.includes(p.orderId),
    )
    .map((p) => p.id);
  console.log(
    JSON.stringify(
      {
        readOnly: true,
        profile: profile?.mode,
        identified: { conversations, orders, payments },
        strategy:
          "Quarantine this database. Preserve backup and approved configuration. Initialize a separate empty release database. Mixed operational records require record-by-record reconciliation; this tool never deletes them.",
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}
