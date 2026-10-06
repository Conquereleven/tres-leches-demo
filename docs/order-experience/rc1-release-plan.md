# Order Experience V2 — RC1 release plan (6 October 2026)

Plan only. Nothing here has been executed against Production.

## Hosted staging

`paymennt-test` on Railway: its own environment, its own volume, its own service
domain, Paymennt TEST credentials, no Meta variables and no email variables.
Start command `node scripts/start-paymennt-test.mjs`, which is locked to that
environment's Railway ids and refuses anything but `APP_ENV=staging`,
`PROVIDER_MODE=test`, `PAYMENNT_ENVIRONMENT=test`, `META_OUTBOUND_ENABLED=false`.

The wrapper synchronises the TEST catalog to the approved menu (after a verified
backup) and then requires the stored catalog to equal that menu exactly —
including the items the menu marks unavailable. It previously demanded that
every item be available, which made it impossible to start.

## What this release does to existing Production data

| Area | Effect |
|---|---|
| Historical orders | Untouched. No order is renumbered; none receives a public number retroactively. |
| Order numbering | `orderNumberSequence` does not exist yet; the first order paid after deploy becomes `#001`. |
| Internal `TL-…` ids | Unchanged and still the key for Paymennt, idempotency and audit. |
| Existing paid orders | Readable as before; shown by their internal reference in Operations and in any email. |
| Customer drafts in browsers | A draft holding a single name loads into first/last name fields. |
| Catalog | Not imported, reseeded or validated at startup (the wrapper that does so cannot run in Production). |
| Delivery zones | Not overwritten. `applyApprovedDeliveryRules` is a one-time migration already recorded in Production. |
| Volume and database | Same volume at `/data`, same database file, same schema. A routine backup is taken at startup as today. |
| New state | `customerNotifications` and `orderNumberSequence` appear only when first used. |

Startup writes: the existing backup, and a no-op pass that marks emails left
mid-send by a crash (none exist). No migration rewrites orders or payments.

## Production variables

| Group | Variable | Action |
|---|---|---|
| Already configured | `APP_ORIGIN` | Keep `https://www.3ldubai.ae`. |
| Already configured | `APP_ENV`, `PROVIDER_MODE`, `PAYMENNT_ENVIRONMENT`, `PAYMENNT_API_KEY`, `PAYMENNT_API_SECRET`, `PAYMENNT_WEBHOOK_SECRET_FILE` | Keep. LIVE stays configured. |
| Already configured | `DB_PATH`, `BACKUP_DIR`, `PERSISTENT_VOLUME_CONFIRMED`, `OPERATOR_USERS_JSON`, `WEBHOOK_SECRET`, session and backup settings | Keep. |
| Already configured | `META_ACCESS_TOKEN`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_GRAPH_VERSION`, `META_NUMBERS_JSON` | Keep. |
| Already configured | `BUILD_SOURCE_SHA` | Set to the release commit before uploading (non-secret provenance). |
| New, required for this release | none | The release starts with no new variable. |
| New, optional | `WHATSAPP_MANAGER_PHONE` | E.164. Adds the manager as a second recipient of the internal alert row. Private. |
| New, optional (later) | `RESEND_API_KEY`, `CUSTOMER_EMAIL_FROM` | Only once a sender domain is verified in Resend. Secret / sender identity. |
| Must remain disabled | `META_OUTBOUND_ENABLED=false` | Until Meta approval and the sender-number question below are settled. |
| Must remain disabled | `CUSTOMER_EMAIL_ENABLED` unset or `false` | Until the Resend domain is verified. Emails older than two hours are never sent, so enabling it later cannot release a backlog. |
| Must remain disabled | `MCP_ENABLED` unset, `AI_ENABLED=false` | Unchanged. |

### Manager WhatsApp number

The manager's number is also the public customer WhatsApp line on the website.
Whether it is also the Cloud API sending number is set by `META_NUMBERS_JSON`
in Production, which was not read. If it is, an alert to the manager would be
sent from the business number to itself; the notifier refuses that case before
any provider call and records the reason. Confirm the sending number before
enabling outbound, or choose a different phone for the manager's alerts.

## Deployment sequence

1. Confirm the working tree is clean on the release commit and the full
   regression passed on that commit.
2. Record the baseline: Production deployment id, `/api/health`, and the public
   `/api/checkout/config` fingerprint (product count and hash, zone count and hash).
3. Take the pre-deploy data snapshot with the existing private procedure
   (verified SQLite backup; counts of orders and payments).
4. Set `BUILD_SOURCE_SHA` to the release commit on the `production` environment
   with deploys skipped.
5. Export the exact commit to a clean folder (`git archive`) and upload it to the
   `production` environment only (`142de30a-…`), never `paymennt-test`.
6. Wait for Railway to report SUCCESS. If the upload times out, read the
   deployment list before retrying.
7. Health: `/api/health` returns `ok`, `production`, `live`, and the release commit.
8. Compare the catalog and zone fingerprints with the baseline: identical.
9. Checkout config smoke: enabled, `mode: live`, `paymentFlow: web`, zones carry aliases.
10. No-payment smoke in a browser: home, menu, product, cart, checkout delivery
    and pickup up to the review screen. Do not press Pay.
11. Operations smoke (an operator signs in): Pedidos, Producción, Entregas load;
    historical orders show their internal reference.
12. Read the deploy log for startup errors and the HTTP log for 5xx.
13. Compare order and payment counts with the snapshot.

## Rollback

Roll back to the current Production deployment
`3c46e685-c718-4d88-88b7-d4578b666b37` if any of these occur: the service does
not start, health is not `ok`, checkout pages or the checkout API return 5xx,
the catalog or zone fingerprint differs, Operations does not load, or a major
visual regression appears.

Rollback is a Railway redeploy of that deployment. The new code adds optional
fields only, and the previous code ignores them, so no data repair is needed in
either direction. Do not edit data during an incident.

## Apex domain — message for AEserver support

> Domain: 3ldubai.ae. We host the site on Railway, which does not provide a
> static IP. `www.3ldubai.ae` already works through a CNAME and must stay as it
> is, as must our nameservers and all MX/email records.
>
> 1. Do you support an ALIAS or ANAME record, or CNAME flattening, at the root
>    (`@`) of the zone? If so, we need the root to point to
>    `qh7cebps.up.railway.app`.
> 2. If not, does your domain forwarding product support all of the following
>    for the root domain: HTTPS on `https://3ldubai.ae` with a valid
>    certificate, a 301 permanent redirect to `https://www.3ldubai.ae`, the path
>    preserved (`/menu` → `/menu`), and the query string preserved
>    (`/menu?x=1` → `/menu?x=1`)?
>
> Please do not change anything yet; we only need to know which option is available.

With option 1 the application itself performs the redirect (already built and
tested). With option 2 the registrar does. If neither is available, the
remaining route is moving DNS hosting to a provider with root flattening, which
means changing nameservers and is a separate decision.
