/**
 * TL-29 motion safety contract.
 *
 * These guard the two things that must never regress: content is visible
 * without JavaScript, and nothing Paymennt reviews or that converts is
 * reveal-gated.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PolicyPage, pages } from "../../src/brand/Policies";
import { policyRoutes } from "../../src/brand/business";

const css = readFileSync("src/brand/brand.css", "utf8");

test("the pre-reveal hidden state is scoped to the runtime-only data-motion flag", () => {
  // Every rule that sets opacity:0 for a reveal target must require
  // [data-motion="on"], which only useReveal sets.
  const hidingRules = css
    .split("}")
    .filter(
      (block) =>
        /\[data-reveal\]/.test(block) && /opacity:\s*0\s*;/.test(block),
    );
  assert.ok(hidingRules.length > 0, "expected at least one pre-reveal rule");
  for (const rule of hidingRules)
    assert.match(
      rule,
      /\[data-motion="on"\]/,
      `reveal-hiding rule is not gated on data-motion: ${rule.trim().slice(0, 120)}`,
    );
});

test("useReveal never arms the hidden state unless it can undo it", () => {
  const src = readFileSync("src/brand/useReveal.ts", "utf8");
  // Arms only inside arm(); reduced motion and missing IO both reveal instead.
  assert.match(src, /setAttribute\("data-motion", "on"\)/);
  assert.match(src, /typeof IntersectionObserver === "undefined"/);
  assert.match(src, /media\.matches\) revealAll\(\)/);
  assert.match(src, /failsafe = setTimeout\(revealAll/);
  assert.match(src, /removeAttribute\("data-motion"\)/);
});

test("reduced motion restores opacity and clears transforms for reveal targets", () => {
  const blocks =
    css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g) ??
    [];
  const reveal = blocks.find((b) => b.includes("[data-reveal]"));
  assert.ok(reveal, "expected a reduced-motion block covering reveal targets");
  assert.match(reveal, /opacity:\s*1\s*!important/);
  assert.match(reveal, /transform:\s*none\s*!important/);
});

test("the footer is never reveal-gated, so policy links and payment marks stay visible", () => {
  assert.match(
    css,
    /\[data-motion="on"\]\s*\.b-footer[\s\S]{0,120}opacity:\s*1/,
    "footer must be pinned visible while motion is armed",
  );
});

test("policy pages render fully visible with no motion attributes", () => {
  for (const { path } of policyRoutes) {
    const html = renderToStaticMarkup(createElement(PolicyPage, { path }));
    assert.ok(pages[path], `missing page for ${path}`);
    assert.doesNotMatch(html, /data-motion/, `${path} must not arm motion`);
    assert.doesNotMatch(
      html,
      /data-reveal/,
      `${path} must not reveal-gate content`,
    );
  }
});

test("prerendered storefront markup carries no hidden reveal state", () => {
  // data-revealed is only ever added at runtime; the static markup must not
  // ship an un-revealed element, which would render invisible without JS.
  const src = readFileSync("src/brand/Experience.tsx", "utf8");
  assert.doesNotMatch(
    src,
    /data-revealed/,
    "markup must not hardcode reveal state",
  );
});

test("hover scale stays within the 1-2% ceiling and the hero poster is not lazy", () => {
  const zoom = /--image-zoom:\s*([\d.]+)/.exec(css)?.[1];
  const hover = /--hover-scale:\s*([\d.]+)/.exec(css)?.[1];
  assert.ok(zoom && Number(zoom) <= 1.02, `image zoom ${zoom} exceeds ceiling`);
  assert.ok(
    hover && Number(hover) <= 1.02,
    `hover scale ${hover} exceeds ceiling`,
  );
  const src = readFileSync("src/brand/Experience.tsx", "utf8");
  assert.match(src, /\/brand\/approved\/story-desktop-poster.webp/);
  assert.match(src, /preload="none"/);
  assert.match(src, /autoPlay=\{allowMotion\}/);
  assert.match(src, /prefers-reduced-motion/);
  assert.match(src, /saveData/);
});
