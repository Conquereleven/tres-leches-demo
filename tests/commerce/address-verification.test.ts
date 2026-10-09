import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attachVerifiedAddresses } from "../../server/domain/website-address";
import { zoneSeed } from "../../server/domain/zones";
function setup(
  community = "Downtown",
  cluster?: string,
  location = { lat: 25.1, lng: 55.25 },
) {
  const dir = mkdtempSync(join(tmpdir(), "3l-address-")),
    file = join(dir, "registry.json");
  writeFileSync(
    file,
    JSON.stringify([
      {
        address: "Verified public fixture",
        building: "Fixture Tower",
        location,
        community,
        cluster,
        searchable: true,
      },
      {
        address: "Private customer fixture",
        building: "Private",
        location,
        community,
        searchable: false,
      },
    ]),
  );
  const geo = attachVerifiedAddresses(
    { resolve: () => null },
    file,
    undefined,
    true,
  );
  return { geo, close: () => rmSync(dir, { recursive: true, force: true }) };
}
test("suggestion exposes public label/opaque reference only; typed text alone is unverified", async () => {
  const f = setup();
  try {
    const suggestions = await f.geo.addressProvider!.suggest("Verified public");
    assert.equal(suggestions.length, 1);
    assert.deepEqual(Object.keys(suggestions[0]!).sort(), ["id", "label"]);
    assert.equal(
      f.geo.resolveAddress!(
        "Verified public fixture",
        "Fixture Tower",
        zoneSeed,
      ),
      null,
    );
    assert.equal(
      f.geo.resolveAddress!(
        "Verified public fixture",
        "Fixture Tower",
        zoneSeed,
        suggestions[0]!.id,
      )?.zoneId,
      "downtown",
    );
  } finally {
    f.close();
  }
});
test("editing address/building or forging reference invalidates verification", async () => {
  const f = setup();
  try {
    const id = (await f.geo.addressProvider!.suggest("Verified public"))[0]!.id;
    for (const [address, building, ref] of [
      ["Changed fixture", "Fixture Tower", id],
      ["Verified public fixture", "Other Tower", id],
      ["Verified public fixture", "Fixture Tower", "f".repeat(64)],
    ])
      assert.equal(
        f.geo.resolveAddress!(address!, building!, zoneSeed, ref),
        null,
      );
  } finally {
    f.close();
  }
});
test("outside coverage is rejected before community lookup", async () => {
  const f = setup("Downtown", undefined, { lat: 25.45, lng: 55.4 });
  try {
    const id = (await f.geo.addressProvider!.suggest("Verified public"))[0]!.id;
    assert.throws(
      () =>
        f.geo.resolveAddress!(
          "Verified public fixture",
          "Fixture Tower",
          [],
          id,
        ),
      /outside our current delivery coverage/,
    );
  } finally {
    f.close();
  }
});
test("inside coverage unknown community stays unresolved", async () => {
  const f = setup("Unlisted community");
  try {
    const id = (await f.geo.addressProvider!.suggest("Verified public"))[0]!.id;
    assert.equal(
      f.geo.resolveAddress!(
        "Verified public fixture",
        "Fixture Tower",
        zoneSeed,
        id,
      ),
      null,
    );
  } finally {
    f.close();
  }
});
test("private entries and short queries never appear in public suggestions", async () => {
  const f = setup();
  try {
    assert.deepEqual(
      await f.geo.addressProvider!.suggest("Private customer"),
      [],
    );
    assert.deepEqual(await f.geo.addressProvider!.suggest("Ve"), []);
  } finally {
    f.close();
  }
});
for (const cluster of ["A", "B", "C", "D"])
  test(`selected trusted JLT ${cluster} resolves minimum 30`, async () => {
    const f = setup("Jumeirah Lakes Towers", cluster);
    try {
      const id = (await f.geo.addressProvider!.suggest("Verified public"))[0]!
        .id;
      const zoneId = f.geo.resolveAddress!(
        "Verified public fixture",
        "Fixture Tower",
        zoneSeed,
        id,
      )?.zoneId;
      assert.equal(zoneSeed.find((z) => z.id === zoneId)?.minOrderAed, 30);
    } finally {
      f.close();
    }
  });

test("no address credential or registry fails closed without synthetic verification", async () => {
  const geo = attachVerifiedAddresses(
    { resolve: () => null },
    undefined,
    undefined,
    true,
  );
  assert.equal(geo.selectionRequired, true);
  assert.deepEqual(await geo.addressProvider!.suggest("Dubai Marina"), []);
  assert.equal(
    geo.resolveAddress!(
      "Dubai Marina",
      "Unknown tower",
      zoneSeed,
      "f".repeat(64),
    ),
    null,
  );
});
