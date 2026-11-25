# RT01.2 · Panettone

Base RT01.1 `3d5be2f4e128a31ef8e7e02097c10211c5d36f01`. Candidate is local. The catalog manifest and optimized PH files are in [data-imports/rt012-panettone](../../data-imports/rt012-panettone/manifest.json). They are outside the storefront bundle and are not seeded on runtime startup.

| Product | Mini, AED 27 | Normal, AED 170 | Founder-confirmed PH cover |
| --- | --- | --- | --- |
| Panettone Normal | `panettone-normal-mini` | `panettone-normal-normal` | `photos/panettone/09.webp` |
| Panettone Chocolate | `panettone-chocolate-mini` | `panettone-chocolate-normal` | `photos/panettone/14.webp` |
| Panettone Pistacchio | `panettone-pistacchio-mini` | `panettone-pistacchio-normal` | `photos/panettone/11.webp` |

The covers show the Normal size. The supplied Mini group shots remain unassigned. The six SKUs have no season. Only gluten and, for Pistacchio, pistachio are confirmed. The public copy identifies the incomplete allergen declaration. Weights, ingredients, full allergens and commercial pack information remain pending.

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

## Later commercial publication

Use the normal Product Hub role, feature flags and revision checks. Compare the target's current published revision with the proposed change and verify that its draft is free of unrelated work. Prepare `addCategory` for `panettone` and `saveFamily` for the same ID, then upload the three verified WebPs once. Use their returned asset IDs as product primary images. Send one `saveProduct` per product with the two variants, localized content and the current `expectedVersion`. The [fixture](../../tests/fixtures/rt012-panettone.ts) shows the exact command payloads and is for disposable test data only.

Review the private draft against this manifest and confirm the remaining commercial declarations before any LIVE GO. An admin can then use the normal `publish` command with the reviewed `expectedPublishedRevision` and `expectedVersion`. To withdraw after publication, deactivate the six SKUs and publish a new revision. Existing accepted orders retain their snapshots.
