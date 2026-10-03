# External readiness — master sprint

No deployment, provider activation, production data import or account connection is included.

## Approved delivery geography — outer perimeter complete

The supplied final GeoJSON supersedes the earlier screenshot. The bundled default `server/data/delivery/approved-coverage.json` preserves all 37 positions exactly, one closed Polygon ring, no holes or exclusions. Source and provenance are tracked; no boundary was redrawn. Exterior edges are included deterministically. Server-owned verified coordinates are checked before minimums and checkout; forged client flags/areas cannot bypass this.

The outer perimeter does not geocode an address or subdivide tariff areas. Real verified address/building coordinates and structured community/cluster evidence (or an approved website address-verification provider) remain NEEDS BUSINESS INPUT. Internal tariff polygons are optional; community classification can replace them, with strict aliases and no fuzzy guessing. New quotes never add delivery charges; JLT A–D minimums are AED30. Unknown delivery addresses fail closed; pickup remains available. No paid geocoder, production configuration or geographic tariff data was added. Existing operational reverse geocoding does not validate arbitrary typed website addresses. See [coverage-configuration.md](coverage-configuration.md).

## Catalog

Existing 218 option prices are preserved. Owner approved equal base-size pricing for pistachio filling and chocolate covering. Sixteen explicit single variants bring the candidate import to 234. No production catalog import has been run. Packs expose Half Dozen/Dozen without invented assortment selectors. Single Pan de Muerto is October 15–November 15 inclusive in Dubai; packs remain available.

## Brand and translation

The original identity PDF at its previously supplied Downloads path is unavailable. Existing `docs/brand/implementation.md` records the prior inspection; official Abril Fatface/Montserrat and local approved marks take priority over the reference site's Playfair font. Reference imagery provenance is recorded in `public/brand/reference/provenance.json`. No generated food imagery.

Arabic has URL/storage locale persistence, RTL layout, an extracted 557-entry English/template inventory and six existing navigation translations. English fallback text uses bidirectional isolation; selector values remain canonical independent of visible translations. No new Arabic business copy was generated. Catalog, scheduling guidance, errors and legal/payment text still require approved Arabic copy and complete translation QA. English sensitive copy is retained; this is not a claim of a complete Arabic storefront.

## Apple Pay

Hosted Paymennt checkout is retained. No fake Apple Pay button, payment-method activation or charge was performed. Merchant owner should confirm Apple Pay eligibility and availability for the existing hosted checkout with Paymennt. Official payment-method guidance places activation in Finance (Account) → Payment methods (Settings), with currency/pricing/terms review. Confirm with Paymennt whether any merchant-domain registration is needed for their hosted page rather than assuming requirements for an embedded integration.

Sources: https://docs.paymennt.com/guides/online-payment/payment-methods and https://docs.paymennt.com/docs/payment/hosted

## MCP

Disabled by default (`MCP_ENABLED=false`). Internal authenticated POST `/api/mcp` exposes redacted read-only tools for admin/manager roles using existing session authentication and same-origin protection. Catalog, order IDs/states and fulfillment method only; no customer PII, payment records or secrets. No Lisa account was connected. Production remote MCP still needs OAuth/client onboarding, transport conformance (including notification/protocol-header handling), deployment security review and controlled UAT. This is a safe domain facade, not a claim of ready external-account connectivity.

## Meta and operations

Existing authentication, RBAC, domain transitions, webhook verification and Meta activation gates remain. No Meta configuration was changed and outbound is not enabled. Existing tracking uses the stored order/payment record; query-string results are never authoritative.

## Publication

No Git remote is configured. A GitHub repository URL and intended base branch are needed for a reviewable PR. Do not deploy this candidate before visual approval and delivery-data readiness review.
