> SUPERSEDED VISUAL PROPOSAL: The founder has now supplied the actual screenshot. Use [the reference-based implementation](reference-kitchen.md); the previous heights and typography below are historical.

# Product-first kitchen email — final design adjustment

The founder's written specification replaces the previous compact proposal. No screenshot image accompanied the supplied attachment, so exact screenshot fidelity is **not claimed**. This implementation follows the approved written hierarchy and preserves 3L's soft pink, muted gold, white and neutral identity.

## Hierarchy and accepted information

A small text wordmark and order/PAID header precede a real product table with Product, Qty and Price columns. One row group represents each accepted line. Full recorded English product identity includes the accepted size/presentation; no mutable catalog lookup, inferred flavor or retail price is introduced. Quantity appears in its own explicit column for both singles and boxes. Pack headings retain the no-leading-quantity rule; plain text keeps individual quantity notation.

Pack composition occupies the full width directly under its parent, with per-box units, repeat count and physical-piece totals. Different mixtures of the same SKU remain separate row groups. Prices are accepted unit/box prices and purchased-line totals; no component charge is invented.

Instructions/allergies and original delivery notes follow products, then the paid total, schedule and compact secondary contact/address rows. All full-address and structured fields remain available. No billing address is added or duplicated. Unknown or inconsistent data retains review warnings. Large content scrolls; no clamps, hidden overflow or shortened notes.

All layout styling is inline, table-based and uses system fonts. Product/notes text is 14px; secondary/price text is 13px; the authenticated OMS link has a minimum 44px touch height. No product photographs, external fonts, scripts or tracking assets are added.

## Routing and frozen state

The redesign changes only the opted-in renderer. The exact original renderer, recipient-subset validation, paid-event recording, provider configuration, idempotency IDs, claim/dispatch behavior and historical frozen rows are unchanged. Empty OPERATIONS_EMAIL_COMPACT_TO means legacy for everyone. New synthetic previews use explicit `.invalid` fixture opt-ins; they are not commercial recipient configuration.

The previous compact plain-text output is retained as `previews/product-first-text-before.txt`, captured from the previously reviewed head `1f63a9362fada8d0e4b9e82de0bd58d7c9fb81c0`; a regression compares the new output byte-for-byte to that control. The legacy control is separately verified unchanged.

## Browser measurements

Full HTML heights, pixels, measured in both Chromium and WebKit (equal for these fixtures):

| Fixture | 320 | 375 | 390 | 430 |
|---|---:|---:|---:|---:|
| One uncomplicated product | 557 | 503 | 503 | 503 |
| Three uncomplicated products | 655 | 602 | 602 | 602 |
| One six-piece box plus three singles | 828 | 756 | 756 | 756 |
| Multiple boxes and distinct same-SKU compositions | 1188 | 1044 | 1044 | 1026 |
| Long original notes/allergy instructions | 2420 | 2113 | 2059 | 1932 |
| Pickup with box plus three singles | 752 | 699 | 699 | 699 |
| Missing historical pack preparation | 863 | 774 | 774 | 756 |

At 390px the legacy control is 2090px high, the superseded compact design was 784px and this four-line mixed-order design is 756px. This is presentation prioritization, not a guarantee that every order fits one screenshot. The one/three-simple-product cases fit the raw 844px browser viewport at all four widths; the large and long-note cases require vertical scrolling. The 320px missing-snapshot case also needs scrolling.

**Native-client usable email height: not measured; Gmail and Apple Mail acceptance remains PENDING.** Browser screenshots do not include real message headers, toolbars, OS display scaling or client transformations. Do not subtract an invented chrome height or certify iPhone screenshot fit from browser measurements. A received synthetic sample requires explicit internal test-recipient approval; none was sent. Native Mail window control failed in the earlier readiness audit, and no reliable new native received-message evidence exists.

Screenshots: `previews/product-first-{short,three,typical,large,long,pickup,review}-{chromium,webkit}-{width}.png`. Metrics for every fixture at every target width: `previews/product-first-metrics-{engine}-{width}.json`.

## Validation and release limits

Tests enforce semantic columns/row quantities, parent-first frozen box structure, distinct same-SKU compositions, full long instructions, exact known fixture totals, no horizontal overflow, 44px link, readable fonts, no rendering requests, escaping and zero axe violations. All samples derive from pre-existing accepted synthetic fixtures; no data from an unavailable mockup was copied.

Run build before commerce suites, then generate previews with `node --import tsx scripts/preview-kitchen-email.ts` and run the email/premium/Tricolor browser suites. Full exact-head GitHub results are recorded in PR #50 and renewed integration PR #52. After any source head changes, the earlier integration SHA is obsolete.

No main merge, Production deployment, variable change, real email, order/payment modification, catalog publication or commercial activation is authorized here. Native client UAT, exact private recipients, current off-volume backup/restore and explicit controlled-release approval remain separate gates.
