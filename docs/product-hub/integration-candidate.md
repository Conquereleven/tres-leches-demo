# Integration candidate — fronts A and C

Branch `integration/3l-product-hub-ops-candidate`, cut from `main` at `5cab4d1`
(BRAND-02 included). Nothing was merged into `main`, deployed, or run against
Production.

## What it contains

| Source                                 | Pull request | Head      |
| -------------------------------------- | ------------ | --------- |
| Product Hub V2 (front C)               | #13          | `f56d632` |
| Catalog foundation bootstrap (front C) | #15          | `219c46e` |
| Dynamic storefront catalog (front C)   | #16          | `a041752` |
| English products and tickets (front A) | #17          | `cd0bc3d` |
| Integration work (this branch only)    | —            | see below |

## Conflicts resolved

- **`src/commerce/Workspace.tsx`** (#13 × #17): only the import block conflicted. Both
  are kept: Product Hub renders the Products view, and Astra's `orderProductName`,
  `productOptionLabel` and `OperationalProductName` are used everywhere they were.
  `ProductsAvailability` is no longer imported there (Product Hub replaced that view);
  it is still exported for any other use.
- **`AGENTS.md`**: both sides appended sections; all are kept.
- **`tests/commerce/foundation-bootstrap.test.ts`** (#13 × #15, no textual conflict):
  two casts written before `State.productHub` existed no longer type-checked together.

## Product Hub names in Operations and tickets

Astra's rule is unchanged: a product reads in English only when its SKU **and** its
exact recorded name are a recognized definition; anything else keeps its original text
and shows "Product translation requires review".

Product Hub now feeds that rule:

- Each variant has an optional **English name for Operations and tickets**. It is typed
  by the administrator; nothing is generated. Customers never see it (neither public
  catalog endpoint carries it).
- At publication, each English name is recorded with the exact catalog name it was
  approved for (`State.productHub.approvedNames`, append-only). `/api/workspace` returns
  them as `productNames`, and the resolver (`src/commerce/product-names.ts`) accepts
  them after the reviewed 236-SKU dictionary.
- **New product**: English name everywhere Astra's resolver is used (order cards,
  details, production, delivery, Inbox, search, Kitchen and Reception tickets).
- **Renamed product**: the new name resolves to its English; an order accepted under
  the earlier name still shows that earlier name's English, from its own snapshot.
  Snapshots are read, never rewritten.
- **No English name given**: Product Hub warns at review ("No approved English name
  for Operations and tickets") for new or renamed definitions only, and Operations
  shows the original with the review warning. Untouched products never warn.

## Official photography test

`tests/official-media-e2e/media.spec.ts` expected the cutout photographs on the earlier
cream card (`rgb(246, 239, 227)`). Approved BRAND-02 defines product surfaces as white
(`--v2-white`; `docs/brand/brand02/README.md`), so the expectation contradicted the
approved design. The two colour assertions now expect white; what they protect (the
cutout keeps its transparency and never sits on black) is unchanged. Nothing else in
that test changed.

## Joint QA on this branch

| Area                                                         | Result       |
| ------------------------------------------------------------ | ------------ |
| Typecheck, lint, build                                       | pass         |
| Commercial, unit and HTTP                                    | 532 / 532    |
| Sites                                                        | 4 / 4        |
| Secret scan / dependency audit                               | 0 / 0        |
| Operations EN/TL, tickets, print preview (2 engines)         | 50 / 50      |
| Product Hub (2 engines, 390 / 768 / 1440, axe)               | 8 / 8        |
| Dynamic publication → storefront, cart, rollback (2 engines) | 4 / 4        |
| Public languages EN/ES/AR                                    | 17 / 17      |
| Conchas (2 engines)                                          | 52 / 52      |
| Menu                                                         | 9 / 9        |
| Checkout, Chromium / WebKit                                  | 19 / 19 each |
| Official photography (2 engines)                             | 10 / 10      |
| Polish (palette, motion)                                     | 28 / 28      |
| Entry, workflow, Copilot, shell, staging permissions         | 7 / 7        |

### Failing on `main` as well (not caused by this branch)

Verified by running the same tests on `main` at `5cab4d1`:

- `playwright.uat-v2.config.ts`: 3 tests expect four Conchas products; the approved
  catalog has seven.
- `playwright.order.config.ts` (1 test) and `playwright.closure.config.ts` (2 tests)
  click an Operations button by its former Spanish label, "Todos los pedidos";
  Operations V2 shows it in English or Tagalog.

None is part of CI. They are test expectations left behind by earlier releases, not
commercial defects, and were left untouched here.

`playwright.production-i18n.config.ts` was not run: it targets the live site.

## Before release

Unchanged from the individual documents; in short: merge, deploy with every flag unset,
resolve the 12 stored rows and initialize the foundation (`foundation-bootstrap.md`),
validate on staging with a real publication, then activate with founder approval
(`storefront-dynamic-catalog.md`).
