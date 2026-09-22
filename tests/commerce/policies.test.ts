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
    assert.match(svg, /^<svg[^>]+viewBox=/);
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

test("the WhatsApp ordering number is still unconfirmed and is not guessed", () => {
  // Three support numbers are confirmed; none is approved as the WhatsApp
  // ordering line, so business.whatsapp must stay unset.
  assert.equal(business.whatsapp, null);
  assert.ok(
    pendingBusinessFacts().includes("business.whatsapp"),
    "whatsapp must remain listed as pending",
  );
});
