import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { catalogDifferences } from "../../scripts/paymennt-test-catalog.mjs";
import { validateCatalog } from "../../server/domain/catalog";
const approved = JSON.parse(
  readFileSync("data-imports/liza-current-menu.json", "utf8"),
);
const stored = () => validateCatalog(approved);
test("the approved menu, imported as-is, passes the TEST startup integrity check", () => {
  // The menu intentionally carries unavailable items; that is not a fault.
  assert.ok(
    approved.items.some(
      (i: { active: boolean; availability?: string }) =>
        i.active === false || i.availability === "unavailable",
    ),
  );
  assert.deepEqual(catalogDifferences(stored(), approved.items), []);
});
test("integrity failures are still caught", () => {
  const drop = stored().slice(1);
  assert.ok(catalogDifferences(drop, approved.items).length > 0);
  const price = stored();
  price[0]!.priceFils += 100;
  assert.match(catalogDifferences(price, approved.items).join(), /differs/);
  const renamed = stored();
  renamed[0]!.name = "Tampered";
  assert.match(catalogDifferences(renamed, approved.items).join(), /differs/);
  const extra = [...stored(), { ...stored()[0]!, id: "not-approved" }];
  assert.match(catalogDifferences(extra, approved.items).join(), /unapproved/);
  const retired = [...stored(), { ...stored()[0]!, id: "pan-de-muerto" }];
  assert.match(catalogDifferences(retired, approved.items).join(), /retired/);
  assert.ok(catalogDifferences(undefined, approved.items).length > 0);
});
test("availability is checked for equality with the menu, never forced on", () => {
  // Re-enabling an item the menu marks unavailable is a difference…
  const forced = stored().map((p) => ({
    ...p,
    active: true,
    availability: "available" as const,
  }));
  assert.match(catalogDifferences(forced, approved.items).join(), /differs/);
  // …and so is disabling one the menu sells.
  const disabled = stored();
  const sold = disabled.find((p) => p.active !== false)!;
  sold.active = false;
  assert.match(catalogDifferences(disabled, approved.items).join(), /differs/);
});
test("the wrapper is locked to the TEST environment and never Production", () => {
  const source = readFileSync("scripts/start-paymennt-test.mjs", "utf8");
  // The TEST environment's own Railway id, and the non-production modes.
  assert.match(
    source,
    /RAILWAY_ENVIRONMENT_ID !== "b32d77cf-6597-4b3e-9810-caf275bffb68"/,
  );
  for (const guard of [
    'e.APP_ENV !== "staging"',
    'e.PROVIDER_MODE !== "test"',
    'e.PAYMENNT_ENVIRONMENT !== "test"',
    'e.META_OUTBOUND_ENABLED !== "false"',
  ])
    assert.ok(source.includes(guard), guard);
  assert.ok(!source.includes("142de30a-4879-4d04-85b9-12e79aa51bda"));
  // Production's start command is the plain server, not this wrapper.
  assert.equal(
    JSON.parse(readFileSync("railway.json", "utf8")).deploy.startCommand,
    "npm run start",
  );
});
