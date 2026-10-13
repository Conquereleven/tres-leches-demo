# UX, CRO and Operations experience audit — Pastelerías 3L Dubai

Agent A3 · branch `audit/3l-conversion-oms` · base `origin/main` `def0c1f` · 13 October 2026

Stage 1: diagnosis and proposals only. No application code, commercial rule, checkout, price, delivery rule, state machine or Product Hub file was changed. This pull request adds this document and screenshots.

## 1. Summary

| Area       | Critical | High | Medium | Low | Total |
| ---------- | -------- | ---- | ------ | --- | ----- |
| Storefront | 0        | 4    | 9      | 5   | 18    |
| Operations | 0        | 4    | 9      | 3   | 16    |

The five issues that matter most:

1. **SF-01** — `/menu`, `/cart` and `/checkout` first paint the _home page_, then swap to the real page when the bundle has run. Lab, slow 4G: the route's own content appears after 6.5–7.1 s; layout shift 0.43 (cart) and 0.57 (checkout).
2. **SF-02** — Nothing is cached. Every step of the purchase re-downloads the 388 kB (gzip) script plus home-page images: about 1.3–1.4 MB per step, about 10.7 MB for home → menu → product → cart → checkout.
3. **SF-03** — The delivery minimum (AED 30 to AED 300 depending on the area) is first shown at checkout step 2 of 5, after the cart. Menu, product page and cart do not state it.
4. **OP-01 / OP-02** — Kitchen sorts pickups last regardless of date, and Kitchen and Deliveries are one flat list with no day grouping, filter or search. Deliveries lists every delivered order ever, and pickups.
5. **OP-03** — On the order page the customer's preparation instructions (plaque text, allergies) sit at the bottom of the Delivery card, about 2,900 px below the "Start preparation" button on a phone.

There is **no conversion data**. The site has no analytics of any kind (verified, section 7). Every statement about conversion impact in this document is a heuristic and is labelled as such; every number is a measurement with its method.

## 2. Method and limits

**What was run**

- Production build of this branch (`npm run build`), served by the repository's fixture server `tests/fixtures/web-checkout-server.ts` on `127.0.0.1:3431` with a disposable SQLite database, the approved menu import (`data-imports/liza-current-menu.json`, 216 SKUs, 94 delivery areas) and the fixture payment stub. The payment provider's page was replaced by a local stub in the browser; no request left the machine.
- Operations screens: the same build with `**/api/**` mocked by `omsWorkspace()` (`tests/fixtures/oms.ts`), as `tests/operations-e2e/oms.spec.ts` does. No login, no writes (0 write requests recorded).
- Playwright Chromium, viewports 390×844 (touch, mobile emulation), 768×1024 and 1440×900. Storefront in English, Arabic (RTL) and Spanish.
- axe-core through `@axe-core/playwright`, tags `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa`.
- Timings: Chromium DevTools protocol, cold cache, 390×844, median of 3 runs, two profiles: unthrottled, and "slow 4G" (1.6 Mbit/s down, 750 kbit/s up, 150 ms latency, CPU ×4). Because the local server does not compress and the production edge does, the timing runs went through a throwaway local gzip proxy (port 3432) so transfer sizes match production (script 388 kB local vs 389 kB observed live).
- Code reading of `src/brand/`, `src/commerce/`, `server/http.ts`, `server/observability.ts`, fixtures and docs. File references are `path:line` at `def0c1f`.
- Live site `https://www.3ldubai.ae`: read-only `GET` of `/`, `/menu`, `/cart`, the script, the stylesheet and one image, to compare headers and the HTML shell. No form, login or checkout. The live script is the same file as this build (`index-NoR7xVQe.js`).

**Limits**

- Lab measurements on one machine. They rank problems; they are not field data and not what a customer in Dubai experiences.
- Chromium only. Safari and real phones were not tested.
- Screenshots contain synthetic fixture data only. Fixture orders use one legacy product (`pan-de-muerto`), so Operations screens show the "translation requires review" flag on every line; in production it appears only for unreviewed names.
- Heuristic findings are marked **(heuristic)**. Nothing here is a measured conversion effect.
- Throwaway scripts lived in the git-ignored `work/` directory and are not part of the pull request.

## 3. Storefront findings

Owner column: **Claude** = Claude team; **Codex** = Codex team (Product Hub, checkout and cart UI in `src/brand`, which this stage must not edit).

### High

**SF-01 · Menu, cart and checkout paint the home page first** — High

- Evidence: `screenshots/sf-16-menu-before-js-mobile.png` (what `/menu` shows before JavaScript runs: the home hero). `server/http.ts:1053-1068` serves `index.html` for any customer page without its own prerendered file; only the home and four policy pages are prerendered. `/menu`, `/cart` and `/checkout` return the 79,781-byte home document with the home `<title>` and `<h1>` (also observed on the live site for `/menu`).
- Measurement (slow 4G profile, cold): first paint 1.2 s shows the home page; the route's own content appears at 6.6 s (menu, product) and 7.1 s (cart, checkout). Layout shift 0.434 on cart and 0.571 on checkout (0.1 is the usual "good" limit). Unthrottled: 0.15–0.22 s, no visible swap.
- Affected: every customer on a phone connection; most visible on cart and checkout.
- Recommendation: for routes without a prerendered page, serve a neutral shell (header, page title, loading skeleton) instead of the home page; or prerender a shell per route. Presentation only: no checkout logic changes. The wrong `<title>`/`<h1>` on `/menu` also matters for search; cross-reference with the A1 audit.
- Owner: Claude (server static shell, prerender script). Dependency: Codex review, because cart and checkout render inside that shell.

**SF-02 · No caching: each step downloads the whole application again** — High

- Evidence: responses for `/assets/index-*.js`, `/assets/index-*.css` and `/brand/*` carry no `Cache-Control`, `ETag` or `Last-Modified` (local build, and the same on the live site by header inspection). Navigation between menu, cart and checkout is a full page load (`<a href>`).
- Measurement (one browser session, pages in purchase order, production-like gzip): home 5.24 MB (of which 3.83 MB hero video on mobile), menu 1.36 MB, product 1.42 MB, cart 1.32 MB, checkout 1.32 MB — 10.7 MB in total, with the 388 kB script transferred five times. Cart and checkout also download home-page images they never show (`editorial-mexico-dubai.webp` 335 kB, `editorial-journey.svg` 200 kB, `alicia.webp` 104 kB) because of SF-01.
- The bundle is one file: 1,431.9 kB minified, 387 kB gzip, and includes Operations and Product Hub code that customers never use (Vite build output).
- Affected: all customers; cost is highest on mobile data.
- Recommendation: `Cache-Control: public, max-age=31536000, immutable` for hashed `/assets/*`; a long cache with revalidation for `/brand/*`; then split Operations and Product Hub out of the customer bundle (lazy route). No dependency added.
- Owner: Claude (static file headers in `server/http.ts`, build split). Needs approval: it is a server change and must be verified against the Railway edge.

**SF-03 · The delivery minimum is discovered at checkout, not before** — High **(impact is heuristic)**

- Evidence: `screenshots/sf-08-checkout-minimum-mobile-full.png`. Minimums in the approved data: 18 areas at AED 30, 18 at 50, 11 at 100, 16 at 150, 9 at 200, 2 at 250, 20 at 300. Single items start at AED 13. The minimum appears only after an area is chosen in checkout (`src/brand/Shop.tsx:1161-1183`). The cart says only "Delivery is included once your area's minimum order is reached" (`Shop.tsx:852-857`) without a figure or a link. The full table exists in the Delivery Policy page.
- Affected: delivery customers, most of all in the AED 150–300 areas with small baskets.
- Recommendation: let the customer choose the area in the cart (the same approved typeahead and the same canonical zone id; the existing checkout draft already stores it), show "AED X more for delivery to <area>", and link "Delivery areas and minimums" from menu and cart. No rule or price changes: the server keeps validating exactly as today.
- Owner: Codex (cart and checkout UI). Needs owner approval for new customer copy in three languages.

**SF-04 · Floating cart and WhatsApp buttons cover content and primary actions on phones** — High

- Evidence: `sf-03-menu-card-added-mobile.png` (the floating "Cart (1)" pill covers the price on "ADD TO CART · AED 15"), `sf-08-…` (covers the minimum-order message), `sf-10-checkout-review-mobile-full.png` (covers the billing address), `sf-15-ar-checkout-mobile.png` (covers a field label in Arabic). Measured position at 390×844: cart pill 111×48 px at x 267, y 776; WhatsApp 46×48 px at x 12, y 776. The checkout shell also renders it (`Shop.tsx:442`), where a "Cart" shortcut is redundant.
- Affected: all phone customers.
- Recommendation: do not render the floating cart on `/cart` and `/checkout`; on menu pages reserve bottom space equal to its height, or make it a full-width bar under the content. WhatsApp help stays available.
- Owner: Codex for the checkout shell; Claude for menu pages (`SiteChrome.tsx`).

### Medium

**SF-05 · Finding a product on a phone takes a lot of scrolling** — Medium (measurements; impact heuristic)

- Evidence: `sf-01-menu-mobile.png`, `sf-02-menu-desktop.png`. At 390 px: the category buttons wrap to a 222 px block that is not sticky; the first photo starts at y 747 and the first price and add button at y 1,409 (1.7 screens down); each card is 735 px tall; the default category (20 products) makes a 17,992 px page. At 1440×900 the first product row starts at y 734. There is no search. Changing category means scrolling back to the top.
- Recommendation (within the approved design): sticky single-row category chips under the header (horizontal scroll), a shorter menu introduction on phones, and a "back to categories" affordance. See wireframe W1.
- Owner: Claude, coordinated with Codex (`MenuCatalog.tsx` was touched by the dynamic catalog work).

**SF-06 · Cart and checkout show raw catalog names, twice** — Medium

- Evidence: `sf-05-cart-mobile.png`: title "Pan de Muerto tradicional · Azúcar · Individual · 70 g" followed by the identical text as description (`Shop.tsx:744`; the checkout config returns `description` equal to `name`). The menu card for the same product is titled "Azúcar Pan de Muerto tradicional". In the English site the cart line is Spanish.
- Recommendation: hide the description when it equals the name; show the storefront product title plus size, as the menu does.
- Owner: Codex (cart UI and Product Hub naming).

**SF-07 · Disabled buttons do not say why** — Medium

- Evidence: "CONTINUE TO DETAILS" is disabled until a server quote is eligible (`Shop.tsx:1389`), so an untouched form shows a faded button and no message; below the minimum, the explanation is about 600 px above the button on a phone (`sf-08-…`). "PAY AED 60" is disabled until the checkbox is ticked (`Shop.tsx:2294`); the button has no `aria-describedby` (measured `null`).
- Recommendation: keep the button enabled and explain on press (message plus focus on the field), or put one line of reason text directly above the button.
- Owner: Codex.

**SF-08 · Form errors are generic and not attached to the field** — Medium

- Evidence: submitting step 1 with an empty address gives only the browser's own bubble ("Please complete this field.", focus on the field, 0 in-page alerts). Browser bubbles follow the browser language, not the site language (heuristic for AR/ES; measured in EN only). Step 2: an invalid mobile shows one paragraph above the button ("Please enter a valid UAE mobile number.", `sf-09-checkout-details-error-mobile.png`); the field gets `aria-invalid` but focus stays on the button and nothing is shown beside the field.
- Recommendation: inline message under the field, in the site language, with focus moved to the first invalid field.
- Owner: Codex.

**SF-09 · The pay button and the review card understate what happens next** — Medium **(heuristic)**

- Evidence: `sf-10-…`, `sf-11-checkout-review-desktop.png`. The button says "PAY AED 60" but it opens Paymennt's page, where the card is entered. The "Your order" review card lists items without prices or a total; on phones the total is only in the collapsed summary bar and on the button.
- Recommendation: "CONTINUE TO SECURE PAYMENT · AED 60", and show subtotal and total inside the review card. Copy needs approval in EN/ES/AR.
- Owner: Codex.

**SF-10 · "Fulfillment" is internal vocabulary** — Medium **(heuristic)**

- Evidence: cart button "CONTINUE TO FULFILLMENT" (`Shop.tsx:863`), progress step "Fulfillment" (`Shop.tsx:358`), consent text "fulfillment details".
- Recommendation: "Delivery or pickup" (the step's own page title already says this). Copy approval needed.
- Owner: Codex.

**SF-11 · The delivery-area list is not in alphabetical order** — Medium

- Evidence: `sf-07-checkout-area-list-mobile.png`. Opening the field lists all 94 areas in stored order: JLT Cluster O…Y, One JLT, Mazaya, …, and JLT Cluster A–D last. Typing works well (prefix, alias and misspelling matching).
- Recommendation: sort the unfiltered list by name. Display only; ids and validation unchanged.
- Owner: Codex (`AreaField.tsx`).

**SF-12 · Product pages say very little** — Medium **(heuristic)**

- Evidence: `sf-04-product-mobile-full.png`: photo, name, price, size, quantity, button, gallery. No description, ingredients or allergens, servings, storage, lead time for this product, or delivery note; about 200 px of empty space above "Back to menu" on a phone.
- Recommendation: add the content fields when Product Hub provides them (description, allergens, servings); until then a fixed line linking to delivery areas and the ordering cutoff.
- Owner: Codex / Product Hub for fields; the owner for content.

**SF-16 · The Privacy Policy describes browser storage inaccurately** — Medium (needs owner approval)

- Evidence: `src/brand/Policies.tsx:691-698` says the site "uses your browser's session storage only to remember that you have already seen the opening animation". The code stores: `localStorage` `3l-cart` (`cart.ts:39`) and `3l-language` (`localization.tsx:107`); `sessionStorage` `3l-checkout-draft` with name, phone, email and address until payment or tab close (`Shop.tsx:285`), `3l-checkout` (checkout key, `Shop.tsx:2026`) and `3l-cutoff-notice` (`Shop.tsx:981`). No "opening animation" key exists in `src/brand`.
- The statement "does not use analytics, advertising or tracking cookies" is correct (section 7).
- Recommendation: correct the sentence to list what is actually stored and why. Legal copy: owner decision.
- Owner: Claude, after owner approval.

### Low

- **SF-13 · Small touch targets.** Footer phone links 95×15 px (below the 24 px WCAG 2.5.8 minimum); product title links 29 px tall; header logo link 38 px tall; checkout radio and checkbox inputs 20×20 px (their labels are tappable, which mitigates it). Owner: Claude (footer), Codex (checkout).
- **SF-14 · "Clear cart" uses a browser dialog with untranslated English text** (`Shop.tsx:838`, `window.confirm("Remove all items from your cart?")`). Owner: Codex.
- **SF-15 · Home preview tiles link to a category, not the product shown** (`Experience.tsx:233`). Owner: Claude.
- **SF-17 · Before payment the return page labels the internal reference as "Order number"** (`TL-…`, `sf-12-return-pending-mobile.png`); after payment it becomes `#012`. By design (Order Experience V2), but two different "order numbers" can confuse; label the first as "Reference". Owner: Codex.
- **SF-18 · On phones the home page's first screen is only the video** (no route to the menu without scrolling or opening the menu button) **(heuristic)**; the mobile hero video is 3.83 MB. Owner: Claude.

### What works well (measured)

- axe: 0 violations on all 33 storefront page-states (section 5).
- No horizontal overflow at 390, 768 or 1440 px in EN, ES or AR.
- Keyboard: logical order on the menu (skip link → navigation → language → cart → categories → product → size → quantity → add); every stop has a 3 px outline plus halo.
- Reduced motion: 0 running animations and the hero video does not autoplay (1–2 running animations and autoplay otherwise).
- Contrast measured on body, captions, labels, buttons: 5.5:1 to 15.3:1.
- Arabic: `dir="rtl"`, mirrored layout, no overflow (`sf-14-…`, `sf-15-…`).
- Payment states are honest: a pending payment is shown as "Payment has not been confirmed yet" with a way back to the provider (`sf-12-…`); confirmation appears only for a reconciled paid order (`sf-13-…`).

## 4. Operations findings

### High

**OP-01 · Kitchen puts pickups at the bottom whatever their date** — High

- Evidence: `screenshots/ops-09-kitchen-tablet-full.png`: pickup #013 due today 5:00 PM is listed after a delivery due tomorrow. `src/commerce/orders-board.ts:77-81` (`byDue`) compares `delivery.date` only; a pickup has `pickup.pickupDate`, so it sorts as "no date".
- Affected: kitchen staff; pickups risk being started late.
- Recommendation: sort by the existing `dueDate()` (`order-view.ts`), then by time slot. Pure presentation function with unit tests.
- Owner: Claude. Small.

**OP-02 · Kitchen and Deliveries are flat lists without grouping, filters or search** — High

- Evidence: `ops-08-kitchen-mobile.png`, `ops-09-…`, `ops-10-deliveries-tablet.png`. `Workspace.tsx:1512-1520` filters by state only. Today's and future orders are mixed; Deliveries includes every "Delivered" order with no date limit (the list only grows) and pickup orders ("Confirm pickup" under Deliveries). The helpers for this already exist and are unit-tested but are not connected to any screen: `BOARD_VIEWS` (Today / Upcoming / All), `BOARD_FILTERS`, `matchesView`, `matchesFilter`, `boardMetrics`, `dueLabel` in `orders-board.ts` (referenced only from `tests/commerce/ux-states.test.ts`).
- Affected: kitchen and dispatch staff, more each day as history accumulates.
- Recommendation: connect the existing helpers: Today / Upcoming tabs with counts, "Today · Tomorrow · Overdue" labels, delivered orders limited to today by default, pickups shown as their own group.
- Owner: Claude. Medium effort. No state-machine change.

**OP-03 · Preparation instructions are at the bottom of the order page** — High

- Evidence: `ops-06-order-mobile-full.png`. "Preparation instructions — Happy birthday plaque, no nuts" is rendered inside the Delivery card (`OrderDetails.tsx:776`), the last-but-one card: about y 2,900 of a 3,296 px page at 390 px, while "Start preparation" is at the top. On the Kitchen card the same note is near the items.
- Affected: anyone preparing from the order page; an allergy or plaque note can be missed.
- Recommendation: show preparation instructions with the items (or directly under the action); keep delivery notes in the Delivery card.
- Owner: Claude. Small.

**OP-04 · Order cards are too tall and their labels too small for kitchen devices** — High (measurements; fit for the kitchen is heuristic)

- Evidence: card height 475–790 px at 390 px wide and 454–769 px at 768 and 1440 px: one order per screen. The next-step button is 347–662 px into the card. On the Kitchen screen 27 text elements are 10 px and 29 are 11 px (progress labels 10 px, field labels 11 px). Kitchen cards carry four address fields, often "Not stored", that the kitchen does not use.
- Recommendation: a compact kitchen card (wireframe W2): number, due time, items in large type, instructions, one action; address block only in Deliveries; 12 px minimum label size.
- Owner: Claude. Medium effort; palette and status rules unchanged.

### Medium

**OP-05 · The customer-name rule differs between screens.** `OrdersBoard.tsx:103` and the reception ticket (`PrintCenter.tsx:126-130`) use the conversation label, so Deliveries, Inbox and the ticket show the area "JVC" as the customer (`ops-10-…`, `ops-11-inbox-mobile.png`), while the Orders list and order page use `customerName()` and show "Name not recorded". Recommendation: use `customerName()` everywhere. Owner: Claude. Small.

**OP-06 · The translation-review flag is presented two ways.** Cards and tickets print it in bold inside the product line: "Pan de Muerto — Product translation requires review (pan-de-muerto)" (`OperationalProductName.tsx:16-21`), which dominates the item. The order page shows name, SKU and a separate chip (`OrderDetails.tsx:467`, `ops-06-…`). `docs/operations/oms/README.md` records that cards kept the old presentation. Recommendation: adopt the chip on cards; keep the full sentence on printed tickets. Owner: Claude. Small.

**OP-07 · Address warnings: beside the action on the order page, mid-card elsewhere.** The order page repeats the warning next to "Send for delivery" (`OrderDetails.tsx:193-205`). Cards show up to two warning paragraphs in the middle, on every card including Kitchen ones where dispatch is two steps away; "not verified" is the normal case (`address-dispatch-review.md`, finding 3), so the warning is on most cards and loses meaning. Recommendation: proposal 4 of that review (same beside-the-button warning on Deliveries cards); in Kitchen show only "Address incomplete". Advisory only, no blocking. Owner: Claude; the owner should confirm the wording.

**OP-08 · The Orders list cannot be ordered by due date.** Sorting is newest-created only (`order-view.ts:287`); the "Date" column is the creation time and the due date is small secondary text in the last column (`ops-04-orders-desktop.png`). Date-range filters exist but need four taps. Payment problems are reachable only through the Filters panel. Recommendation: "Due today / tomorrow" quick filters using the existing `dueFrom`/`dueTo`, a sort switch, and a "Payment issue" tab. Owner: Claude.

**OP-09 · Overview cards do not open the matching list.** Every card opens the unfiltered Orders list, except Deliveries (`OperationsOverview.tsx:53`); "Orders requiring attention: 1" lands on all 9 orders with no way to see which one (`ops-01-overview-mobile.png`). Recommendation: link Paid/confirmed, Preparing and Ready to `?status=…` (already supported); list the attention orders by number on the Overview. Owner: Claude. Small.

**OP-10 · On phones the shell uses the first third of the screen.** The top bar is about 110 px and always shows a "Dashboard language" selector; then eyebrow, title, description and Refresh. First order content starts at y 270 on Kitchen and y 520 on Orders (of 844) (`ops-03-orders-mobile.png`, `ops-08-…`). Recommendation: move language into the drawer or Settings below 768 px; hide the page description on phones. Owner: Claude.

**OP-11 · Cards have no tap-to-call or map link.** The phone on a card is plain text (`OrdersBoard.tsx:110`); the order page has a `tel:` link (`OrderDetails.tsx:675`). No screen links the address to a map. Recommendation: `tel:` link on cards; a map link is a separate decision because it sends the address to a map provider when tapped. Owner: Claude; map link needs approval.

**OP-12 · Print Center order picker.** One select with every order, including unpaid, cancelled and drafts, by number only, in stored order (`PrintCenter.tsx:49`, `ops-12-print-tablet.png`); no link from an order to its ticket preview. Recommendation: limit to paid orders, due date first, add customer and due time to the option text, and "Preview ticket" on the order page. Preview-only status unchanged. Owner: Claude.

**OP-16 · Inbox on a phone.** Filters fill the first 570 px before the first conversation; the open conversation renders below the list on the same 2,807 px page (`ops-11-…`). Recommendation: collapse filters behind one button; list → conversation as two views below 768 px. Owner: Claude.

### Low

- **OP-13 · Hard-coded strings.** `` `Asignado a ${assignee}.` `` bypasses translation (`OrdersBoard.tsx:269`); `.replace("Atrasado · ", "")` no longer matches anything (`OrdersBoard.tsx:169`). Owner: Claude.
- **OP-14 · Small touch targets.** Order-number links 91×18 px (the row is also clickable), phone and WhatsApp links 104–115 × 18–21 px, drawer button 38×44 px, "Order history" disclosure 37 px tall. Owner: Claude.
- **OP-15 · Whole-workspace polling every 3 seconds** (`Workspace.tsx:121`; 3 requests per 10 s measured on an idle screen, also when nothing changes). Payload size with real history was not measured. Recommendation: pause while the tab is hidden; conditional requests later (server change, needs approval). Owner: Claude.

### What works well (measured)

- axe: 0 violations on all 24 Operations page-states.
- No horizontal overflow at any of the three widths; the orders table becomes labelled cards on phones.
- State is carried by icon and label; contrast 4.7:1 (ink on gold button) to 15.3:1.
- Orders search matches number, name, phone digits, email, area and product; filters live in the URL.
- Payment state is explicit per order (Paid, Awaiting payment, Payment in review, Payment expired, No payment); unpaid orders are marked "Not in the kitchen queue".

## 5. Accessibility results

axe-core, WCAG 2.0/2.1/2.2 A and AA rule tags. **0 violations on 57 page-states.** Automated checks find only part of accessibility problems; manual findings are in sections 3 and 4.

| Surface    | Pages checked                                                                          | Viewports      | Violations |
| ---------- | -------------------------------------------------------------------------------------- | -------------- | ---------- |
| Storefront | home, menu, product, cart, checkout step 1                                             | 390, 768, 1440 | 0 (15)     |
| Storefront | checkout step 2, review/pay, return pending, return paid, return declined              | 390, 1440      | 0 (10)     |
| Storefront | Arabic and Spanish: home, menu, cart, checkout step 1                                  | 390            | 0 (8)      |
| Operations | Overview, Orders, Order (#012), Order (#014), Kitchen, Deliveries, Inbox, Print Center | 390, 768, 1440 | 0 (24)     |

Manual checks:

| Check            | Result                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Focus order      | Storefront menu: logical, 22 stops recorded. Checkout moves focus to the step heading on each step.                                                                      |
| Focus visibility | 3 px solid outline plus halo on every storefront stop.                                                                                                                   |
| Labels           | All form controls have accessible names (axe `label` passes). Errors are not associated with fields (SF-08).                                                             |
| Contrast         | Storefront 5.5–15.3:1; Operations 4.7–15.3:1 (computed colours).                                                                                                         |
| Touch targets    | Below 24 px: storefront footer phone links; Operations order-number and phone links (SF-13, OP-14). Floating buttons overlap content (SF-04), which axe does not detect. |
| Reduced motion   | Honoured on the storefront (0 running animations, no video autoplay).                                                                                                    |
| Text size        | Operations uses 8–11 px text in places (OP-04). Smallest storefront text measured: 12 px (captions, button labels).                                                      |
| Not tested       | Screen readers (VoiceOver, TalkBack), 200% zoom and text spacing, Safari, real devices, keyboard walkthrough of Operations.                                              |

## 6. Perceived performance (lab)

Method in section 2. Cold cache, 390×844, median of 3. "Own content" is the time until the route's own main element exists (menu card, product title, cart line, delivery choice) — the moment the page stops being the home page.

| Page     | Profile     | First paint | LCP    | Own content | Layout shift | Blocking time | Transferred |
| -------- | ----------- | ----------- | ------ | ----------- | ------------ | ------------- | ----------- |
| Home     | unthrottled | 0.08 s      | 0.14 s | 0.07 s      | 0            | 0 ms          | 5.24 MB     |
| Menu     | unthrottled | 0.05 s      | 0.05 s | 0.15 s      | 0            | 0 ms          | 1.42 MB     |
| Product  | unthrottled | 0.07 s      | 0.12 s | 0.15 s      | 0            | 0 ms          | 1.42 MB     |
| Cart     | unthrottled | 0.07 s      | 0.13 s | 0.22 s      | 0            | 0 ms          | 1.32 MB     |
| Checkout | unthrottled | 0.05 s      | 0.05 s | 0.16 s      | 0            | 0 ms          | 1.32 MB     |
| Home     | slow 4G ×4  | 1.24 s      | 1.57 s | 0.54 s      | 0            | 159 ms        | 5.24 MB     |
| Menu     | slow 4G ×4  | 1.20 s      | 1.53 s | 6.57 s      | 0            | 109 ms        | 1.36 MB     |
| Product  | slow 4G ×4  | 1.23 s      | 1.58 s | 6.59 s      | 0            | 103 ms        | 1.42 MB     |
| Cart     | slow 4G ×4  | 1.16 s      | 2.06 s | 7.08 s      | 0.434        | 104 ms        | 1.32 MB     |
| Checkout | slow 4G ×4  | 1.19 s      | 1.56 s | 7.07 s      | 0.571        | 106 ms        | 1.32 MB     |

Reading the table: first paint and LCP look good on the slow profile only because they measure the prerendered home page (SF-01). The honest number for menu, cart and checkout is "Own content". In a single session the per-page transfer does not fall on later pages (SF-02).

Other facts:

- Script 1,431.9 kB (387 kB gzip), stylesheet 179.4 kB (31 kB gzip), one file each.
- Local server: no compression. Live edge: gzip on HTML, script and stylesheet (observed).
- Live `/menu`: one request from this machine took 1.83 s to first byte. Single sample, unknown network path; not a finding.

## 7. Conversion measurement: audit and proposal

### 7.1 What exists today (verified in code)

| Source                                     | What it records                                                                                                                                             | Usable for the funnel                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Client analytics                           | None. No analytics, tag manager, pixel, error reporter or beacon in `src/`, `index.html` or the live script (string search).                                | —                                                                  |
| Cookies                                    | Only `tl_session` for Operations login (`server/http.ts:777`). None on customer pages (no `Set-Cookie` on live `/`, `/menu`, `/cart`).                      | —                                                                  |
| Content Security Policy                    | `connect-src 'self'`: the browser cannot send data to a third party.                                                                                        | A first-party endpoint fits without changing it.                   |
| `safeLog` (`server/observability.ts`)      | Only if `SAFE_LOGS=true`: event name, status, count, attempt, latency, correlation id. `http.complete` logs the status code only — no path.                 | No: cannot tell a menu view from a checkout call.                  |
| Order and payment records (SQLite `State`) | Web orders, their audit trail (`Awaiting Payment → Paid` by reconciliation), payments with status and timeline, public order number issued when first paid. | Yes: the bottom of the funnel is already recorded authoritatively. |
| Paymennt dashboard, Railway logs           | Not inspected (no production or provider access in this stage).                                                                                             | Unknown.                                                           |

Conclusion: the privacy policy's "no analytics or advertising cookies" is accurate. Visits, menu views, product views and cart activity are not measured anywhere. Checkout sessions created and payments verified can already be counted from stored orders without collecting anything new.

### 7.2 Funnel

visit → menu → product → cart → checkout → payment provider → verified payment

| #   | Event                       | Fires when                                                                                                                            | Where (proposed)                                                                  | Properties (allowlist)                                                     |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | `visit`                     | First customer page shown in a tab                                                                                                    | Browser, route level (`Root.tsx`)                                                 | `lang`, `device` (phone/tablet/desktop), `entry` (home/menu/product/other) |
| 2   | `menu_view`                 | Menu shown or category changed                                                                                                        | Browser, menu page                                                                | `category`, `lang`, `device`                                               |
| 3   | `product_view`              | Product page shown                                                                                                                    | Browser, menu page                                                                | `product` (slug), `category`                                               |
| 4   | `cart_add`                  | Item added                                                                                                                            | Browser, subscribing to the existing cart store (no change to cart UI)            | `sku`, `quantity_band` (1, 2–5, 6+), `source` (card/product page)          |
| 5   | `cart_view`                 | `/cart` shown with items                                                                                                              | Browser, route level                                                              | `lines`, `value_band` (AED <50, 50–149, 150–299, 300+)                     |
| 6   | `checkout_start`            | First quote requested for a cart                                                                                                      | Server, HTTP layer, on `POST /api/checkout/quote`                                 | `method` (delivery/pickup), `zone`, `value_band`                           |
| 6a  | `checkout_minimum_block`    | Quote answered "minimum not met"                                                                                                      | Server, same place, from the quote result                                         | `zone`, `shortfall_band`                                                   |
| 6b  | `checkout_area_unsupported` | Typed area matches nothing                                                                                                            | Browser (optional, phase 2)                                                       | none (the typed text is never sent)                                        |
| 7   | `checkout_address_ok`       | Delivery step accepted                                                                                                                | Server, on `POST /api/checkout/address` success                                   | `zone`                                                                     |
| 8   | `payment_session_created`   | Order accepted and provider session issued                                                                                            | Server, derived from the stored order/payment created by `POST /api/checkout/web` | `method`, `zone`, `value_band`                                             |
| 9   | `payment_return`            | Customer comes back to `/checkout/return`                                                                                             | Server, on `POST /api/checkout/reconcile` (first per checkout)                    | `state` (pending/paid/failed/held)                                         |
| 10  | `payment_verified`          | Reconciliation marks the payment paid — the same transaction that writes `Awaiting Payment → Paid` and issues the public order number | Server, derived from the order audit trail                                        | `method`, `zone`, `value_band`, `minutes_to_pay_band`                      |
| 10a | `payment_not_completed`     | Payment becomes failed, expired or cancelled                                                                                          | Server, derived from payment status                                               | `outcome`                                                                  |

Rules:

- **Verified payment is never a browser event.** It is counted only from the authoritative record written by reconciliation (`GET` to the provider), never from the return URL, a webhook body alone, or the confirmation page being shown. A repeated webhook or a refresh cannot count twice because the paid transition and the order number are issued once.
- Events 8, 10 and 10a need **no new collection**: they are a read-only count over stored orders and payments (web orders by day). This can be reported first.
- Events 6, 6a, 7 and 9 are counted in the HTTP layer where the routes are dispatched (`server/http.ts`, lines 600–649), not inside `server/domain/web-checkout.ts` and not in the checkout UI.
- Events 1–5 need a small first-party beacon: `navigator.sendBeacon("/api/events")` to the same origin, validated against a fixed allowlist, rate-limited by the existing limiter.

### 7.3 Privacy design

- No cookies, no third party, no SDK, no dependency. Same origin only.
- Never sent or stored: name, phone, email, address, free text, order id, payment id, IP address, user agent string, full URL or query string.
- Stored as **daily counters** (Dubai day, event, properties → count), not as a row per visitor. Amounts and quantities only as bands.
- Linking steps for one visit: two options for the owner.
  - **A — no identifier.** Step counts per day. Simple; cannot remove reloads or tell one visitor's path from another's.
  - **B — per-tab random id** kept in `sessionStorage`, gone when the tab closes, never stored server-side beyond a daily "reached step N" set. Gives a real funnel. This is still an identifier and must be described in the Privacy Policy before it is used.
- Respect `Do Not Track` / Global Privacy Control: send nothing.
- Off by default behind a flag (for example `FUNNEL_EVENTS_ENABLED`); Production needs explicit approval, as with other features in this repository.
- `zone` is a delivery area, not an address; areas with very few orders should be grouped as "other" in any report.

### 7.4 What needs owner approval

1. Collecting anonymous usage counts at all, and updating the Privacy Policy sentence about website visits (also fixes SF-16).
2. Option A or B for linking steps.
3. Retention period for counters and who can see the report (suggest admin only, in Operations).
4. Reporting by delivery area.
5. Turning it on in Production.

### 7.5 Suggested order

- Phase 0 (no collection): read-only report of checkout sessions created, paid, failed and expired per day from stored orders. Gives the provider-step conversion immediately.
- Phase 1: server-side counters for events 6–9.
- Phase 2: browser beacon for events 1–5 after the policy text is approved.

## 8. Prioritised backlog

Impact and effort are estimates (heuristic). H/M/L.

| #   | Item                                                                       | Findings                  | Impact | Effort | Owner               | Depends on                                                   |
| --- | -------------------------------------------------------------------------- | ------------------------- | ------ | ------ | ------------------- | ------------------------------------------------------------ |
| 1   | Cache headers for hashed assets and brand media                            | SF-02                     | H      | L      | Claude              | Approval for server change; check on Railway edge            |
| 2   | Neutral shell instead of the home page for menu, cart, checkout            | SF-01                     | H      | M      | Claude              | Codex review (checkout renders inside it)                    |
| 3   | Kitchen sort by real due date including pickups                            | OP-01                     | H      | L      | Claude              | —                                                            |
| 4   | Preparation instructions beside items on the order page                    | OP-03                     | H      | L      | Claude              | —                                                            |
| 5   | Kitchen/Deliveries: Today/Upcoming, filters, delivered limited to today    | OP-02                     | H      | M      | Claude              | —                                                            |
| 6   | Floating buttons: remove from cart/checkout, reserve space on menu         | SF-04                     | H      | L      | Codex + Claude      | Codex for checkout shell                                     |
| 7   | Area and minimum visible in the cart; link to delivery areas               | SF-03                     | H      | M      | Codex               | Owner copy approval (EN/ES/AR)                               |
| 8   | Phase 0 funnel report from stored orders                                   | §7                        | H      | L      | Claude              | Owner approval of report scope                               |
| 9   | Compact kitchen card, 12 px minimum labels                                 | OP-04, OP-07              | H      | M      | Claude              | Screenshot review by Joel                                    |
| 10  | Same customer-name rule on cards and tickets                               | OP-05                     | M      | L      | Claude              | —                                                            |
| 11  | Overview cards open the filtered list                                      | OP-09                     | M      | L      | Claude              | —                                                            |
| 12  | Sticky category chips, shorter mobile menu introduction                    | SF-05                     | M      | M      | Claude              | Coordinate with Codex on `MenuCatalog.tsx`                   |
| 13  | Checkout messages: reasons on disabled buttons, inline field errors        | SF-07, SF-08              | M      | M      | Codex               | —                                                            |
| 14  | Pay button wording, total in the review card, "Delivery or pickup" wording | SF-09, SF-10              | M      | L      | Codex               | Owner copy approval                                          |
| 15  | Cart line names (no duplicate, storefront title)                           | SF-06                     | M      | L      | Codex               | Product Hub naming                                           |
| 16  | Alphabetical area list                                                     | SF-11                     | M      | L      | Codex               | —                                                            |
| 17  | Orders list: due-date quick filters and sort; payment-issue tab            | OP-08                     | M      | M      | Claude              | —                                                            |
| 18  | Phone shell: language selector out of the top bar                          | OP-10                     | M      | L      | Claude              | —                                                            |
| 19  | Translation-review chip on cards                                           | OP-06                     | M      | L      | Claude              | —                                                            |
| 20  | Tap-to-call on cards; Print Center picker; Inbox phone layout              | OP-11, 12, 16             | M      | M      | Claude              | Map link needs approval                                      |
| 21  | Privacy Policy storage sentence                                            | SF-16                     | M      | L      | Claude              | Owner/legal approval                                         |
| 22  | Funnel phases 1 and 2                                                      | §7                        | H      | M      | Claude              | Owner approval; policy text; Codex review of `http.ts` hooks |
| 23  | Split Operations/Product Hub out of the customer bundle                    | SF-02                     | M      | M      | Claude              | Codex (Product Hub entry point)                              |
| 24  | Product page content                                                       | SF-12                     | M      | H      | Codex / Product Hub | Content from the owner                                       |
| 25  | Low items                                                                  | SF-13–15, 17–18, OP-13–15 | L      | L      | as listed           | —                                                            |

**Quick wins (small, presentation only, no approval beyond normal review):** 3, 4, 10, 11, 16, 18, 19, OP-13.

**Need approval before work starts:** 1 and 2 (server behaviour), 7 and 14 (customer copy), 21 (legal text), 8 and 22 (measurement), map links in 20, anything in Production.

**Depend on the Codex team or Product Hub:** 6 (checkout shell), 7, 13, 14, 15, 16, 24, and review of 2, 12, 22 and 23.

## 9. Wireframes (proposals, not built)

**W1 · Menu on a phone (SF-05, SF-04)**

```
┌──────────────────────────────┐
│ ☰      3L pastelerías   Cart 2│  header (as today)
├──────────────────────────────┤
│ Cakes · Jars · Bakery · Pan ›│  one row, sticks under the header, scrolls sideways
├──────────────────────────────┤
│ Tres Leches Cakes            │
│ ┌──────────────────────────┐ │
│ │        photo (square)    │ │
│ └──────────────────────────┘ │
│ Vanilla Strawberry           │
│ AED 340     [ size ▾ ]       │
│ [ − 1 + ]  [ ADD TO CART ]   │
│ …                            │
│ (bottom padding = bar height)│
├──────────────────────────────┤
│ ◯ help      View cart · 2    │  bar below the content, never over it
└──────────────────────────────┘
```

**W2 · Kitchen card (OP-01, OP-02, OP-04, OP-06, OP-07)**

```
Kitchen   [ Today 6 ] [ Upcoming 4 ]            Preparing 2 · Ready 1
──────────────────────────────────────────────────────────────────────
#012   TODAY · 10–12   DELIVERY                       Paid ✓  Confirmed
4 ×  Pan de Muerto tradicional · Azúcar · Individual
     ⚑ translation review
▌ Happy birthday plaque, no nuts
[        Start preparation        ]                    Open order ›
──────────────────────────────────────────────────────────────────────
#013   TODAY · 5:00 PM   PICKUP                           Paid ✓  Ready
6 ×  Pan de Muerto …
[        Confirm pickup           ]                    Open order ›
```

Address lines and address warnings appear on the Deliveries card only, with the warning beside "Send for delivery".

**W3 · Cart with area check (SF-03)**

```
ORDER TOTAL
Subtotal                         AED 15
Delivering to  [ Start typing your area ▾ ]
JLT Cluster C — minimum AED 30 · add AED 15 more
Delivery areas and minimums ›
[ CONTINUE — DELIVERY OR PICKUP ]
```

The area is the same canonical id the checkout already uses; the server keeps deciding eligibility.

## 10. Not verified

- Real conversion, traffic or abandonment figures: none exist.
- Field performance (real users, Dubai networks, real phones); Safari and iOS behaviour, including the date field and the provider's wallet buttons.
- The real Paymennt payment page and what the customer sees there; the 3-D Secure step; Apple Pay.
- Whether a browser caches live assets in practice (concluded from response headers only).
- Google address mode (`DELIVERY_ADDRESS_MODE=google`); only legacy mode was exercised, as in Production.
- The dynamic catalog path (`STOREFRONT_DYNAMIC_CATALOG_ENABLED`), and Product Hub screens (out of scope).
- The 9 PM cutoff dialog and seasonal availability outside today's date.
- Customer emails and WhatsApp notifications (nothing was sent).
- Operations with real data volume, real roles other than admin, the login screen, Delivery areas, Settings and Diagnostics screens, and Tagalog.
- Operations write actions end to end (they were mocked; 0 writes were sent).
- Screen-reader behaviour; 200% zoom; Operations keyboard walkthrough.
- Production logs, Railway metrics and the Paymennt dashboard.
- Whether Arabic and Spanish show browser-language validation bubbles (inferred from how native validation works).

## 11. Screenshot index

All under `docs/audits/ux-cro-oms/screenshots/`. Synthetic fixture data only.

| File                                      | Shows                                                    |
| ----------------------------------------- | -------------------------------------------------------- |
| `sf-01-menu-mobile.png`                   | Menu, first screen, 390 px                               |
| `sf-02-menu-desktop.png`                  | Menu, first screen, 1440 px                              |
| `sf-03-menu-card-added-mobile.png`        | Product card after adding; floating cart over the button |
| `sf-04-product-mobile-full.png`           | Product page, full length                                |
| `sf-05-cart-mobile.png`                   | Cart, duplicated product text                            |
| `sf-06-cart-tablet.png`                   | Cart, 768 px                                             |
| `sf-07-checkout-area-list-mobile.png`     | Delivery-area list order                                 |
| `sf-08-checkout-minimum-mobile-full.png`  | Minimum not met; disabled button; overlapping buttons    |
| `sf-09-checkout-details-error-mobile.png` | Invalid mobile number message                            |
| `sf-10-checkout-review-mobile-full.png`   | Review and pay, 390 px                                   |
| `sf-11-checkout-review-desktop.png`       | Review and pay, 1440 px                                  |
| `sf-12-return-pending-mobile.png`         | Return page, payment not confirmed                       |
| `sf-13-return-paid-mobile-full.png`       | Confirmation (mocked paid status)                        |
| `sf-14-ar-menu-card-mobile.png`           | Arabic product card                                      |
| `sf-15-ar-checkout-mobile.png`            | Arabic checkout; floating cart over a label              |
| `sf-16-menu-before-js-mobile.png`         | `/menu` before JavaScript: the home page                 |
| `ops-01-overview-mobile.png`              | Overview, 390 px                                         |
| `ops-02-overview-desktop.png`             | Overview, 1440 px                                        |
| `ops-03-orders-mobile.png`                | Orders list, 390 px                                      |
| `ops-04-orders-desktop.png`               | Orders list, 1440 px                                     |
| `ops-05-orders-filters-mobile-full.png`   | Orders filters open                                      |
| `ops-06-order-mobile-full.png`            | Order page, full length                                  |
| `ops-07-order-desktop.png`                | Order page, 1440 px                                      |
| `ops-08-kitchen-mobile.png`               | Kitchen, 390 px                                          |
| `ops-09-kitchen-tablet-full.png`          | Kitchen, 768 px, full length; pickup sorted last         |
| `ops-10-deliveries-tablet.png`            | Deliveries; area shown as customer name                  |
| `ops-11-inbox-mobile.png`                 | Inbox, 390 px                                            |
| `ops-12-print-tablet.png`                 | Print Center                                             |
