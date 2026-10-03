# Google Places resume — client-owned account

Status: PAUSED BY USER. LIVE GOOGLE QA PENDING. No Google activity during this closure pass.

## Exact freeze point

Branch `feature/3l-master-delivery-storefront`, inherited HEAD `8dc00f1e7d352ca7bc7399b34d7a7193d6005d1e`.
Preserved `WebsiteAddressProvider`, registry selection boundary, `AddressAutocomplete`, addressRef binding/invalidation, approved outer GeoJSON, deterministic community/minimum resolver and isolated tests. This is **registry/local verification**, not an implemented Maps JavaScript / Places New SDK adapter. No Google mocks are claimed: tests mock the application address API and use server-owned fixtures.

The current application builds without a Google key. With no approved registry file, typed delivery addresses remain unverified and delivery checkout is blocked. Pickup stays available. `WEBSITE_ADDRESS_PROVIDER=disabled` also prevents loading the registry. Do not seed test addresses into runtime or mark free text verified.

Before the pause, Google Cloud CLI 587.0.0 was installed; a provisional project `tres-leches-dubai-web-20261003` (3L Dubai Web) was created under the developer's account. No active billing account was available, no Maps APIs enabled and no key created. This is not assumed to be the client's production project. Do not automatically reuse it or delete it.

## Monday workflow

1. Client signs into the client-owned Google account with the normal interactive login.
2. Select an appropriate client-owned project or create one with client approval; do not modify unrelated projects.
3. Client confirms an active billing account and approves linking it. Do not enter payment information on their behalf.
4. Enable Maps JavaScript API only.
5. Enable Places API (New) only. No Geocoding or Address Validation API.
6. Create a dedicated frontend browser key.
7. Restrict it by HTTP referrers: `http://localhost:*/*`, `http://127.0.0.1:*/*`, and the confirmed TEST staging host `https://tres-leches-pasteleria-demo-paymennt-test.up.railway.app/*`. Local QA ports: 3199, 3198, 3189, 3191, 5174; normal dev 5173. The visual-reference Vercel site is not an approved staging host. Production must be separately confirmed; do not broaden this key automatically.
8. Restrict APIs to Maps JavaScript API and Places API (New).
9. Use ignored `.env.local`, verified with `git check-ignore .env.local`. Intended browser variable: `VITE_GOOGLE_MAPS_API_KEY`. **Reserved; not consumed by the frozen code yet.** Current active variables: `WEBSITE_ADDRESS_PROVIDER` (`registry`/`disabled`), `DELIVERY_VERIFIED_ADDRESSES_FILE` (private reviewed entries), `DELIVERY_COVERAGE_FILE` (optional approved override). No real credential belongs in source/docs/fixtures/logs.
10. Finish the paused Google-specific code before checking connectivity: SDK loader/CSP, Places New Autocomplete Data API, UAE restriction/Dubai bias, minimum field mask, session lifecycle and full selected Place state. The server needs an independently trusted verification boundary; do not accept browser coordinates/components as financial authority or reuse a referrer-restricted browser key for server REST. Select and document the proper server credential restriction and proof/persistence contract before adding it. No invented env name is presented as currently supported.
11. Run REAL Dubai QA through the branded checkout; record input, selected result, formatted address, Place ID and coordinates presence, components, coverage, canonical community, minimum, result and alias need. This closure's fixtures do not substitute for this step.
12. Validate Marina, generic JLT, JLT A/B/C/D, JVC, JVT, Downtown, Palm Jumeirah, Dubai Hills, DIP, DAMAC Hills. Palm's subareas have different rates; generic Palm must not be guessed. JLT A–D minimum AED30; Downtown AED300; no fee; total=subtotal. Exact approved outer polygon remains authoritative.
13. Add deterministic aliases only when actual returned structured evidence proves the mapping; no fuzzy matching or guessed clusters.
14. Run full checkout QA at 390/768/1440: edit invalidation, Google unavailable/no predictions/missing location, outside map, unresolved area, cheap-area manipulation, schedule and pickup. Mock Google in CI. No real payment.
15. After tests and review, deploy staging only with explicit approval, then perform staging end-to-end QA. Production remains a separate approval.

## Honest readiness

NOT READY FOR GOOGLE LIVE QA: adding a key alone cannot run live Places in this frozen snapshot. The missing SDK adapter/session/selected-fields/server verification work is explicitly paused Google-specific implementation, not a completed feature. All unrelated local work is validated separately in `delivery-report.md`.
