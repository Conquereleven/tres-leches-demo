import test from "node:test";
import assert from "node:assert/strict";
import { ticketSnapshot } from "../../src/commerce/ticket-snapshot";
const product = { id: "accepted", name: "Accepted product", priceFils: 2100 };
const lines = [{ productId: product.id, quantity: 2 }];

test("historical tickets reject missing and incomplete snapshots", () => {
  assert.equal(ticketSnapshot({ lines }), null);
  assert.equal(ticketSnapshot({ lines, catalogSnapshot: [] }), null);
  assert.equal(
    ticketSnapshot({ lines, catalogSnapshot: [{ ...product, id: "other" }] }),
    null,
  );
});
test("historical tickets reject inconsistent snapshot rows and quantities", () => {
  for (const catalogSnapshot of [
    [product, product],
    [{ ...product, name: " " }],
    [{ ...product, priceFils: -1 }],
    [{ ...product, priceFils: 1.5 }],
  ])
    assert.equal(ticketSnapshot({ lines, catalogSnapshot }), null);
  assert.equal(
    ticketSnapshot({ lines: [...lines, ...lines], catalogSnapshot: [product] }),
    null,
  );
  assert.equal(
    ticketSnapshot({
      lines: [{ productId: product.id, quantity: 0 }],
      catalogSnapshot: [product],
    }),
    null,
  );
});
test("accepted snapshot survives later catalog name and price changes", () => {
  const currentCatalog = [{ ...product }];
  const acceptedOrder = {
    lines,
    catalogSnapshot: structuredClone(currentCatalog),
  };
  currentCatalog[0]!.name = "Renamed after acceptance";
  currentCatalog[0]!.priceFils = 99900;
  assert.deepEqual(ticketSnapshot(acceptedOrder), [
    { ...lines[0], name: "Accepted product", priceFils: 2100 },
  ]);
  assert.deepEqual(acceptedOrder.catalogSnapshot, [product]);
});
