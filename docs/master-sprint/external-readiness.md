# External readiness — master sprint

No deployment, provider activation, production data import or account connection is included.

## Approved delivery geography — pending business delivery after sprint

The owner confirmed on 2026-10-03 that approved geography exists and will be supplied after this sprint. Website delivery intentionally fails closed without verified address coordinates and approved active zone polygons. Pickup remains available. A dropdown or an address containing an area name is never evidence of actual location.

`DELIVERY_VERIFIED_ADDRESSES_FILE` is an optional private server file. Schema: array of `{address, building, location: {lat, lng}}`. Do not commit customer addresses. Existing zone polygon data must be reviewed against the approved map. Exact normalized address/building pairs resolve only when coordinates fall in exactly one active polygon. Missing, ambiguous and out-of-coverage addresses are rejected before payment creation. The existing GeoService boundary can be replaced with an approved forward geocoder; no paid geocoder was activated. A polygon map alone does not geocode arbitrary typed addresses: provide verified address coordinates or approve a real geocoder integration.

Before activation: validate map format and coverage, load approved polygons through existing zone administration, mount the private registry (or approve the geocoder adapter), test known inside/outside/border addresses and forged cheaper-area submissions. Do not seed invented geography.

## Catalog

Existing 218 option prices are preserved. Owner approved equal base-size pricing for pistachio filling and chocolate covering. Sixteen explicit single variants bring the candidate import to 234. No production catalog import has been run. Packs expose Half Dozen/Dozen without invented assortment selectors. Single Pan de Muerto is October 15–November 15 inclusive in Dubai; packs remain available.

## Brand and translation

The original identity PDF at its previously supplied Downloads path is unavailable. Existing `docs/brand/implementation.md` records the prior inspection; official Abril Fatface/Montserrat and local approved marks take priority over the reference site's Playfair font. Reference imagery provenance is recorded in `public/brand/reference/provenance.json`. No generated food imagery.

Arabic is a switchable RTL foundation with navigation resources. Catalog, scheduling guidance, errors and legal/payment text still require approved Arabic copy and complete translation QA. English sensitive copy is retained; this is not a claim of a complete Arabic storefront.

## Apple Pay

Hosted Paymennt checkout is retained. No fake Apple Pay button, payment-method activation or charge was performed. Merchant owner should confirm Apple Pay eligibility and availability for the existing hosted checkout with Paymennt. Official payment-method guidance places activation in Finance (Account) → Payment methods (Settings), with currency/pricing/terms review. Confirm with Paymennt whether any merchant-domain registration is needed for their hosted page rather than assuming requirements for an embedded integration.

Sources: https://docs.paymennt.com/guides/online-payment/payment-methods and https://docs.paymennt.com/docs/payment/hosted

## MCP

Disabled by default (`MCP_ENABLED=false`). Internal authenticated POST `/api/mcp` exposes redacted read-only tools for admin/manager roles using existing session authentication and same-origin protection. Catalog, order IDs/states and fulfillment method only; no customer PII, payment records or secrets. No Lisa account was connected. Production remote MCP still needs OAuth/client onboarding, transport conformance (including notification/protocol-header handling), deployment security review and controlled UAT. This is a safe domain facade, not a claim of ready external-account connectivity.

## Meta and operations

Existing authentication, RBAC, domain transitions, webhook verification and Meta activation gates remain. No Meta configuration was changed and outbound is not enabled. Existing tracking uses the stored order/payment record; query-string results are never authoritative.

## Publication

No Git remote is configured. A GitHub repository URL and intended base branch are needed for a reviewable PR. Do not deploy this candidate before visual approval and delivery-data readiness review.
