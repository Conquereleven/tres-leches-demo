# Visual kitchen paid-order emails

Branch baseline: `7c72fd94826d63e3d244d20818bb462e051b2bc9` (current main when started).

Internal notifications now freeze both readable plain text and responsive table-based HTML inside the existing authoritative paid transition. Individual products and pack parent lines appear first; each valid preparation snapshot is nested inside its parent card. There are no component prices. Quantities describe the composition per box and the total pieces across the purchased boxes. Distinct compositions of the same SKU remain separate cards.

Preparation names/counts come only from the accepted `packSnapshot`, validated against its accepted composition. Current retail availability and Product Hub eligibility are never used to reconstruct historical contents. Parent names/prices use `order.catalogSnapshot` and the existing source-matched English name resolver. Missing, duplicate or invalid financial/preparation snapshots produce manual-review warnings. Paid total always comes from the authoritative payment, even on a mismatch.

Instructions and delivery notes are shown whole, as original customer text in a prominent instructions/allergies panel. There is no separate structured allergy field today: the email does not infer allergies or claim that an order is allergy-free. HTML escapes every dynamic string. The only generated link uses an HTTP(S) configured origin and an encoded order ID; the destination continues to require normal Operations authentication.

## Fictional preview and QA

- `node --import tsx scripts/preview-kitchen-email.ts`
- `npx playwright test --config=playwright.email.config.ts`
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:sites`, `npm run scan:secrets`, `npm run audit`

[HTML example](previews/fictional-paid-order.html) / [plain text](previews/fictional-paid-order.txt): fictional order #042, AED441; two individual chocolate conchas, two identical mixed 6-mini boxes, another 6-mini box with a different composition, one filled 12-individual box. The historical chocolate-covering example is NOT a current flavor approval. No prices or eligibility are changed by this sprint.

Browser checks cover 390/1024px in Chromium and WebKit, card hierarchy, exact totals, absence of component prices, complete notes, long unbroken text, escaped malicious markup, authenticated Operations link, no horizontal overflow and axe accessibility. Preview tests abort any network request. Unit/commerce tests use injected fake transports only. These are browser-rendered email previews, not an assertion of testing inside actual iPhone Gmail, Apple Mail or Outlook.

## Release after separate founder approval

1. Review/merge the exact PR head through the normal protected process. Obtain separate approval for Production deployment/internal delivery. Nothing in this PR deploys or sends mail.
2. Deploy the approved code using the existing controlled release procedure. No migrations or environment changes are required. Keep the existing recipients, sender, enable flags and provider secrets unchanged; do not print them.
3. Verify application health and Operations. Confirm previously sent rows retain their status/content and no historical rows are re-enqueued. Do not run the manual send-test command or replay old events.
4. When separately authorized to observe real delivery, inspect the next natural paid-order notification: parent/contents, exact quantities and amounts, original notes, one email per configured recipient and unchanged provider idempotency key. Perform actual-client UAT in iPhone Gmail and Apple Mail; no synthetic LIVE payment is necessary.

## Independent rollback

Revert this code release through the normal release process while retaining the active database. Never restore an earlier database, reset notification statuses or delete outbox event keys. The optional `html` field is backward-compatible: older code keeps sending stored plain text. Already-sent email cannot be recalled. Historical queued/sent content is never re-rendered; pending old text-only rows retain their existing delivery/expiry policy. Provider claims, unknown-outcome handling, duplicate suppression, recipient configuration and automatic retry policy are unchanged.

## Scope boundaries

No Production access, data writes, live email/provider requests, deployments, customer-email content changes, catalog edits, price/eligibility changes, Paymennt/Meta/Resend configuration changes or order/payment-state changes.

## Validation results (16 October 2026)

- Typecheck, lint and full build: passed.
- Commerce/unit/HTTP regression suite: **638/638 passed**, including 11 new visual-email/content/transport tests, existing verified-payment/duplicate-callback tests and frozen pack snapshots.
- Email browser suite: **6/6 passed** across Chromium and WebKit. Screenshots at 390 and 1024px; axe reported zero violations in those four rendered examples.
- Original Sites packaging tests: **4/4 passed**.
- Heuristic secret scan: **0 findings**; dependency audit: **0 vulnerabilities**.
- Actual email-client delivery was deliberately not performed; iPhone Gmail/Apple Mail inbox UAT requires separate authorization.
