import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrderCard } from "../../src/commerce/OrdersBoard";
import type { Workspace } from "../../src/commerce/api";
import type { Order } from "../../server/domain/model";
import { readFileSync } from "node:fs";
test("operations card surfaces server-owned unverified/manual-review state", () => {
  const order = {
    id: "fixture",
    conversationId: "fixture",
    state: "Building",
    version: 1,
    lines: [],
    quote: null,
    fulfillmentMethod: "delivery",
    delivery: {
      addressVerification: "UNVERIFIED",
      zoneId: "marina",
      address: "Manual fixture street",
      building: "Fixture Tower",
      date: "2026-10-10",
      slot: "4:00 PM – 9:00 PM",
    },
    audit: [],
  } satisfies Order;
  const data = {
    actor: { id: "fixture", role: "admin" },
    conversations: [],
    orders: [order],
    payments: [],
    catalog: [],
    agents: [],
  } as unknown as Workspace;
  const html = renderToStaticMarkup(
    createElement(OrderCard, {
      order,
      data,
      today: "2026-10-03",
      run: async () => false,
      details: () => null,
      openConversation: () => {},
    }),
  );
  assert.match(html, /ADDRESS NOT VERIFIED/);
  assert.match(html, /Revisión manual/);
  const verified = renderToStaticMarkup(
    createElement(OrderCard, {
      order: {
        ...order,
        delivery: { ...order.delivery, addressVerification: "VERIFIED" },
      },
      data,
      today: "2026-10-03",
      run: async () => false,
      details: () => null,
      openConversation: () => {},
    }),
  );
  assert.doesNotMatch(verified, /ADDRESS NOT VERIFIED/);
});
test("checkout cannot supply its own address verification status", async () => {
  const { cartCheckoutSchema } =
    await import("../../server/domain/web-checkout");
  assert.equal(
    cartCheckoutSchema.shape.delivery.shape.addressRef.isOptional(),
    true,
  );
  assert.equal(
    "addressVerification" in cartCheckoutSchema.shape.delivery.shape,
    false,
  );
});
test("deployment defaults legacy; Google remains an explicit configuration with no fallback", () => {
  const env = readFileSync(".env.example", "utf8");
  assert.match(env, /DELIVERY_ADDRESS_MODE=legacy/);
  const server = readFileSync("server/http.ts", "utf8");
  assert.match(server, /DELIVERY_ADDRESS_MODE \?\? "legacy"/);
});
