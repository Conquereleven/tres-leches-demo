# Approved outer delivery coverage

Status: **exact outer coverage implemented and locally verified**. No production activation/deployment occurred.

The user-supplied final GeoJSON supersedes the earlier screenshot. `docs/sources/3L_Dubai_delivery_coverage.geojson` retains the original bytes; SHA256 `69acabeb0de1b15935cb0ab9e995e30be7152ce3e78b5da0d2ec23b72e7b9e0b`. It contains one Polygon, one closed exterior ring, 37 positions and **no separate exclusion**. No red exclusion was inferred, no coordinates were invented/simplified, and the first/final position remains identical.

`server/data/delivery/approved-coverage.json` is the normalized startup configuration. Only collection/feature metadata was normalized to the strict schema; geometry is exactly equal to the source. Provenance is adjacent in `provenance.json`. These reviewed public files are explicitly included in Git and compiled into the server bundle.

An empty/unset `DELIVERY_COVERAGE_FILE` uses this bundled approved map. A specified private path overrides it; malformed files fail startup. Do not supply an empty/invalid override to bypass validation. Future map replacement must be reviewed and regression-tested. A production release is separately authorized; the current deployed build was not inspected or changed here.

The schema supports exactly one primary Polygon/MultiPolygon and zero or more explicitly supplied exclusion features. Primary exterior edges/vertices are included; holes and explicit exclusions (including their edges) are excluded. The current approved file has neither holes nor exclusions. Finite WGS84 `[longitude, latitude]`, closed nondegenerate simple rings and valid holes are enforced. Local planar containment is appropriate for this reviewed Dubai boundary; it is not a geodetic survey or proof of an address's physical accuracy.

## Verified community pricing — polygons optional

The approved table maps communities to minimums AED30/50/100/150/200/250/300. There is **no separate delivery charge**. JLT Clusters A/B/C/D each require AED30. Seeds now contain94 area records (the previous93 plus explicitly approved Cluster A).

Private `DELIVERY_VERIFIED_ADDRESSES_FILE` accepts `{address, building, location: {lat, lng}, community, cluster?}`. `community` and optional JLT `cluster` are reviewed server-owned evidence, never browser-selected fields. Existing coordinate-only records still support one reviewed active tariff polygon as a legacy optional fallback; tariff polygons are **not required** when reliable structured community evidence resolves a unique active table record. Explicit unknown/ambiguous community never falls back to polygon/selected area/priority.

Aliases live separately from canonical names in configurable zone records. Unicode/punctuation/case normalization is exact, not fuzzy. Marina/Dubai Marina, JVC/full form/parenthesized JVC, JVT and DIP aliases are supported. Generic JLT/Jumeirah Lakes Towers requires approved cluster evidence; unapproved clusters remain unresolved. Multiple active alias matches block regardless of priority. Country/city labels alone are not community evidence.

**Remaining input:** a reviewed private address/building→coordinates+community registry, with sufficient JLT cluster granularity, or authorization for a website address-verification provider. The perimeter cannot geocode free text. Current Mapbox v6 adapter is operational reverse lookup from known coordinates; it returns granular names/IDs in a combined result, not verified typed-address coordinates or a structured website selection. No website Places/forward-geocoder is wired. A future provider must verify the full address/building server-side, return trustworthy WGS84 coordinates and structured community/cluster, and feed the same perimeter/unique alias/minimum pipeline. Existing Mapbox entitlement/provider suitability must be approved before adding forward/Places support; no paid provider or network call was added here. No real private registry was supplied or inspected.

Unicode NFKC exact address/building normalization preserves Arabic letters and digits. Duplicate normalized registry keys fail startup. Spelling variations still fail closed; aliases of an area alone do not prove the customer's address. Trusted records must have privately documented coordinate provenance; never commit customer addresses or log PII.

## Authoritative flow and safe rollback

Private verified address → server-owned coordinate → approved outer containment → unique verified community/alias lookup (or reviewed legacy polygon) → actual area/minimum → authoritative catalog/cart → tomorrow AND required 12/24h notice → one of three approved windows → existing hosted web checkout.

The browser cannot submit trusted coordinates/coverage flags. Forged area create/resume, outside addresses and insufficient minimums fail before order/payment mutation or provider requests. Customer error: “This address is outside our current delivery coverage area.” Pickup bypasses delivery geography/minimum while preserving applicable schedule, contact and billing validation.

Local tests use fake addresses and an explicitly synthetic pricing rectangle ONLY in `tests/`; no test geography is a business tariff seed. Six approved-map tests plus ten geometry tests and closure browser coverage/pickup tests verify inside/outside/boundary, create/resume forgery, minimum, Unicode and recovery.

For future authorized activation: review registry/community provenance and table aliases, configure private file paths in isolated TEST, verify real known addresses and all three windows, then request production release approval. Roll back to the previously reviewed release/configuration; if geography cannot be established, keep delivery blocked and pickup available. Never disable coverage checks as a recovery shortcut.
