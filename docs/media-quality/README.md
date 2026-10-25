# Offline media preflight and initial loading stability

The menu loading section reserves one small viewport height, keeping the footer below the initial viewport while the published catalog is fetched. The selector applies only to `data-catalog-status="loading"`: loaded, unavailable and empty catalog behavior and product-photo geometry are preserved. This does not promise zero field CLS or change gallery interaction.

## Run the offline quality gate

```sh
python3 scripts/media-quality/gate.py /absolute/catalog.json /absolute/trusted-inventory.json /absolute/result.json
python3 -m unittest discover -s scripts/media-quality -v
```

The validator reuses the reviewed local audit implementation. JSON validation needs only Python 3; actual byte probing and its file test need Pillow (`python3 -m pip install -r scripts/media-quality/requirements.txt` in an isolated environment). Generate inventory with `probe(asset, approvedRoot)` from trusted local files, never uploader-provided assertions. It resolves symlinks and rejects root escapes, decodes bytes, records dimensions/format and SHA-256. It has no network, database, provider or publishing access. `legacy` formats are resolved through the extension and checked against decoded bytes.

Errors block preflight: unreadable assets, invalid references, contradictory dimensions/formats, unsupported formats, duplicate IDs/SKUs or invalid taxonomy. Missing photography, small sources, crop risks, duplicate slides/hashes and absent metadata are review warnings. A single-photo gallery and portrait sources are legitimate; background breads are not rejected by object count.

Exit 0 means technical preflight only. `contentStatus` always remains `HUMAN_REVIEW_REQUIRED`: quantity, color, flavor, authenticity and photo/illustration provenance need human evidence. The metadata heuristic can miss a whole cake whose label already says Jar. It is not a vision model. The human queue must not be skipped.

## Metadata proposal — do not publish automatically

`metadata-dimensions-proposal.json` preserves the audited source revision and its byte hash. It proposes eight width/height fields for four legacy assets, measured from actual bytes. It is an offline proposal, not a new catalog revision or migration. It does not fix their low resolution or choose commercial photography. Recheck the current revision and drafts, obtain separate publication authorization and use normal Product Hub controls before applying anything. No Product Hub or Production write is part of this PR.

## Founder exceptions — 25 October 2026

The founder explicitly accepted the current `conchas-tricolor-pack` image and whole-cake imagery for `special-flavours-jar--matcha`, `special-flavours-jar--chocolate` and `special-flavours-jar--berries` as temporary non-blocking exceptions. Keep all four assignments unchanged. This is not evidence that the imagery was corrected. The individual Tricolor, other media observations, static-gallery interaction decision and broader performance review remain separate. Do not apply a crop or replace photography under this technical change.

## Local validation and rollback

Run typecheck, lint, build, commerce/Sites tests and the offline gate tests. After build run `npx playwright test --config playwright.storefront-dynamic.config.ts tests/storefront-dynamic-e2e/media-loading.spec.ts` for Chromium/WebKit loading, unavailable/retry and empty states at 390/1440. Tests use a disposable SQLite fixture and fake providers. Existing checkout tests stay authoritative for commercial behavior.

Rollback the loading correction by reverting its CSS-only addition. Gate tooling is offline and does not affect application runtime; no catalog/database rollback is necessary. Production deployment, catalog publication and merge require separate founder approval.
