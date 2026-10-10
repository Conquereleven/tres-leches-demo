# Conchas final visual batch — QA

Visual-only follow-up to merged PR #5 on the same sprint branch.

- Typecheck, lint and build passed.
- 448 commercial/unit tests and 4 Sites packaging tests passed.
- 46 Conchas Playwright tests passed in Chromium/WebKit, including EN/ES/AR,
  RTL, 390/768/1440px, shared Pan gallery transitions/pause/reduced motion,
  accessibility on product options and source fallbacks. The six final-batch
  cases passed again after loading all lazy cards for complete opening captures.
- 19 checkout regression tests passed in each engine (38 total).
- npm audit: zero vulnerabilities. Secret scan: zero findings.
- No console/page errors in the final three-product journeys; no horizontal
  overflow; selectors, Add to Cart, prices and cart/checkout images verified.
- All QA used disposable local fixtures; no real provider requests or payments.
- Catalog data, prices, availability, SKUs, server, zones and commercial/payment
  state machines are unchanged. Production was not modified or deployed.

## Opening gallery compared with Pan de Muerto

Both use the same 3:2 frame, 20px radius and MediaRotation.
The three new source images remain uncropped; baked-in margins remain visible.

| Width | Conchas | Pan de Muerto |
| --- | --- | --- |
| 390 | [Conchas](opening-390.png) | [Pan](pan-reference-390.png) |
| 768 | [Conchas](opening-768.png) | layout parity covered by automated test |
| 1440 | [Conchas](opening-1440.png) | [Pan](pan-reference-1440.png) |

## Exact product imagery

| Product | Mobile | Desktop |
| --- | --- | --- |
| Filled Pistache | [390](conchas-filled--pistache-390.png) | [1440](conchas-filled--pistache-1440.png) |
| Chocolate pack | [390](conchas-traditional-pack-390.png) | [1440](conchas-traditional-pack-1440.png) |
| Filled Pistache pack | [390](conchas-filled-pack-390.png) | [1440](conchas-filled-pack-1440.png) |

Mobile cart/checkout captures for each product are also included here. Full tablet
and desktop journey captures/logs are retained in the local report archive.

Initial browser run used the old compiled bundle while the build was finishing;
all gates were repeated on the completed final build. No source defect or test
suppression was needed. Opening capture now waits for all lazy card images.

No merge or deployment is included in this follow-up. Final visual review pending.
