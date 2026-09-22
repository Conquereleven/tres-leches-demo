import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  business,
  deliveryBands,
  freeDeliveryAreas,
  legalEntityLabel,
  pendingBusinessFacts,
  policyRoutes,
  isPolicyPath,
} from "../../src/brand/business";
import { PolicyPage, pages } from "../../src/brand/Policies";
import { whatsappUrl } from "../../src/brand/content";
import { zoneSeed } from "../../server/domain/zones";
import { customerPages } from "../../server/http";

const render = (path: (typeof policyRoutes)[number]["path"]) =>
  renderToStaticMarkup(createElement(PolicyPage, { path }));

test("customer policy routes match the server allowlist and render", () => {
  assert.deepEqual(
    policyRoutes.map((r) => r.path),
    [...customerPages],
  );
  for (const { path } of policyRoutes) {
    assert.ok(isPolicyPath(path) && isPolicyPath(`${path}/`));
    assert.ok(pages[path].sections.length > 0);
    const html = render(path);
    assert.match(html, /<h1>/);
    assert.doesNotMatch(
      html,
      /lorem|ipsum|TODO|TBD|PLACEHOLDER|DATA SLOT|>null<|undefined|\[object/i,
    );
  }
  assert.equal(isPolicyPath("/terms-extra"), false);
});

test("terms identify the business and every page carries the global footer", () => {
  assert.ok(render("/terms").includes(legalEntityLabel()));
  if (business.legalName)
    assert.ok(render("/terms").includes(business.legalName));
  for (const { path } of policyRoutes) {
    const html = render(path);
    assert.match(html, /src="\/payments\/visa\.svg" alt="Visa"/);
    assert.match(html, /src="\/payments\/mastercard\.svg" alt="Mastercard"/);
    for (const link of [
      "/terms",
      "/privacy",
      "/refund-policy",
      "/delivery-policy",
      "/contact",
    ])
      assert.ok(html.includes(`href="${link}"`), `${path} links ${link}`);
  }
  for (const logo of ["visa", "mastercard"]) {
    const svg = readFileSync(`public/payments/${logo}.svg`, "utf8");
    assert.match(svg, /<svg[^>]*[\s\S]*?viewBox=/);
    assert.doesNotMatch(svg, /<script|href="http/i);
  }
});

test("refund and delivery policies cover the reviewer's required topics", () => {
  const ids = (p: keyof typeof pages) => pages[p].sections.map((s) => s.id);
  for (const id of [
    "before-payment",
    "after-payment",
    "issues",
    "limitations",
    "how-to-request",
    "refund-method",
  ])
    assert.ok(ids("/refund-policy").includes(id), id);
  for (const id of [
    "areas",
    "fees",
    "scheduling",
    "your-details",
    "delays",
    "failed-delivery",
  ])
    assert.ok(ids("/delivery-policy").includes(id), id);
  const privacy = render("/privacy");
  assert.match(privacy, /do not receive or store your\s+full card number/);
});

test("published delivery minimums stay identical to the operational zone seed", () => {
  const count = (area: string) =>
    area.replace(/\(.*?\)/g, "").split(/,| and /).length;
  const seedBands = new Map<number, number>();
  for (const z of zoneSeed.filter((z) => !z.freeDelivery))
    seedBands.set(z.minOrderAed!, (seedBands.get(z.minOrderAed!) ?? 0) + 1);
  assert.deepEqual(
    new Map(
      deliveryBands.map((b) => [
        b.minOrderAed,
        b.areas.reduce((n, a) => n + count(a), 0),
      ]),
    ),
    seedBands,
  );
  const free = zoneSeed.filter((z) => z.freeDelivery);
  assert.equal(free.length, count(freeDeliveryAreas.areas[0]!));
  assert.ok(
    free.every(
      (z) =>
        z.minOrderAed === freeDeliveryAreas.minOrderAed &&
        z.deliveryFeeAed === 0,
    ),
  );
  assert.ok(existsSync("docs/sources/delivery-minimums.jpeg"));
});

test("confirmed merchant identity and contacts render on the customer pages", () => {
  assert.equal(business.legalName, "Golositalia FZCO");
  assert.equal(business.tradingName, "Pastelerías 3L");
  assert.match(
    legalEntityLabel(),
    /Golositalia FZCO, trading as Pastelerías 3L/,
  );
  assert.ok(business.address?.includes("Cluster C"));
  assert.equal(business.supportContacts.length, 3);
  for (const c of business.supportContacts)
    assert.match(
      c.phone,
      /^\+971 \d{2} \d{3} \d{4}$/,
      `bad format: ${c.phone}`,
    );

  const terms = render("/terms");
  assert.ok(
    terms.includes("Golositalia FZCO"),
    "legal entity missing from Terms",
  );
  assert.ok(
    terms.includes("Pastelerías 3L"),
    "trading name missing from Terms",
  );

  const contact = render("/contact");
  assert.ok(
    contact.includes(business.address!),
    "address missing from Contact",
  );
  for (const c of business.supportContacts) {
    assert.ok(contact.includes(c.phone), `${c.phone} missing from Contact`);
    assert.ok(
      contact.includes(`tel:${c.phone.replace(/\s+/g, "")}`),
      `dialable link missing for ${c.phone}`,
    );
  }
});

test("the cancellation rule is stated consistently and never called a tax", () => {
  const refund = render("/refund-policy");
  const terms = render("/terms");
  for (const html of [refund, terms]) {
    assert.ok(html.includes("12 hours"), "12-hour cut-off missing");
    assert.ok(html.includes("90%"), "90% refund missing");
    assert.ok(html.includes("10%"), "10% fee missing");
    assert.ok(
      /non-refundable/.test(html),
      "inside-cut-off non-refundable rule missing",
    );
    // The fee is an administrative fee; it must not be described as a tax.
    assert.doesNotMatch(html, /\bVAT\b/, "must not describe the fee as VAT");
    assert.doesNotMatch(
      html,
      /Corporate Tax/i,
      "must not describe the fee as Corporate Tax",
    );
  }
  assert.ok(
    refund.includes("delivery of your order becomes impossible") ||
      refund.includes("becomes impossible"),
    "impossible-delivery refund reason missing",
  );
});

test("the WhatsApp ordering number is configured and every CTA derives from it", () => {
  assert.equal(business.whatsapp, "+971521683319");
  const url = whatsappUrl(business.whatsapp, "test");
  assert.ok(
    url?.startsWith("https://wa.me/971521683319?text="),
    `bad url: ${url}`,
  );
  assert.ok(!pendingBusinessFacts().includes("business.whatsapp"));

  // No component may build a wa.me link or embed the number independently.
  for (const f of [
    "Experience.tsx",
    "SiteChrome.tsx",
    "Policies.tsx",
    "primitives.tsx",
  ]) {
    const src = readFileSync(`src/brand/${f}`, "utf8");
    assert.doesNotMatch(
      src,
      /wa\.me/,
      `${f} must not build wa.me links directly`,
    );
    assert.doesNotMatch(src, /9715\d{8}/, `${f} must not hardcode the number`);
  }
});

test("no public hero development placeholder remains", () => {
  const src = readFileSync("src/brand/Experience.tsx", "utf8");
  assert.doesNotMatch(src, /ORIGINAL ASSET PENDING/);
  assert.doesNotMatch(src, /HERO FILM/);
  // The media slot itself must survive so the approved film can drop in.
  assert.match(src, /b-hero-media/);
  assert.match(src, /b-hero-canvas/);
});

test("the Mastercard mark is the official unmodified Brand Center artwork", () => {
  const svg = readFileSync("public/payments/mastercard.svg", "utf8");
  assert.match(svg, /viewBox="0 0 152\.4 108"/, "official viewBox altered");
  for (const colour of ["#FF5F00", "#EB001B", "#F79E1B"])
    assert.ok(svg.includes(colour), `official colour ${colour} missing`);
  assert.equal(
    Buffer.byteLength(svg),
    981,
    "file differs from the official artwork",
  );
  const chrome = readFileSync("src/brand/SiteChrome.tsx", "utf8");
  // Intrinsic size must match the official 152.4:108 ratio, to avoid CLS.
  assert.match(chrome, /width="45"\s*\n?\s*height="32"/);
});

test("payment marks are static, never reveal-gated", () => {
  const chrome = readFileSync("src/brand/SiteChrome.tsx", "utf8");
  const marks =
    /export function PaymentMarks[\s\S]*?\n}/.exec(chrome)?.[0] ?? "";
  assert.ok(marks, "PaymentMarks not found");
  assert.doesNotMatch(
    marks,
    /data-reveal/,
    "payment marks must not be reveal-gated",
  );
  for (const alt of ['alt="Visa"', 'alt="Mastercard"'])
    assert.ok(marks.includes(alt), `${alt} missing`);
});

test("no customer-visible development placeholder reaches the rendered page", () => {
  // Experience.tsx imports brand.css, which the node test loader cannot read,
  // so the storefront is checked at source level: comments are stripped and
  // the remaining JSX text and string literals must carry no dev placeholder.
  const banned =
    /\b(IMAGE PENDING|DATA SLOT|awaiting confirmation|awaiting approval|awaiting delivery|Approved content pending|ORIGINAL ASSET PENDING|pending approval|pending confirmation|Provisional categories|TBD|Lorem ipsum)\b/i;
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  for (const file of ["Experience.tsx", "SiteChrome.tsx", "primitives.tsx"]) {
    const hit = banned.exec(
      stripComments(readFileSync(`src/brand/${file}`, "utf8")),
    );
    assert.equal(hit, null, `${file} renders a placeholder: "${hit?.[0]}"`);
  }
  // Policy pages are rendered for real and must be equally clean.
  for (const { path } of policyRoutes) {
    const text = renderToStaticMarkup(
      createElement(PolicyPage, { path }),
    ).replace(/<[^>]+>/g, " ");
    const hit = banned.exec(text);
    assert.equal(hit, null, `${path} renders a placeholder: "${hit?.[0]}"`);
  }
  // The HTML shell's noscript copy is customer-visible too.
  assert.doesNotMatch(readFileSync("index.html", "utf8"), banned);
});

test("the Visa mark is the official Brand Mark DIGITAL 2025 artwork", () => {
  const svg = readFileSync("public/payments/visa.svg", "utf8");
  assert.match(
    svg,
    /viewBox="0 0 278\.075 169\.374"/,
    "official viewBox altered",
  );
  assert.ok(svg.includes("#1434cb"), "official Visa Blue missing");
  assert.ok(svg.includes("VBM_bluRGB_2025"), "not the official blue RGB file");
  assert.equal(
    Buffer.byteLength(svg),
    1560,
    "file differs from the official artwork",
  );
  const chrome = readFileSync("src/brand/SiteChrome.tsx", "utf8");
  assert.match(chrome, /width="53"\s*\n?\s*height="32"|width="53" height="32"/);
});

test("the intro preloader is gone and nothing gates first paint", () => {
  const css = readFileSync("src/brand/brand.css", "utf8");
  const src = readFileSync("src/brand/Experience.tsx", "utf8");
  assert.doesNotMatch(css, /b-preloader/);
  assert.doesNotMatch(src, /b-preloader/);
  assert.doesNotMatch(src, /3l-entered/);
  assert.doesNotMatch(readFileSync("index.html", "utf8"), /b-preloader/);
});
