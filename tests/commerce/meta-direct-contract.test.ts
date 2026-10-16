import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMetaInbound } from "../../server/adapters/meta-inbound";
import { Store } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import {
  DisabledWhatsAppProvider,
  UnconfiguredPaymentProvider,
} from "../../server/adapters/blocked";
import { latestCustomerInbound } from "../../server/domain/whatsapp-inbound";
import {
  metaNumber,
  contactPhone,
  seconds,
  webhook,
  textMessage,
} from "../fixtures/meta-coexistence";

const parse = (raw: unknown) => normalizeMetaInbound(raw, [metaNumber]);
function setup() {
  const store = new Store(":memory:", "test");
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    new UnconfiguredPaymentProvider(),
    { resolve: () => null },
    100,
    [metaNumber],
  );
  const ingest = (raw: unknown) =>
    parse(raw).forEach((e) => service.inbound(e));
  return { store, service, ingest };
}
const placeholder = () =>
  webhook("history", {
    history: [
      {
        threads: [
          {
            id: contactPhone,
            messages: [
              {
                id: "wamid.media-contract",
                from: metaNumber.phone,
                to: contactPhone,
                timestamp: seconds(-86400),
                type: "media_placeholder",
                history_context: { status: "PLAYED" },
              },
            ],
          },
        ],
      },
    ],
  });
// Matches Meta's separate history-media example: value.messages, from=counterparty.
const asset = () =>
  webhook("history", {
    messages: [
      {
        id: "wamid.media-contract",
        from: contactPhone,
        timestamp: seconds(-86400),
        type: "image",
        image: {
          id: "synthetic-media",
          mime_type: "image/jpeg",
          caption: "Synthetic photo",
          url: "https://must-not-fetch.invalid/private",
        },
      },
    ],
  });

test("documented separate history media enriches the original outgoing placeholder without duplicate chat/window/AI", () => {
  const { store, ingest } = setup();
  ingest(placeholder());
  const before = store.read().conversations[0]!;
  const selection = {
    assignedAgent: before.assignedAgent,
    unread: before.unread,
  };
  const event = asset();
  ingest(event);
  ingest(event);
  const state = store.read(),
    c = state.conversations[0]!;
  assert.equal(c.messages.length, 1);
  assert.equal(c.messages[0]!.direction, "out");
  assert.equal(c.messages[0]!.status, "read");
  assert.equal(c.messages[0]!.media?.id, "synthetic-media");
  assert.equal(c.messages[0]!.text, "Synthetic photo");
  assert.equal(c.messages[0]!.origin, "history");
  assert.equal(latestCustomerInbound(c), undefined);
  assert.deepEqual(
    { assignedAgent: c.assignedAgent, unread: c.unread },
    selection,
  );
  assert.equal(state.jobs.length, 0);
  assert.doesNotMatch(JSON.stringify(state), /must-not-fetch/);
  store.close();
});

test("history media arriving first remains in durable retry until the original message exists", async () => {
  const { store, service, ingest } = setup();
  service.acceptInboundBatch(parse(asset()));
  await service.drain();
  assert.equal(store.read().conversations.length, 0);
  assert.equal(store.read().inboundDeliveries?.[0]?.status, "pending");
  ingest(placeholder());
  store.write((s) => {
    s.inboundDeliveries![0]!.nextAt = 0;
  });
  await service.drain();
  assert.equal(store.read().inboundDeliveries?.[0]?.status, "done");
  assert.equal(store.read().conversations[0]!.messages.length, 1);
  assert.equal(store.read().jobs.length, 0);
  store.close();
});

test("signed lifecycle observations and declined history persist once without controlling account/order/payment states", async () => {
  const { store, service } = setup();
  const lifecycle = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "333",
        time: Number(seconds()),
        changes: [
          {
            field: "account_update",
            value: {
              event: "PARTNER_REMOVED",
              phone_number: metaNumber.phone,
              disconnection_info: {
                reason: "PRIMARY_INACTIVITY",
                initiated_by: "SYSTEM",
              },
            },
          },
        ],
      },
    ],
  };
  const events = [
    ...parse(lifecycle),
    ...parse(
      webhook("history", { history: [{ errors: [{ code: 2593109 }] }] }),
    ),
  ];
  const original = JSON.stringify({
    orders: store.read().orders,
    payments: store.read().payments,
  });
  service.acceptInboundBatch(events);
  service.acceptInboundBatch(events);
  await service.drain();
  assert.equal(store.read().whatsappAccountObservations?.length, 2);
  assert.deepEqual(
    store.read().whatsappAccountObservations?.map((e) => e.event),
    ["PARTNER_REMOVED", "HISTORY_SHARING_DECLINED"],
  );
  assert.equal(store.read().conversations.length, 0);
  assert.equal(store.read().jobs.length, 0);
  assert.equal(
    JSON.stringify({
      orders: store.read().orders,
      payments: store.read().payments,
    }),
    original,
  );
  assert.equal(
    store.read().inboundDeliveries?.every((d) => d.status === "done"),
    true,
  );
  store.close();
});

test("history media cannot turn a text message or another customer's message into an attachment", () => {
  const { store, ingest } = setup();
  ingest(
    webhook("history", {
      history: [
        {
          threads: [
            {
              id: contactPhone,
              messages: [textMessage("wamid.media-contract")],
            },
          ],
        },
      ],
    }),
  );
  assert.throws(() => ingest(asset()), /multimedia incompatible/);
  assert.equal(store.read().conversations[0]!.messages[0]!.media, undefined);
  const wrong = asset();
  wrong.entry[0]!.id = "unknown-waba";
  assert.throws(() => parse(wrong));
  store.close();
});
