# Post-release infrastructure — Resend, apex domain, Paymennt webhook (7 October 2026)

## A. Resend transactional email

Sending domain: `mail.3ldubai.ae` (Resend region eu-west-1, open and click
tracking off). Chosen because nothing exists at that name, and `3ldubai.ae`
itself has no MX or TXT records today, so nothing is displaced. The sender will
be an address at `@mail.3ldubai.ae`.

### DNS records to add at AEserver (exactly as issued by Resend)

| Purpose | Type | Host (relative to 3ldubai.ae) | Value | Priority | TTL |
|---|---|---|---|---|---|
| DKIM | TXT | `resend._domainkey.mail` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC7RnSHJJKt0UEDuP8ne39eKQ6YfSSJdPK0OnAVfPtTzp2Z69HSC34ynJq2tDNx76cGrsP/JcMmThP952kS32opdI0/x9e3Cdhydz8otAY4WCFY5VtqPYr2tEb7SZTrdBnIe8a/mEKS/+EbgqZBtpAAU4pg572O4dn0Ndqj2DCUuQIDAQAB` | — | Auto / 3600 |
| Bounce handling | MX | `send.mail` | `feedback-smtp.eu-west-1.amazonses.com` | 10 | Auto / 3600 |
| SPF | TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` | — | Auto / 3600 |
| Return path | CNAME | `rsend.mail` | `send.forge.rmta.net` | — | Auto / 3600 |

If the panel wants full names, append `.3ldubai.ae` to each host. The DKIM value
is a public key, not a secret. Add these four records and nothing else; do not
edit the root, `www`, nameservers or any existing record.

### Order of activation

1. Add the four records; wait for Resend to show the domain as verified.
2. In Resend, create an API key with "Sending access" restricted to
   `mail.3ldubai.ae`. Enter it directly in Railway → production → Variables as
   `RESEND_API_KEY`. Never paste it into chat or a file.
3. In the same place set `CUSTOMER_EMAIL_FROM` to
   `3L Pastelerías <orders@mail.3ldubai.ae>` (no mailbox needs to exist; replies
   are not monitored unless a reply-to is added later) and leave
   `CUSTOMER_EMAIL_ENABLED` unset or `false`.
4. Controlled test, from inside the Production container, to an address Joel
   supplies at that moment:
   `node dist/node/send-test-email.js <address> production`
   It sends one message marked `[TEST]`, opens no database and creates no event.
   Repeat with `pickup` and `delivery` if wanted.
5. Only after Joel confirms the test arrived correctly: set
   `CUSTOMER_EMAIL_ENABLED=true` (this restarts the service).

Enabling cannot release old emails: a row unsent after two hours is retired, and
Production currently has no customer email rows at all. Emails are plain text.

## B. Apex domain

Railway requires, for `3ldubai.ae` on the production service:

| Purpose | Type | Host | Value |
|---|---|---|---|
| Traffic | CNAME-style (ALIAS / ANAME / flattened CNAME) | `@` | `qh7cebps.up.railway.app` |
| Ownership | TXT | `_railway-verify` | `railway-verify=92b2aa6b93bf37fe59fc8641fd7cc3912d1f2e897bfd7e89129ee0530707721d` |

Current state: the root has an A record to the registrar's parking server
(`165.22.30.248`), no TXT, and Railway reports the certificate as waiting for
ownership validation. Railway publishes no static IP, so an A record cannot be
used. The application already redirects the bare host to `www` (301, path and
query kept) and will do so as soon as traffic reaches Railway.

### Message for AEserver support

> Domain: 3ldubai.ae (DNS on your nameservers). Our site is hosted on Railway,
> which has no static IP. Please do not change anything yet — we need to know
> which of these you support:
>
> 1. An ALIAS or ANAME record, or CNAME flattening, at the root (`@`) pointing
>    to `qh7cebps.up.railway.app`, replacing the current parking A record.
> 2. If not: domain forwarding for the root that provides all of — HTTPS on
>    `https://3ldubai.ae` with a valid certificate, a 301 redirect to
>    `https://www.3ldubai.ae`, the path kept (`/menu` → `/menu`) and the query
>    string kept (`/menu?x=1` → `/menu?x=1`).
>
> `www.3ldubai.ae`, our nameservers and all other records must stay as they are.

If they support option 1: replace the root A record with the alias and add the
`_railway-verify` TXT. If only option 2: use their forwarding (no Railway
records needed). If neither: the root cannot be served without moving DNS
hosting, which is a separate decision and not part of this sprint.

## C. Paymennt webhook

### Cause of the 400

Proven on the TEST environment with value-free diagnostics. The notifications
are correctly signed and carry a supported topic (`checkout/created`). They were
refused by body validation: Paymennt sends `"statusUpdateTimestamp": null` until
a checkout's status first changes, and the schema accepted the field being
absent but not `null`. Every checkout creation therefore produced a 400, which
Paymennt retried for hours. Paid notifications carry a timestamp and were
already accepted, which is why payments themselves were never affected.

### Fix

`statusUpdateTimestamp` is now nullish. Nothing else changed: the raw-byte
HMAC check, the topic allow-list and the rule that a notification is only a
signal — order state always comes from the authoritative GET — are as before.
A refused signed notification now logs the topic name and the names and JSON
types of its fields, never a value.

TEST after the fix: `checkout/created` notifications answer 200 and each
triggers a reconciliation whose authoritative result is `pending`.

### The second request, `POST /` on the Railway hostname

Production also receives every event at
`https://tres-leches-pasteleria-demo-production.up.railway.app/`, answered 405.
The application only ever registers `https://www.3ldubai.ae/api/webhooks/payment`
and has no route at `/`. This is a second, stale registration on the Paymennt
merchant; it cannot be listed or removed through the published API. It is
harmless but noisy, and should be removed by Paymennt.

### Message for Tarek / Paymennt support

> Merchant: 3L (LIVE). Our webhook endpoint is
> `https://www.3ldubai.ae/api/webhooks/payment` and must stay registered with
> its current signing key.
>
> We also receive every event at a second address,
> `https://tres-leches-pasteleria-demo-production.up.railway.app/` (site root),
> which we never intended to register. Could you list the webhook registrations
> on the LIVE merchant and remove only that second one? Please do not rotate or
> re-create the first.
