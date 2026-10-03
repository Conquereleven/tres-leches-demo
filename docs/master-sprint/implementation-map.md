# Master sprint implementation map (before changes)

Baseline: release/3l-paymennt-live / 78baadf4c30969a81ae83967fbff8e20fcf48ccc. Clean tree. 295 tests pass. No Production changes permitted.

| Requirement | Initial status | Implementation boundary / risk |
|---|---|---|
| Homepage reference fidelity | Missing | Experience.tsx, new isolated reference CSS; reproduce five complete sections, omit ten explicit unfinished scaffolds. Local assets obtained through browser. |
| Palette/fonts/logos | Partially implemented | brand.css/primitives.tsx/public/brand; keep official Abril/Montserrat, document Playfair reference difference. Original manual missing from previous upload path; existing inspected manual notes retained. |
| Dedicated menu | Missing | Root.tsx/MenuCatalog.tsx/menu.ts; reuse 218 approved SKUs, no catalog duplication. |
| Photography/video/favicon | Partially implemented | Approved reference assets available; local file paths, reduced motion/video controls, intrinsic sizing. |
| How to order | Missing | Customer page describing actual hosted checkout, dates/area constraints. |
| Quantity/clear/floating cart | Partially implemented | cart.ts, Shop.tsx, CartLink.tsx; reject invalid quantities, clear confirmation, preserve immutable paid capabilities. |
| Pan seasonal individuals/permanent packs | Missing | Shared configurable product policy consumed by server config/quote/create and UI. Dubai Oct15-Nov15 inclusive. |
| Pistachio/chocolate options | Blocked by external dependency | New prices/SKUs not approved. No fabricated product/option. Existing SKU selections already persist to frozen catalog snapshots. |
| Descending option prices | Missing | menu.ts/MenuOptions; deterministic ordering and supported SKU fallback. |
| Tomorrow + 12h + approved slots | Missing | shared scheduling module, web-checkout normalize and server config; enforce window start, retain 24h product requirements. Preserve provider reconciliation/idempotency. |
| Area minimum/shortfall | Partially implemented | quoteOrder/Shop; area labels + server pricing already exist. |
| Authoritative address/area validation | Missing | Existing GeoService reverse lookup, polygons/canonicalIds supported but no approved geography. Add verified address adapter/boundary, fail closed; no keyword-only proof. External address mapping required for delivery activation. |
| Remaining areas | Blocked by external dependency | 93 configured areas; no missing boundaries invented, administrative data/config extension supported. |
| Summary photos | Already implemented | Shop ProductThumbnail and frozen SKU lookup; verify. |
| Customer WhatsApp/left float | Partially implemented | content.ts/SiteChrome; +971585943319 support only; operations notifier unchanged. |
| Arabic foundation | Missing | public string resources/context/switcher/RTL; retain English fallback for missing approved sensitive copy, checklist. |
| Dashboard auth | Already implemented | http.ts/config.ts scrypt, session cookies HttpOnly Secure Strict, RBAC/origin/rate guards; regression tests/runbook. |
| Tracking | Partially implemented | CheckoutReturn capability already shows domain states; add timeline using actual state vocabulary. |
| Apple Pay | Blocked by external dependency | Paymennt hosted checkout unchanged; investigate official docs/merchant enablement, no fake UI. |
| Meta | Blocked by external dependency | existing signed multi-number provider/policy/readiness/runbook. No activation/config mutation. |
| MCP | Missing | readonly authenticated facade over existing domain, redacted views, role checks/audit; external OAuth/account setup documented. |
| QA/PR | Partially implemented | existing test fixtures isolated SQLite and mock providers. No Git remote configured: PR publication blocked until destination supplied. |

## Architecture inventory
React19/Vite6 strict TypeScript. Root pathname routing; customer src/brand and separate src/commerce operations. Node HTTP + transactional node:sqlite JSON state; domain commands/state machine/outbox; payment/WhatsApp/Geo adapters. Hosted Paymennt /checkout/web remains authoritative GET reconciliation. Routes /api/checkout/{config,quote,web,resume,status,reconcile}; authenticated operations APIs; raw-byte payment/Meta webhooks. Runtime environment and provider gates from server/config.ts; deployment scripts preserved. No dependency replacement planned.

## External inputs requested
Approved prices for pistachio filling/chocolate covering; approved address/zone geographical mapping or verified addresses; original manual location. Arabic legal/payment copy requires review. Meta approvals/identifiers and Apple Pay merchant activation are external. No paid maps service or account connection will be activated.
