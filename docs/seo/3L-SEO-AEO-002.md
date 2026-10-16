# 3L-SEO-AEO-002 · Organic search and AI discovery

Issue #32. Baseline `main` `a75a0fa` (= live Production revision, `/api/health`, 15 Oct 2026).
Builds on PR #24 (`SEO_AEO_FOUNDATION_REPORT.md`); nothing there is rebuilt.

Two pull requests, so Codex's Pack Builder (#31) is never overwritten:

| PR      | Branch                          | Content                                                           | Merge                                                                             |
| ------- | ------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Track A | `feat/3l-seo-aeo-002-technical` | Technical fixes + this plan                                       | Independent                                                                       |
| Track B | `feat/3l-seo-product-pages`     | `/menu/<slug>` product pages, live sitemap, Product/Offer JSON-LD | **After #31**: touches `MenuCatalog.tsx`, `menu.ts`, `Root.tsx`, `server/http.ts` |

## 1. Live state (read-only checks, 15 Oct 2026)

| Check                                                                                | Result                                                                                                                   |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `https://www.3ldubai.ae/api/health`                                                  | 200, `environment: production`, revision `a75a0fa`                                                                       |
| `/`, `/menu`, `/how-to-order`, policies                                              | 200 HTML, own title/description/canonical (PR #24)                                                                       |
| `/robots.txt`                                                                        | 200: `User-agent: * / Allow: /` + sitemap line                                                                           |
| `/sitemap.xml`                                                                       | 200, 8 public URLs, no product URLs                                                                                      |
| `/cart`, `/operations/*`                                                             | `X-Robots-Tag: noindex, nofollow`                                                                                        |
| `/api/storefront/catalog`                                                            | 200 JSON **without** `X-Robots-Tag` (fixed in Track A)                                                                   |
| `/menu?product=<slug>`                                                               | 200, the `/menu` document: product content exists only after JavaScript                                                  |
| Published catalog                                                                    | revision `catalog-v1-991ede…`, 74 products, 216 options, `publishedAt: null`, **0 products with an English description** |
| Crawler agents (Googlebot, bingbot, OAI-SearchBot, GPTBot, PerplexityBot, ClaudeBot) | 200 on `/`, `/menu`, `/robots.txt`, `/sitemap.xml`: none blocked by the host                                             |
| Home page time to full response                                                      | 0.8–8.5 s across samples from this network; not a CWV measurement                                                        |

**Indexing status: UNVERIFIED.** No Search Console or Bing Webmaster access was available. A sitemap or a `site:` result is not evidence of indexing.

## 2. Track A changes (this PR)

1. **Operations code is no longer downloaded by customers.** `Root.tsx` lazy-loads `CommerceWorkspace`. Measured build output:

   | Asset                                       | Before   | After                    |
   | ------------------------------------------- | -------- | ------------------------ |
   | Customer JS (gzip)                          | 387.3 KB | 302.3 KB (−22%)          |
   | Customer CSS (gzip)                         | 31.1 KB  | 21.3 KB (−32%)           |
   | Operations chunk (gzip, `/operations` only) | —        | 86.3 KB JS + 10.6 KB CSS |

   React DOM is now the largest part of the customer bundle; `Shop.tsx` (cart/checkout) is next and is Codex's area, so it is not split here.

2. **`/index.html` and `/<page>.html` → 301** to the clean URL (they served duplicates with 200).
3. **Every `/api/*` answer carries `X-Robots-Tag: noindex`**, including the storefront catalog and checkout config, which bypass the shared JSON helper.
4. **Brand photography, fonts and icons revalidate**: weak `ETag`, `Last-Modified`, `Cache-Control: public, max-age=3600, must-revalidate`, and `304` on `If-None-Match`. HTML still has no cache header (it must always reference the current bundle); hashed bundles stay immutable.

Tests: `tests/commerce/seo-technical.test.ts` (new) and one deliberate update in `seo.test.ts` (brand media: "not immutable" → "revalidates hourly").

## 3. Apex domain `3ldubai.ae` — correction plan (no DNS change made)

Read-only DNS (re-checked 15 Oct 2026):

| Item                                   | Value                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------- |
| Registrar                              | AEserver (`whois`: Registrar ID `AESERVER`, status `ok`)               |
| Authoritative DNS (delegated by `.ae`) | `dns1–3.aeserver.com` → edit records in the **AEserver panel**         |
| `3ldubai.ae` A                         | `165.22.30.248`: Apache "AEserver Parking Page"; no HTTPS              |
| `www.3ldubai.ae`                       | CNAME `agpvjymd.up.railway.app` (correct, HTTPS works, http→https 301) |
| TXT / MX / CAA at apex                 | none (no Google/Bing verification yet; no CAA blocking certificates)   |

Effect: anyone typing `3ldubai.ae` sees a parking page, and the server's apex→www redirect never runs.

Owner steps:

1. Railway → Production service → Settings → Networking → Custom domain → add `3ldubai.ae`; copy the record Railway shows.
2. AEserver panel → DNS for `3ldubai.ae`: delete `A 165.22.30.248`; add what Railway asks for. A CNAME is not allowed at the apex: use AEserver's ALIAS/ANAME/flattened-CNAME record if offered. If not offered, use AEserver URL forwarding: `3ldubai.ae` → `https://www.3ldubai.ae` as a **301**, path preserved.
3. Leave the `www` CNAME unchanged.
4. Verify after propagation: `curl -sI http://3ldubai.ae/menu` and `curl -sI https://3ldubai.ae/menu` → `301` to `https://www.3ldubai.ae/menu`.
5. Rollback: re-create `A 165.22.30.248`.

Keep `www` as the canonical host (already in canonicals, sitemap and JSON-LD).

## 4. Search Console, Bing and monitoring — activation checklist

| #   | Action                                                                                                                                                                            | Who / access                                             | Code needed  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------ |
| 1   | Google Search Console: add a **Domain property** `3ldubai.ae` (covers http/https, apex and www); verify with the TXT record Google gives                                          | Founder: Google account + registrar DNS                  | No           |
| 2   | Submit `https://www.3ldubai.ae/sitemap.xml` in Search Console → Sitemaps                                                                                                          | Founder                                                  | No           |
| 3   | URL Inspection on `/`, `/menu`, one `/menu/<slug>` after Track B ships; request indexing once                                                                                     | Founder                                                  | No           |
| 4   | Bing Webmaster Tools: **Import from Google Search Console** (fastest), or verify with DNS TXT/CNAME                                                                               | Founder: Microsoft account                               | No           |
| 5   | Submit the same sitemap in Bing                                                                                                                                                   | Founder                                                  | No           |
| 6   | IndexNow (optional, Bing/Yandex): host a key file and ping on publication                                                                                                         | Needs approval: a key file in `public/` + a publish hook | Small, later |
| 7   | Monitoring: weekly Search Console Performance (queries, pages, CTR), Pages report (excluded/indexed), Merchant listings + Product snippets reports after Track B; Bing equivalent | Founder/Lisa                                             | No           |
| 8   | Google Business Profile (section 6)                                                                                                                                               | Founder/Lisa                                             | No           |

Do not report anything as "indexed" until Search Console's Pages report or URL Inspection says so.

## 5. Dubai search themes and content (candidates, not verified volumes)

No keyword-volume tool was used; themes are judged by intent and what the business actually sells (published catalog, 15 Oct 2026). Competition notes come from a small web search, not a full SERP study.

| Theme                                           | Intent                             | Fit with what 3L sells                                 | Competition observed                                        | Page that should answer it                                    |
| ----------------------------------------------- | ---------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------- |
| tres leches cake Dubai                          | Transactional/local                | Core: 11 cakes + 6 special flavours, sizes 1–16 people | At least one Dubai tres leches brand (Tresleches.DXB, jars) | Category view + each `/menu/tres-leches--*`                   |
| tres leches cake delivery Dubai                 | Transactional                      | Delivery across listed Dubai areas, minimums by area   | Delivery apps                                               | `/delivery-policy` + product pages                            |
| cake jars Dubai / tres leches jar               | Transactional                      | 11 jar flavours + bundle                               | Same brand as above sells jars                              | `/menu/cake-jar--*`                                           |
| Mexican bakery Dubai / panadería mexicana Dubai | Local discovery                    | Conchas, orejas, bisquets, cubilete, croissant         | No Dubai Mexican bakery surfaced in the sample search       | Home + bakery category                                        |
| conchas Dubai                                   | Transactional                      | 5 conchas + packs                                      | None surfaced                                               | `/menu/conchas-*`                                             |
| Pan de Muerto Dubai                             | Seasonal (Oct–Nov, Día de Muertos) | 8 products + packs, seasonal                           | None surfaced                                               | `/menu/pan-de-muerto-*`; publish before mid-October each year |
| Rosca de Reyes Dubai                            | Seasonal (January)                 | Published product                                      | Not checked                                                 | `/menu/rosca-de-reyes`                                        |
| Mexican desserts Dubai                          | Broad                              | Partial fit                                            | Restaurants                                                 | Home/how-to-order                                             |
| birthday cake Dubai                             | Broad, very competitive            | Fit only with real occasion content                    | High                                                        | Not a priority without approved occasion copy                 |

Third-party mention found: a Frying Pan Adventures podcast episode on authentic tres leches in Dubai names 3L Pastelerías with its WhatsApp number. Earned mentions like this are the most credible signal for both search and AI answers; Lisa can ask for a link to `www.3ldubai.ae`.

**Content priorities (need approved wording, nothing invented):**

1. A product description per product family in Product Hub (EN, then ES/AR). Today 0 of 74 products have one, so product pages can only show name, options and prices.
2. A short factual "About 3L in Dubai" paragraph (heritage is already approved: Mexico City since 1982).
3. A visible FAQ from real policies: delivery areas and minimums, order cut-off, pickup point, payment methods, advance-order products. Only add `FAQPage` markup if Google eligibility still applies when published (it is now limited mainly to government/health sites, so expect no rich result).
4. Seasonal landing copy for Pan de Muerto and Rosca de Reyes, published ahead of each season.

## 6. Google Business Profile — what the founder or Lisa must confirm

- Business name exactly as on signage (`Pastelerías 3L` vs `3L Pastelerías`) and legal entity shown on the site (Golositalia FZCO).
- Category: e.g. _Bakery_ (primary), _Cake shop_, _Dessert shop_ (secondary).
- Pickup address: the site states Golositalia JLT, Cluster C, Retail Shop C6/A. Confirm it is customer-facing, or use a service-area profile only.
- Service area: Dubai areas from the delivery policy.
- Opening/pickup hours: **not known**; the site does not state them.
- Primary phone (several numbers are published; choose one), website `https://www.3ldubai.ae/`, Instagram `@3ldubai`.
- Photos: approved product photographs only.

## 7. AI search (AEO) readiness

- Crawlers: `robots.txt` allows all agents. Verified 200 for **OAI-SearchBot** (ChatGPT search), GPTBot, PerplexityBot, ClaudeBot, Googlebot, bingbot. OpenAI documents OAI-SearchBot (search) and GPTBot (training) as independent controls.
- **Founder decision (no change made):** keep allowing GPTBot and other training crawlers, or add a group such as `User-agent: GPTBot` / `Disallow: /` while keeping OAI-SearchBot allowed. Blocking GPTBot does not remove the site from ChatGPT search.
- What helps citation: stable URLs, server-rendered facts, one canonical per page, consistent business identity across site/Instagram/GBP, and third-party mentions. Track B makes every published product a stable, crawlable fact page.
- `/llms.txt`: optional, low priority, no evidence that major assistants rely on it. Not added.
- No placement in ChatGPT, Gemini, Perplexity or Google is guaranteed.

## 8. Multilingual discoverability (plan, not implemented)

Today Spanish and Arabic exist only after JavaScript (`?lang=` / stored preference); every server document is English. Publishing `hreflang` to URLs that return English would be invalid. Proposed later sprint (touches shared storefront routing, so after #31):

1. Path-prefixed documents `/es/...` and `/ar/...` rendered on the server from the approved locale files and the published catalog's `es`/`ar` translations (all 74 products have ES and AR names).
2. `<html lang dir>` per document (`dir="rtl"` for Arabic), self-canonical per language, reciprocal `hreflang` + `x-default`.
3. Sitemap `xhtml:link` alternates. Only pages whose translation exists are listed.

## 9. Owner-input checklist

- [ ] DNS: fix apex `3ldubai.ae` (section 3).
- [ ] Search Console + Bing access, sitemap submission (section 4).
- [ ] Google Business Profile facts (section 6), including **hours**.
- [ ] Product descriptions per family in Product Hub (EN; ES/AR).
- [ ] An approved 1200×630 sharing image.
- [ ] AI training crawler policy (GPTBot etc.).
- [ ] Approval for a factual FAQ and for ES/AR URLs.
- [ ] A real `publishedAt` on catalog publications (currently `null`, so the sitemap carries no `lastmod`).

## Final integration gate · 16 October 2026

Track A rebased by merge onto deployed main `8f5cc785fe408b0288a3b8403983787cf57721ec` (PR36 personalized packs preserved). No textual conflicts in Track A; Track B combines both SEO import lists in `server/http.ts`. Dynamic catalog, composition identity, quote/payment domain, all eight fixed pack prices and provider gates are unchanged.

Local current-baseline gate: typecheck, lint, build; 615/615 commerce tests; dedicated compiled lazy-chunk/header/cache assertions. Dedicated SEO browser CI now runs on these PRs in addition to the commerce and packs gates. No deployment, DNS edit or commercial publication is part of this work. Final evidence and exact SHAs are recorded in the release report/PR.

**Current DNS correction supersedes section3's guessed root target:** Railway already has `3ldubai.ae` attached to Production port3001; it is unverified and certificate issuance is pending. Required apex target is **`qh7cebps.up.railway.app`**, not the www target. At AEserver replace `@ A 165.22.30.248` with a supported ALIAS/ANAME/flattened CNAME to that target and add the exact `_railway-verify` TXT shown in Railway. Keep `www CNAME agpvjymd.up.railway.app` and every mail/SPF/DKIM/DMARC record unchanged. Do not copy Railway's resolved IP into an A record. If apex flattening is unavailable, ask AEserver for managed HTTPS301 forwarding preserving path/query; no nameserver migration is authorized.

The `.ae` parent and registrar delegate to `dns1–3.aeserver.com`. The child zone/recursive NS answer advertises `ns1–3.rrpproxy.net`, with SOA contact `domains.aeserver.com`. DNS management remains AEserver; do not confuse these two observations with an authorized delegation change. Apex HTTP `/menu` currently404 and HTTPS connection refused; www TLS valid.
