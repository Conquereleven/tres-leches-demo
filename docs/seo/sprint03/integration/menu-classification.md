# Menu regression classification — final integration

Exact main baseline: `10a2176583da52890758dad57b9262a8af0e44f2`.
SEO implementation tested: `506298c97b9b9d9700976ce54156427372ee74e2`.
Both refs remain unchanged after fetching origin for final integration.

Reproduction: build each ref; run `playwright test --config playwright.menu.config.ts` with disposable SQLite and `tests/fixtures/web-checkout-server.ts`, as configured in the repository. Baseline used an equivalent config with a distinct loopback port (3292) and a 15-second per-test timeout for the repeated run; candidate used the original 60 seconds. Logs retained beside this report. Both finish **14 passed / 5 failed**, at identical assertions. No pricing, checkout, accessibility or production data was changed.

| Scenario / assertion | Root cause and evidence | Classification |
| --- | --- | --- |
| Precise sizes/fillings/packs, menu.spec.ts:59 | Selects filled pack `12 individuales`, then looks for an AED255 button. The fixture loads `data-imports/liza-current-menu.json`; that SKU is AED235. The recorded DOM displays AED235. Selector cannot resolve. | Pre-existing stale fixed-price expectation. |
| Multiple SKUs through cart/checkout, menu.spec.ts:82 | Selects traditional pack `6 mini`, then looks for AED72. Fixture SKU `pan-de-muerto-traditional-pack-6-mini` is AED60; recorded DOM displays AED60. Fails before cart/checkout. | Pre-existing stale fixed-price expectation. |
| Visual/accessibility/no-payment, 390px, menu.spec.ts:197 | The same traditional `6 mini` selection and AED72 button mismatch (actual AED60). Category and full-menu axe checks execute earlier; failure occurs at cart-add lookup. | Pre-existing fixture/expectation mismatch, not an established accessibility failure. |
| Same journey, 768px | Same assertion and mismatch. | Pre-existing fixture/expectation mismatch. |
| Same journey, 1440px | Same assertion and mismatch. | Pre-existing fixture/expectation mismatch. |

These tests never reach their downstream total/cart/checkout assertions after the stale selector fails. Do not describe those downstream assertions as passing. The independent checkout suite passed 33/33 and conversion suite passed 18/18 in Sprint 03; those results supplement rather than replace this incomplete coverage.

Recommended narrow follow-up: align the menu fixture and explicit expected prices to the reviewed October 13 policy, retaining independently asserted fixed prices (60 / 235 for these two SKUs), recalculating the known multi-SKU expected total from those approved facts (60 + 130 + 25 = 215), and preserving all cart/checkout, axe and no-payment assertions. Verify all subsequent failures before claiming closure. Keep the separate deliberate mismatched-server-price negative test. This is test maintenance; changing the commercial catalog to 72/255 would be wrong. Dynamic-only discovery notices in this bundled fixture also warrant explicit fixture-mode coverage in that follow-up.

No newly introduced SEO regression was established among these five scenarios. They remain baseline test debt and a condition for release review, not a green menu acceptance gate.
