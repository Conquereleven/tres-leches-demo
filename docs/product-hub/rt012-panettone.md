# RT01.2 · Panettone

Base RT01.1 `3d5be2f4e128a31ef8e7e02097c10211c5d36f01`. The catalog manifest, verified covers and optimized gallery media are in [data-imports/rt012-panettone](../../data-imports/rt012-panettone/manifest.json). Runtime startup has no catalog seed. Product Hub publishes the media.

| Product | Mini, AED 27 | Normal, AED 170 | Founder-confirmed PH cover |
| --- | --- | --- | --- |
| Panettone Normal | `panettone-normal-mini` | `panettone-normal-normal` | `photos/panettone/09.webp` |
| Panettone Chocolate | `panettone-chocolate-mini` | `panettone-chocolate-normal` | `photos/panettone/14.webp` |
| Panettone Pistacchio | `panettone-pistacchio-mini` | `panettone-pistacchio-normal` | `photos/panettone/11.webp` |

The covers and the ten extra gallery photos show the Normal size. The Mini group shots remain unassigned. The six SKUs have no season. Only gluten and, for Pistacchio, pistachio are confirmed. The public copy identifies the incomplete allergen declaration. The Founder deferred optional specifications past launch. Keep each SKU unavailable for purchase until its mandatory allergen declaration is verified.

## Native preview and evidence

Run from the local RT01.2 worktree in an environment with loopback and browsers enabled. The fixture creates its own SQLite database, applies the Product Hub commands, and uses a synthetic payment adapter with no network calls.

```sh
npm run build
node --import tsx tests/fixtures/rt012-panettone-server.ts
```

Open `http://127.0.0.1:4178/bakery?category=panettone&lang=en` and switch `lang` to `es` or `ar`. Stop the preview before running the browser suite, which starts its own fixture.

```sh
npx playwright install chromium webkit
npx playwright test -c playwright.rt012.config.ts --reporter=list
node --import tsx --test tests/commerce/rt012-panettone.test.ts
```

## Coordinated V3.2 publication

Use the normal Product Hub role, feature flags and revision checks. Compare the target's current published revision with the proposed change and preserve any unrelated draft work. Prepare `addCategory` for `panettone` and `saveFamily` for the same ID. Upload the manifest's three covers and ten gallery WebPs, checking every SHA-256, and assign the returned media IDs to their manifest products. Send one `saveProduct` per product with the two variants, their localized content and the current `expectedVersion`. The [fixture](../../tests/fixtures/rt012-panettone.ts) shows the command payloads with the release hold enabled through `release: true`. The fixture is for disposable test data.

Review the combined private draft against the manifest and current revision. For V3.2, use `commercialState: published`, `active: true` and `availability: unavailable` on the six SKUs so customers can see each product, its photographs, sizes and prices. Once the release controls pass, an authorized admin can publish the combined draft with its reviewed `expectedPublishedRevision` and `expectedVersion`. Verify the three detail pages, their media URLs and disabled purchase state, and confirm that checkout quotes are ineligible for the six held SKUs. To release an individual hold, verify its declaration first, then publish the approved disclosure and availability through Product Hub. Existing accepted orders retain their snapshots.
