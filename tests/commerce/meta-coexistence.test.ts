import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MetaWhatsAppProvider } from "../../server/adapters/meta";
import { normalizeMetaInbound } from "../../server/adapters/meta-inbound";
import { Store } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import {
  DisabledWhatsAppProvider,
  UnconfiguredPaymentProvider,
} from "../../server/adapters/blocked";
import { latestCustomerInbound } from "../../server/domain/whatsapp-inbound";
import { CommerceAgentGateway } from "../../server/domain/agent-gateway";
import { agentConfig } from "../../server/agents/config";
import {
  metaNumber,
  contactPhone,
  webhook,
  textMessage,
  customerPayload,
  echoPayload,
  historyPayload,
  contactPayload,
  seconds,
} from "../fixtures/meta-coexistence";
const parse = (v: unknown) => normalizeMetaInbound(v, [metaNumber]);
function fixture(path = ":memory:") {
  const store = new Store(path, "test");
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    new UnconfiguredPaymentProvider(),
    { resolve: () => null },
    100,
    [metaNumber],
  );
  const ingest = (value: unknown) =>
    parse(value).map((e) => service.inbound(e));
  return { store, service, ingest };
}
test("documented text/media normalize with stable IDs; omit media URLs and retain safe metadata", () => {
  const [e] = parse(customerPayload());
  assert.ok(e && e.type === "message");
  assert.equal(e.sourceNumberId, "wa1");
  assert.equal(e.providerMessageId, "wamid.in");
  assert.equal(e.origin, "cloud");
  assert.equal(e.direction, "in");
  for (const type of [
    "image",
    "audio",
    "video",
    "document",
    "sticker",
    "media_placeholder",
  ]) {
    const [media] = parse(
      webhook("messages", {
        messages: [
          {
            ...textMessage(type),
            type,
            [type]: {
              id: "media-id",
              mime_type: "image/jpeg",
              filename: "synthetic.jpg",
              voice: true,
              url: "https://untrusted.invalid/private",
            },
          },
        ],
      }),
    );
    assert.ok(media && media.type === "message");
    if (media.type === "message") assert.equal(media.media?.type, type);
    assert.ok(!JSON.stringify(media).includes("untrusted"));
  }
});
test("wrong WABA/number, echo origin, history thread, malformed/future times fail before ingestion", () => {
  assert.throws(() => parse(contactPayload("undocumented-action")));
  const wrong = customerPayload();
  wrong.entry[0]!.id = "444";
  assert.throws(() => parse(wrong));
  assert.throws(() =>
    parse(
      webhook("messages", {
        metadata: { phone_number_id: "444" },
        messages: [textMessage("wrong")],
      }),
    ),
  );
  assert.throws(() =>
    parse(
      webhook("smb_message_echoes", {
        message_echoes: [{ ...textMessage("forged"), to: "971500000002" }],
      }),
    ),
  );
  assert.throws(() =>
    parse(
      webhook("history", {
        history: [
          {
            threads: [
              { id: "971500000002", messages: [textMessage("bad-thread")] },
            ],
          },
        ],
      }),
    ),
  );
  assert.throws(() =>
    parse(
      webhook("messages", {
        messages: [{ ...textMessage("future"), timestamp: seconds(1000) }],
      }),
    ),
  );
  assert.throws(() =>
    parse(
      webhook("messages", {
        messages: [{ ...textMessage("invalid"), timestamp: "NaN" }],
      }),
    ),
  );
});
test("history never opens a window, marks unread, mutates orders or becomes an AI candidate", () => {
  const { store, service, ingest } = fixture();
  store.write((s) => {
    s.orders.push({
      id: "frozen",
      conversationId: "other",
      state: "Delivered",
      version: 4,
      lines: [],
      quote: null,
      audit: [],
      paidAt: "2026-01-01T00:00:00.000Z",
    });
  });
  const before = store.read().orders;
  ingest(historyPayload());
  const c = store.read().conversations[0]!;
  assert.equal(c.messages.length, 2);
  assert.equal(c.unread, false);
  assert.equal(c.messages[1]!.status, "unknown");
  assert.equal(latestCustomerInbound(c), undefined);
  const ai = new CommerceAgentGateway(service, agentConfig({}));
  assert.deepEqual(ai.candidates(), []);
  assert.deepEqual(store.read().orders, before);
  assert.equal(store.read().jobs.length, 0);
  store.close();
});
test("live, app echo and history deduplicate by origin/provider ID and preserve assignment/unread", (t) => {
  const { store, ingest } = fixture();
  ingest(customerPayload());
  store.write((s) => {
    const c = s.conversations[0]!;
    c.assignedAgent = "operator";
    c.unread = false;
    c.status = "closed";
  });
  // Replay the same immutable event, even when reception crosses a second.
  // Regenerating it with Date.now() changes its fingerprint and correctly409s.
  const echo = echoPayload();
  ingest(echo);
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 1100 });
  ingest(structuredClone(echo));
  const history = webhook("history", {
    history: [
      {
        threads: [
          {
            id: contactPhone,
            messages: [
              textMessage("wamid.in"),
              {
                ...textMessage("wamid.app"),
                from: "971500000009",
                to: contactPhone,
              },
            ],
          },
        ],
      },
    ],
  });
  ingest(history);
  ingest(history);
  const s = store.read(),
    c = s.conversations[0]!;
  assert.equal(s.conversations.length, 1);
  assert.equal(c.messages.length, 2);
  assert.equal(c.assignedAgent, "operator");
  assert.equal(c.unread, false);
  assert.equal(c.status, "closed");
  assert.equal(
    c.messages.find((m) => m.id === "wamid.app")?.origin,
    "business-app",
  );
  assert.equal(s.ai?.sessions[c.id]?.state, "HUMAN_ACTIVE");
  assert.equal(s.jobs.length, 0);
  store.close();
});
test("contact add/update/remove are timestamp ordered, normalize phone and never create/delete chats", () => {
  const { store, ingest } = fixture();
  ingest(contactPayload());
  assert.equal(store.read().conversations.length, 0);
  ingest(customerPayload());
  const before = store.read().conversations[0]!;
  assert.equal(before.customer, "Synthetic Contact");
  ingest(contactPayload("remove", 1));
  ingest(contactPayload("add", -1));
  assert.equal(store.read().whatsappContacts?.[0]?.removed, true);
  assert.equal(store.read().conversations[0]!.messages.length, 1);
  assert.equal(store.read().conversations[0]!.unread, before.unread);
  store.close();
});
test("out-of-order receipts retry safely, cannot regress read status or cross conversation origins", async () => {
  const { store, service, ingest } = fixture();
  const status = (state: string) =>
    webhook("messages", {
      statuses: [{ id: "wamid.app", status: state, timestamp: seconds() }],
    });
  service.acceptInboundBatch(parse(status("read")));
  await service.drain();
  assert.equal(store.read().inboundDeliveries?.[0]?.attempts, 1);
  ingest(echoPayload());
  store.write((s) => {
    s.inboundDeliveries![0]!.nextAt = 0;
  });
  await service.drain();
  ingest(status("sent"));
  ingest(status("delivered"));
  ingest(status("failed"));
  assert.equal(store.read().conversations[0]!.messages[0]!.status, "read");
  assert.throws(() =>
    service.inbound({
      type: "status",
      eventId: "wrong-origin",
      providerId: "wamid.app",
      sourceNumberId: "wa2",
      status: "failed",
    }),
  );
  assert.equal(store.read().jobs.length, 0);
  store.close();
});
test("durable queued events recover after restart; historical snapshots remain byte-identical", async () => {
  const dir = mkdtempSync(join(tmpdir(), "3l-coexist-")),
    path = join(dir, "state.sqlite");
  try {
    let f = fixture(path);
    f.store.write((s) => {
      s.orders.push({
        id: "historical",
        conversationId: "other",
        state: "Confirmed",
        version: 5,
        lines: [],
        quote: null,
        audit: [],
        paidAt: "2026-01-01T00:00:00.000Z",
      });
    });
    const before = JSON.stringify({
      orders: f.store.read().orders,
      payments: f.store.read().payments,
    });
    const events = parse(customerPayload());
    f.service.acceptInboundBatch(events);
    f.service.acceptInboundBatch(events);
    f.store.close();
    f = fixture(path);
    await f.service.drain();
    assert.equal(f.store.read().conversations[0]!.messages.length, 1);
    assert.equal(f.store.read().inboundDeliveries?.length, 1);
    f.service.acceptInboundBatch(events);
    await f.service.drain();
    assert.equal(f.store.read().conversations[0]!.messages.length, 1);
    assert.equal(
      JSON.stringify({
        orders: f.store.read().orders,
        payments: f.store.read().payments,
      }),
      before,
    );
    assert.equal(f.store.read().jobs.length, 0);
    f.store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("history cannot permit a free-text reply through the real adapter boundary", async () => {
  const { store, ingest } = fixture();
  ingest(historyPayload());
  let calls = 0;
  const provider = new MetaWhatsAppProvider(
    {
      token: "synthetic",
      version: "v26.0",
      verifyToken: "synthetic-verify-token-for-local-test",
      numbers: [metaNumber],
    },
    async () => {
      calls++;
      throw Error("No network allowed");
    },
  );
  await assert.rejects(
    provider.send({
      sourceNumberId: "wa1",
      sourcePhoneNumber: metaNumber.phone,
      recipient: contactPhone,
      text: "Should not send",
      idempotencyKey: "synthetic",
      lastInboundAt: latestCustomerInbound(store.read().conversations[0]!)?.at,
    }),
  );
  assert.equal(calls, 0);
  store.close();
});

test("history-first duplicates gain live evidence; a delayed mobile echo still pauses AI", () => {
  const { store, ingest } = fixture();
  const initial = webhook("history", {
    history: [
      {
        threads: [
          {
            id: contactPhone,
            messages: [
              textMessage("wamid.live-after-history"),
              {
                ...textMessage("wamid.echo-after-history"),
                from: "971500000009",
                to: contactPhone,
              },
            ],
          },
        ],
      },
    ],
  });
  ingest(initial);
  assert.equal(store.read().conversations[0]!.unread, false);
  ingest(customerPayload("wamid.live-after-history"));
  ingest(echoPayload("wamid.echo-after-history"));
  const c = store.read().conversations[0]!;
  assert.equal(c.messages.length, 2);
  assert.equal(c.unread, true);
  assert.equal(latestCustomerInbound(c)?.id, "wamid.live-after-history");
  assert.equal(store.read().ai?.sessions[c.id]?.state, "HUMAN_ACTIVE");
  store.close();
});

test("a mobile operator aborts a queued AI response before the transport is called", async () => {
  const { store, service, ingest } = fixture();
  ingest(customerPayload());
  const c = store.read().conversations[0]!;
  const config = {
    ...agentConfig({
      AI_ENABLED: "true",
      AI_AGENT_DEFAULT_MODE: "supervised_auto",
    }),
    configured: true,
  };
  const gateway = new CommerceAgentGateway(service, config);
  const { AgentOrchestrator } =
    await import("../../server/agents/orchestrator");
  const { MockAgentProvider, agentPlan } =
    await import("../fixtures/agent-provider");
  const ai = new AgentOrchestrator(
    gateway,
    config,
    new MockAgentProvider(() => agentPlan()),
  );
  await ai.process(c.id);
  assert.equal(store.read().ai?.runs.at(-1)?.status, "queued");
  ingest(echoPayload());
  await service.drain();
  assert.equal(store.read().ai?.runs.at(-1)?.status, "aborted");
  assert.match(store.read().jobs[0]!.lastError ?? "", /AI send aborted/);
  assert.equal(store.read().conversations[0]!.assignedAgent, null);
  store.close();
});

test("overlapping history chunks update receipt evidence without duplicate messages or status regression", () => {
  const { store, ingest } = fixture();
  const history = (status: string) =>
    webhook("history", {
      history: [
        {
          threads: [
            {
              id: contactPhone,
              messages: [
                {
                  ...textMessage("wamid.history-receipt"),
                  from: "971500000009",
                  to: contactPhone,
                  history_context: { status },
                },
              ],
            },
          ],
        },
      ],
    });
  ingest(history("SENT"));
  ingest(history("READ"));
  ingest(history("DELIVERED"));
  assert.equal(store.read().conversations[0]!.messages.length, 1);
  assert.equal(store.read().conversations[0]!.messages[0]!.status, "read");
  store.close();
});
