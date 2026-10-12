# Operations English product and ticket presentation

Product descriptions and ticket contents use English independently of the EN/TL interface preference. Customer-authored notes are preserved verbatim and labelled as original notes. Print Center remains preview-only.

## Display contract

`src/commerce/ops-product-names.json` stores complete, explicit English descriptions for all 236 SKUs in the canonical menu (216 active, 20 inactive). It contains no prices. Traditional names and approved ingredients remain intact; no assortment or recipe is inferred. Storefront translations were not reused because some English storefront labels themselves contain Spanish descriptions.

The resolver uses SKU identity plus an exact recognized source name. Accepted orders use their stored catalog snapshot, never today's catalog for display reconstruction. Unknown SKUs, missing names, duplicate snapshot matches and unrecognized historical definitions preserve the available original identification and show **Product translation requires review**. There is no runtime translation, token substitution, database write or provider call.

When a new SKU or renamed definition is approved, add an explicit reviewed mapping and extend the coverage tests. A historical name differing from both the recognized source and English string requires review; do not silently overwrite it. None of the 236 supported definitions is missing a translation. Custom/future definitions deliberately fail visibly instead of guessing.

The resolver is shared by order cards, detail panels, production, delivery, Inbox, draft product selection, Copilot product action previews, original/English/SKU order search, and Kitchen/Reception tickets. UI controls retain their selected EN/TL language. Original customer messages and AI customer-facing suggestions are not translated by this presentation layer.

`ticket-snapshot.ts` and its existing missing/incomplete/inconsistent snapshot protections are unchanged. Prices, quantities, accepted names, state machines, RBAC and live data are unchanged. Since the integration with Product Hub V2 (`docs/product-hub/integration-candidate.md`), English names approved there at publication are accepted by the same resolver under the same rule: SKU plus exact recorded definition, otherwise the original text and the review warning.

## Screenshot evidence

All screenshots use synthetic local data. The historical line is 2 × AED 18 = AED 36, even when the current catalog fixture is renamed and repriced to AED 999. Before captures use the requested baseline `5d47c9d09b629bec73d47b34026848ca9ccca72a`; the hotfix is based on updated main `5cab4d114993cda0fa483b81e63c3539814ab4b3`, which added BRAND-02 without changing Operations.

| Interface / view | Before | After |
| --- | --- | --- |
| English / orders | [Before](screenshots/before-en-orders.png) | [After](screenshots/after-en-orders.png) |
| Tagalog / orders | [Before](screenshots/before-tl-orders.png) | [After](screenshots/after-tl-orders.png) |
| English / Kitchen | [Before](screenshots/before-en-kitchen.png) | [After](screenshots/after-en-kitchen.png) |
| Tagalog / Kitchen | [Before](screenshots/before-tl-kitchen.png) | [After](screenshots/after-tl-kitchen.png) |
| English / Reception | [Before](screenshots/before-en-reception.png) | [After](screenshots/after-en-reception.png) |
| Tagalog / Reception | [Before](screenshots/before-tl-reception.png) | [After](screenshots/after-tl-reception.png) |

## Regression evidence

The dedicated browser cases cover both languages in Chromium and WebKit: English products, both ticket destinations, original notes, original/English/SKU search, frozen historical prices, unknown translation warnings, production/delivery/Inbox/draft/Copilot labels, and absence of mutation requests or print actions. Existing historical snapshot, RBAC, responsive and checkout tests remain enabled.

Final local validation on the integrated candidate: typecheck, lint and build passed; commercial/unit/integration 498/498; Sites 4/4; Operations Chromium/WebKit 46/46; checkout Chromium 19/19 and WebKit 19/19; entry/workflow/Copilot 7/7; secret scan zero findings; npm audit zero vulnerabilities. An initial parallel Chromium run timed out during cart setup; its isolated rerun and final integrated run both passed 19/19 with no checkout changes or suppressed assertions.

Operations used an equivalent temporary Playwright config on port 3268 because 3242 was occupied by another workspace; no other server was stopped. Checkout and workflow tests used their existing isolated fixtures. No Production access, provider calls, print jobs, deployment or merge occurred.
