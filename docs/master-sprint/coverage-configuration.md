# Approved outer delivery coverage

Status: **exact outer coverage implemented and locally verified**. No production activation/deployment occurred.

The user-supplied final GeoJSON supersedes the earlier screenshot. `docs/sources/3L_Dubai_delivery_coverage.geojson` retains the original bytes; SHA256 `69acabeb0de1b15935cb0ab9e995e30be7152ce3e78b5da0d2ec23b72e7b9e0b`. It contains one Polygon, one closed exterior ring, 37 positions and **no separate exclusion**. No red exclusion was inferred, no coordinates were invented/simplified, and the first/final position remains identical.

`server/data/delivery/approved-coverage.json` is the normalized startup configuration. Only collection/feature metadata was normalized to the strict schema; geometry is exactly equal to the source. Provenance is adjacent in `provenance.json`. These reviewed public files are explicitly included in Git and compiled into the server bundle.

An empty/unset `DELIVERY_COVERAGE_FILE` uses this bundled approved map. A specified private path overrides it; malformed files fail startup. Do not supply an empty/invalid override to bypass validation. Future map replacement must be reviewed and regression-tested. A production release is separately authorized; the current deployed build was not inspected or changed here.

The schema supports exactly one primary Polygon/MultiPolygon and zero or more explicitly supplied exclusion features. Primary exterior edges/vertices are included; holes and explicit exclusions (including their edges) are excluded. The current approved file has neither holes nor exclusions. Finite WGS84 `[longitude, latitude]`, closed nondegenerate simple rings and valid holes are enforced. Local planar containment is appropriate for this reviewed Dubai boundary; it is not a geodetic survey or proof of an address's physical accuracy.

## Independent requirements still missing

1. **Trusted address coordinates:** free-text input cannot be geocoded by a perimeter file. Current website lookup uses private `DELIVERY_VERIFIED_ADDRESSES_FILE`, containing `{address, building, location: {lat, lng}}`. No real verified registry was supplied. Existing operational reverse-geocoder is not automatic website forward-geocoding. Supply a reviewed registry or approve a specific forward-geocoder integration; no paid service was added.
2. **Tariff subdivisions:** reviewed geographic pricing polygons tied to existing `state.zones` IDs were not supplied. Coverage must pass first, then exactly one active price polygon must match. Being inside the broad boundary does not authorize an unknown minimum. Existing 93 minimum/fee rules are unchanged. Resolve gaps/overlaps and approve any new community rates.

Unicode NFKC exact address/building normalization preserves Arabic letters and digits. Duplicate normalized registry keys fail startup. Spelling variations still fail closed; aliases of an area alone do not prove the customer's address. Trusted records must have privately documented coordinate provenance; never commit customer addresses or log PII.

## Authoritative flow and safe rollback

Private verified address → server-owned coordinate → approved outer containment → unique active pricing polygon → actual zone/minimum → authoritative catalog/cart → tomorrow AND required 12/24h notice → one of three approved windows → existing hosted web checkout.

The browser cannot submit trusted coordinates/coverage flags. Forged area create/resume, outside addresses and insufficient minimums fail before order/payment mutation or provider requests. Customer error: “This address is outside our current delivery coverage area.” Pickup bypasses delivery geography/minimum while preserving applicable schedule, contact and billing validation.

Local tests use fake addresses and an explicitly synthetic pricing rectangle ONLY in `tests/`; no test geography is a business tariff seed. Six approved-map tests plus ten geometry tests and closure browser coverage/pickup tests verify inside/outside/boundary, create/resume forgery, minimum, Unicode and recovery.

For future authorized activation: review registry and tariff inputs, configure private file paths in isolated TEST, verify real known addresses and all three windows, then request production release approval. Roll back to the previously reviewed release/configuration; if geography cannot be established, keep delivery blocked and pickup available. Never disable coverage checks as a recovery shortcut.
