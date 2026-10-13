import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  assets,
  collections,
  approved,
  destinations,
  whatsappUrl,
  productInquiry,
  visibleTestimonials,
  validateNewsletter,
  newsletterProvider,
  formatAed,
} from "../../src/brand/content";
test("brand content is approved, heritage fixed, no fabricated catalog or testimonials", () => {
  assert.equal(approved.heritage, "MEXICO CITY SINCE 1982");
  assert.equal(collections.featured.length, 3);
  // A product may only be listed once the owner has confirmed it. Anything
  // named must be fully specified — image, available status and a price —
  // and everything else must stay an unlisted, unorderable slot.
  for (const collection of Object.values(collections))
    for (const p of collection) {
      if (p.name) {
        // A photograph is optional — the card falls back to the brand media
        // panel — but the commercial facts must all be present.
        assert.equal(p.status, "available");
        assert.ok(
          typeof p.priceFils === "number" && p.priceFils > 0,
          `${p.id} listed without a price`,
        );
        assert.ok(productInquiry(p)!.includes(`order ${p.name}`));
      } else {
        assert.equal(p.image.src, null);
        assert.equal(p.status, "pending");
        assert.equal(p.priceFils, null);
        assert.equal(productInquiry(p), null);
      }
    }
  // Current approved Pan de Muerto and jar options populate legacy content views.
  const listed = Object.values(collections)
    .flat()
    .filter((p) => p.name);
  assert.equal(listed.length, 62);
  assert.equal(
    listed.find(
      (p) => p.id === "pan-de-muerto-traditional-ajonjoli-individual-70-g",
    )!.name,
    "Pan de Muerto tradicional · Ajonjolí · Individual · 70 g",
  );
  assert.equal(
    listed.find(
      (p) => p.id === "pan-de-muerto-traditional-ajonjoli-individual-70-g",
    )!.priceFils,
    1500,
  );
  assert.equal(
    formatAed(
      listed.find(
        (p) => p.id === "pan-de-muerto-traditional-ajonjoli-individual-70-g",
      )!.priceFils!,
    ),
    "AED 15",
  );
  assert.deepEqual(
    visibleTestimonials([
      {
        id: "unverified",
        source: "Google",
        text: "TEST ONLY",
        verified: false,
        permission: true,
      },
      {
        id: "no-permission",
        source: "WhatsApp",
        text: "TEST ONLY",
        verified: true,
        permission: false,
      },
    ]),
    [],
  );
  const source =
    readFileSync("src/brand/Experience.tsx", "utf8") +
    readFileSync("src/brand/content.ts", "utf8") +
    readFileSync("index.html", "utf8");
  assert.doesNotMatch(
    source,
    /1992|aggregateRating|streetAddress|Al Quoz|Valentina/,
  );
  // Prices may appear, but only the owner-confirmed one: this catches any
  // other amount being introduced into customer-facing brand content.
  for (const amount of source.match(/AED\s*\d[\d.,]*/g) ?? [])
    assert.equal(
      amount.replace(/\s+/g, " "),
      "AED 25",
      `unapproved price: ${amount}`,
    );
  for (const a of Object.values(assets))
    if (a.src) assert.ok(existsSync("public" + a.src));
  // Every listed product's image must actually exist on disk.
  for (const p of Object.values(collections).flat())
    if (p.image.src) assert.ok(existsSync("public" + p.image.src), p.image.src);
});
test("WhatsApp only accepts verified international destinations and safely encodes inquiry", () => {
  // Confirmed ordering number (22 September 2026); see src/brand/content.ts.
  assert.equal(destinations.whatsapp, "+971585943319");
  assert.equal(
    whatsappUrl(destinations.whatsapp, "hi"),
    "https://wa.me/971585943319?text=hi",
  );
  for (const n of [null, "", "javascript:alert(1)", "971 123", "+00000000"])
    assert.equal(whatsappUrl(n, "hello"), null);
  assert.equal(
    whatsappUrl("+971500000000", "Test & cake?"),
    "https://wa.me/971500000000?text=Test%20%26%20cake%3F",
  );
});
test("newsletter validates consent and never invents provider success", async () => {
  assert.ok(validateNewsletter("bad", true));
  assert.ok(validateNewsletter("test@example.invalid", false));
  assert.equal(validateNewsletter("test@example.invalid", true), null);
  await assert.rejects(
    newsletterProvider.subscribe(
      { email: "test@example.invalid", consent: true },
      new AbortController().signal,
    ),
    /not available/,
  );
});
test("critical motion has a global reduced motion fallback", () => {
  const css = readFileSync("src/brand/brand.css", "utf8").replace(/\s/g, "");
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /animation:none!important/);
  // The intro preloader was removed in TL-30; reduced motion must instead
  // guarantee revealed content resolves visible.
  assert.doesNotMatch(css, /b-preloader/);
  assert.match(css, /opacity:1!important/);
  assert.match(css, /scroll-behavior:auto/);
});
