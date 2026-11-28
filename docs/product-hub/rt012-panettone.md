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

## V3.2 commercial hotfix

The published catalogue had size names in the localized Variant field and full product names in the localized Size field. Use the manifest's localized flavor and size values for the six records. Keep the existing SKU, localized catalogue name, descriptions, allergen text, price, availability and commercial state. Normal, Chocolate and Pistacchio are flavors. Mini and Normal are sizes.

The three new square covers come directly from verified PH originals 09, 14 and 11, with the original image crop and SHA-256 in the manifest. Replace the existing primary link for each product via Product Hub. Preserve all gallery links. The covers show Normal-size products, and the configurator identifies that size when Mini is selected.

Before applying the prepared correction, get the current authenticated Product Hub view and publish revision. Review any open draft before touching it. Upload only the three manifest covers, with validated hashes, using the current primary asset's localized alt text. `preparePanettoneHotfix` builds each existing `saveProduct` command from the authenticated record and new primary asset ID. Use the current expected draft version for each command. Verify the pending diff contains only the flavor attributes, their localized labels, the localized size labels and the new primary assets and links. Re-read price, enabled flags, text and orderability against the current live records to verify they were preserved. Publish only after the applicable Founder GO and release gates. The application build never publishes these changes.

The same commercial hotfix prepares a product-only photograph for existing Mexican Bolillo `111` (the sole SKU is `B111`). See [PH provenance](../../data-imports/commercial-hotfix/ph-media.json). Review the latest links, then use `prepareBolilloMedia` with the uploaded asset ID. It adds a primary if none exists, appends a gallery photo when a primary exists and skips an existing asset link. Its draft changes must be limited to the media upload and the product media link. The unchanged six-piece minimum and quotation remain authoritative. The other PH views without verified associations remain private.
