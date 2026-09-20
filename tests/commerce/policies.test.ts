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
