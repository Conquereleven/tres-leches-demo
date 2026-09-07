import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import {
  HmacVerifier,
  MockPaymentProvider,
  MockWhatsAppProvider,
} from "../../server/adapters/providers";
const verifier = new HmacVerifier("test-long-secret-more-than-24-characters");
test("restart retains command receipts, queued work and sends from original number", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tl-test-")),
    file = join(dir, "state.sqlite");
  let store = new Store(file);
  let service = new CommerceService(
    store,
    new MockWhatsAppProvider(),
    new MockPaymentProvider(verifier),
  );
  const actor = { id: "liza", role: "admin" as const };
  service.command(
    { type: "assign", id: "conversation-wa2", version: 0, agent: "liza" },
    randomUUID(),
    actor,
  );
  const command = {
      type: "send",
      id: "conversation-wa2",
      version: 1,
      text: "Persistent message",
    },
    key = randomUUID();
  service.command(command, key, actor);
  store.close();
  store = new Store(file);
  service = new CommerceService(
    store,
    new MockWhatsAppProvider(),
    new MockPaymentProvider(verifier),
  );
  service.command(command, key, actor);
  await service.drain();
  assert.equal(store.read().conversations[1]!.messages.length, 2);
  assert.equal(store.read().conversations[1]!.messages[1]!.status, "sent");
  assert.equal(store.read().jobs.length, 1);
  store.close();
  rmSync(dir, { recursive: true });
});
test("two database connections detect stale changes instead of overwriting", () => {
  const dir = mkdtempSync(join(tmpdir(), "tl-test-")),
    file = join(dir, "state.sqlite"),
    a = new Store(file),
    b = new Store(file);
  a.write((s) => {
    s.conversations[0]!.version++;
  });
  assert.equal(b.read().conversations[0]!.version, 1);
  b.write((s) => {
    s.conversations[1]!.version++;
  });
  assert.equal(a.read().conversations[0]!.version, 1);
  assert.equal(a.read().conversations[1]!.version, 1);
  a.close();
  b.close();
  rmSync(dir, { recursive: true });
});
