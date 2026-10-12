/** Synthetic recovery rehearsal. Never reads a Production path or exports records. */
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  copyFileSync,
  statSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { Store } from "../../server/db/store";
import { BackupManager } from "../../server/db/backups";
import { workspace } from "../../tests/fixtures/ux-states";
import type { State } from "../../server/domain/model";
const dir = mkdtempSync(join(tmpdir(), "3l-rg3-recovery-"));
const database = join(dir, "db", "synthetic.sqlite");
const store = new Store(database, "test");
try {
  const fixture = workspace();
  store.write((state) => {
    Object.assign(
      state,
      JSON.parse(
        JSON.stringify({
          catalog: fixture.catalog,
          conversations: fixture.conversations,
          orders: fixture.orders,
          payments: fixture.payments,
        }),
      ),
    );
    state.paymentNotifications = [
      {
        id: "synthetic-receipt",
        checkoutId: "synthetic-checkout",
        status: "PAID",
        receivedAt: "2026-10-10T00:00:00Z",
        nextAt: Date.parse("2026-10-10T00:00:00Z"),
        attempts: 0,
      },
    ];
  });
  const before = store.read();
  const backup = new BackupManager(
    store,
    database,
    join(dir, "backups"),
    2,
    60,
  );
  await backup.run();
  const { readdirSync } = await import("node:fs");
  const path = join(dir, "backups", readdirSync(join(dir, "backups"))[0]!);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  const start = performance.now();
  const restoredPath = join(dir, "isolated-restored.sqlite");
  copyFileSync(path, restoredPath);
  chmodSync(restoredPath, 0o600);
  const restored = new DatabaseSync(restoredPath, { readOnly: true });
  try {
    const integrity = restored
      .prepare("PRAGMA integrity_check")
      .get()?.integrity_check;
    assert.equal(integrity, "ok");
    const after = JSON.parse(
      String(
        restored.prepare("SELECT document FROM commerce_state WHERE id=1").get()
          ?.document,
      ),
    ) as State;
    assert.deepEqual(after, before);
    assert.ok(
      after.orders.every((order) =>
        after.conversations.some((c) => c.id === order.conversationId),
      ),
    );
    assert.ok(
      after.payments.every((payment) =>
        after.orders.some(
          (order) =>
            order.id === payment.orderId &&
            order.paymentId === payment.id &&
            order.quote?.totalFils === payment.amountFils,
        ),
      ),
    );
    const counts = {
      orders: after.orders.length,
      payments: after.payments.length,
      conversations: after.conversations.length,
      receipts: after.paymentNotifications?.length ?? 0,
      catalog: after.catalog?.length ?? 0,
    };
    const report = {
      scope: "synthetic-only",
      productionBackupVerified: false,
      integrity,
      fullStateEqual: true,
      relationshipsValid: true,
      mode: "0600",
      counts,
      latestSyntheticBackupAt: backup.lastSuccessfulAt,
      localRestoreMilliseconds: Math.round(performance.now() - start),
      productionRpo: "unverified",
      productionRto: "unverified",
      removedDisposableFiles: true,
    };
    writeFileSync(
      "work/rg3/backup-rehearsal.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(JSON.stringify(report));
  } finally {
    restored.close();
  }
} finally {
  store.close();
  rmSync(dir, { recursive: true, force: true });
}
