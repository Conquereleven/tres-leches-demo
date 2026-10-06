# Final polish, cutoff and integration audit — 6 October 2026

Scope: canonical repository, dedicated `feature/3l-final-polish-cutoff`; Production remains at `b0bd286f6ba799f2099b8c752d03a60acc76f9ba`. Deploy only the validated exact commit to the existing isolated paymennt-test service. Do not change merchant credentials, Google/Meta activation or Production variables.

## Editorial motion and accents

`ScrollSketch.tsx` preserves the approved Alicia raster portrait. A user-space SVG mask uses a single continuous brush/hatching path, normalized pathLength/dash offset. Scroll reveals pencil detail rather than applying opacity to the photograph; scrolling back reverses it. Original files remain unchanged. This is a raster reveal, not an invented vector contour tracing of Alicia's face.

The original Mexico–Dubai route is preserved as background artwork and overlaid with a progressively drawn rose ink path and short moving blush tracer. On desktop it runs physically left to right; on stacked mobile it runs top to bottom. It is tied to the route's own viewport position, not to an already-scrolled section heading. Arabic does not reverse the geographic journey.

The existing small-icon SVG rule is explicitly overridden for the two illustration SVGs. Tests assert their physical size as well as computed progress. Motion uses requestAnimationFrame, one bounding-box read per nearby composition and passive scroll listeners. IntersectionObserver stops painting offscreen; reduced-motion shows the complete portrait/route and removes the tracer. Image aspect ratios and absolute composition reserve geometry; no new animation library, font binary or raster food image.

Cream/cacao remain primary. Reusable `--3l-pink-soft`, `--3l-pink`, `--3l-pink-ink` and `--3l-pink-border` tokens govern notices, selection/focus, Journal border, route and city details. High-contrast dark rose is used for readable details; light pink is decorative/background only. Preserve the approved typography and bilingual identity/media exceptions.

## Authoritative 9 PM rule

Shared `commerce-policy.ts` uses Intl with explicit `Asia/Dubai` and UTC date arithmetic. The whole 21:00 minute is inclusive; 21:01 starts closed status. At 20:59/21:00 the global earliest date is tomorrow; from 21:01 it is the day after tomorrow. No weekly closed production days were provided, so no such exclusions are invented.

`validWindow` additionally preserves no same-day scheduling and the existing 12/24-hour notice against the window start. `earliestFulfillmentDate` selects the first date having a valid window, combining the later cutoff/lead-time result. At 21:00, ordinary products can use tomorrow afternoon but 24-hour products require the following date. Pickup and delivery normalize through the same policy before any provider operation; stale client dates cannot bypass it. Already-created frozen payments/orders are not rewritten or reconciled by this sprint.

Public config provides a server-derived min date. Checkout uses its existing server-calibrated clock, recalculates date min per cart lead time and disables unavailable slots. Refresh/focus/30-second ticks reflect the cutoff; the server remains immediately authoritative. New notice/closed-date/error copy is translated in EN/ES/AR. Dates and payload values stay canonical. No prices, area minima, fee, customer/billing mapping or payment adapter changes.

## Apple Pay — APPLE PAY ENABLED / VISIBLE

The merchant activation assertion is supplied by Tarek via the user (5 October), not independently queried via merchant account API. An existing user-authorized LIVE Paymennt hosted checkout was opened without creating another checkout. Safari on the user's actual macOS displayed the native accessible button `Apple Pay` / `Pay With Apple Pay`. Chrome on that same Mac displayed card fields but no Apple Pay button; zero captured Chrome console errors. Device/browser wallet gating is therefore real, not a simulated 3L widget. No button clicked, card entered, charge completed, or merchant settings changed. Existing POST `/checkout/web` and provider-controlled redirect remain unchanged; no Apple/Stripe JS added. iPhone visibility and actual wallet authorization/charge were not tested.

The checkout capability URL and customer details are deliberately omitted from committed documents/screenshots. Full Safari evidence remains private; safe result metadata belongs to the ignored QA folder.

## MCP — not connectable from ChatGPT today

Existing implementation: `server/domain/mcp.ts`; guarded POST `/api/mcp`; JSON-RPC facade supports initialize, ping, tools/list and tools/call. Tools: catalog_list, orders_list, order_status. No resources. Roles admin/manager, existing HttpOnly session authentication and same-origin validation. Read tools redact customer/payment data but append an administrative read audit; they do not mutate orders/payments. Activation requires MCP_ENABLED=true; Production has that variable absent, so the gate remains disabled.

Public GET `/api/mcp` returns 401 from the upstream actor gate; public OAuth protected-resource discovery returns 404. The HTTP host is reachable, but this does not prove a usable remote MCP transport. No Streamable HTTP/notification/session lifecycle conformance or OAuth authorization flow exists. ChatGPT cannot reuse a browser session cookie or the origin-only internal facade as a secure remote connection.

Proposed separate, authorized read-only implementation:

1. Use the official MCP SDK and a dedicated HTTPS Streamable HTTP endpoint; validate protocol/version, initialize/notifications, media types, bounded bodies and transport errors. Keep disabled until security/UAT.
2. OAuth user authorization with protected-resource and authorization-server discovery, audience-bound short-lived tokens, PKCE, issuer/expiry/scope checks, revocation and per-user RBAC. Never expose an anonymous customer-orders tool or put credentials in tool inputs. Do not weaken current operations sessions/origin/CSRF controls.
3. Initial tool allowlist: get_orders (paginated/redacted), get_order (role-scoped), get_production_queue, get_delivery_queue, get_catalog (canonical seasonal availability), get_delivery_zones. Typed schemas, max limits, canonical filters and minimal customer PII. Correlation/audit logs must exclude tokens and contact/address data.
4. Inspector tests for initialization, tools, invalid input, unauthenticated/wrong-scope/expired-token access, rate limits and redaction. Then explicit merchant/ChatGPT account connection and read-only UAT.
5. advance_order_state and update_order_notes remain proposals only. Separate explicit write authorization and review are required; do not implement silently. Any future state advance must call the existing domain state machine and concurrency/idempotency controls.

Exact connection blockers: SDK/transport conformance, OAuth discovery and grants, dedicated RBAC scopes/read tool coverage, secure remote deployment/activation and merchant ChatGPT connection/UAT. This sprint audits/plans; it does not claim completion or implement write tools.

Official guidance checked 6 October: [MCP server transport](https://developers.openai.com/plugins/build/mcp-server), [authentication/discovery](https://developers.openai.com/plugins/build/auth). Private user data requires authentication; deployment must preserve those boundaries. Do not transplant an anonymous quickstart into Commerce OS.

## Meta — META STILL IN REVIEW

Read-only inspection of app `979058461878284` / portfolio `196774801535754` on 6 October:

- App remains Publicada/Live.
- App Verification: business No verificado; access verification blocked until business verification.
- Business Settings: legal entity now displayed as `Tres Leches Pastelerias Catering Services`, Sin verificar. This is not an observed verified Golositalia FZCO record. Resolve the entity/portfolio discrepancy before a new legal submission; no rename or ownership change was performed.
- Main App Review page displays a No enviada draft with requested business_management, whatsapp_business_management and whatsapp_business_messaging.
- Permissions table: all three are Listo para la prueba; this is not advanced-access approval.
- Tech Provider onboarding displays 0/2 completed and its submission step En revisión. This differs from the draft on the main review page; both observations are preserved, not flattened into a false approved result.
- Meta-hosted Embedded Signup is available, with Generar enlace; the Embedded Signup manager appears in navigation. No link generation or signup execution.

Remaining blockers: unverified business/legal-entity discrepancy, unresolved review/onboarding status and no demonstrated advanced permission approval. No number migration/deregistration/transfer, WhatsApp send, token creation or outbound activation. META_OUTBOUND_ENABLED=false verified in both environments.

## Validation and evidence

Final exact commit/deployment ID, full pass totals and observed performance limits are recorded after validation in ignored `work/qa/final-polish/release-report.md` and `release-evidence.json` to avoid an undeployed evidence-only HEAD. Matrix EN/ES/AR at 390/768/1024/1440 includes Journal, route, contrast/axe, reverse scroll, preserved geometry and reduced-motion. Desktop/mobile recordings are retained locally. All original relevant suites, checkout regression, cutoff/TZ tests, typecheck/lint/build, packaging and secret scan are required.

Security audit discovered source-map-js 1.2.1 high-severity denial-of-service advisory during the current check. Only its lockfile patch version was updated to 1.2.2; the subsequent audit reported zero vulnerabilities. No Paymennt dependency or adapter replaced.

Production is intentionally not deployed by this sprint. Preview/TEST is isolated; do not create or complete a real payment in post-deploy QA. Lisa must review the visual changes and the inclusive 21:00-minute rule before authorizing Production.
