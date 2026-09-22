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
} from "../../src/brand/content";
test("brand content is approved, heritage fixed, no fabricated catalog or testimonials", () => {
  assert.equal(approved.heritage, "MEXICO CITY SINCE 1982");
  assert.equal(collections.featured.length, 3);
  for (const collection of Object.values(collections))
    for (const p of collection) {
      assert.equal(p.name, null);
      assert.equal(p.image.src, null);
      assert.equal(p.status, "pending");
      assert.equal(productInquiry(p), null);
    }
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
    /1992|aggregateRating|streetAddress|Al Quoz|Valentina|AED\s*\d/,
  );
  for (const a of Object.values(assets))
    if (a.src) assert.ok(existsSync("public" + a.src));
});
test("WhatsApp only accepts verified international destinations and safely encodes inquiry", () => {
  // Confirmed ordering number (22 September 2026); see src/brand/content.ts.
  assert.equal(destinations.whatsapp, "+971521683319");
  assert.equal(
    whatsappUrl(destinations.whatsapp, "hi"),
    "https://wa.me/971521683319?text=hi",
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
  assert.match(css, /\.b-preloader\{display:none;?\}/);
  assert.match(css, /scroll-behavior:auto/);
});
