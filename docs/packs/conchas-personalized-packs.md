# CONCHAS-PACK-001 · Review and controlled activation

Baseline: `7c72fd94826d63e3d244d20818bb462e051b2bc9` (latest main, including merged PACK-001). One shared configurator, preparation contract, Product Hub workflow and version-1 immutable snapshot. No prices, commercial names, catalog JSON, media, retail availability, payment adapter, financial state machine or historical records changed. No Production writes, flags, deployment, publications, real orders or provider transactions.

## Verified Production catalog (16 October 2026, Dubai)

Both public checkout config and published storefront returned the same revision, `catalog-v1-5200a41c411a6409dc5529b76e10f6c95e61b7aaccca3c1b97dfb4c2f9c4e190`. All eight packs were orderable at these exact fixed prices:

| Existing pack SKU                          | AED |
| ------------------------------------------ | --: |
| `conchas-traditional-pack-6-mini`          |  60 |
| `conchas-traditional-pack-12-mini`         | 115 |
| `conchas-traditional-pack-6-individuales`  |  72 |
| `conchas-traditional-pack-12-individuales` | 140 |
| `conchas-filled-pack-6-mini`               | 100 |
| `conchas-filled-pack-12-mini`              | 190 |
| `conchas-filled-pack-6-individuales`       | 120 |
| `conchas-filled-pack-12-individuales`      | 235 |

[Read-only public evidence](conchas/production-public-baseline.json). No live private SQLite or user records accessed. Recheck prices/revision before a future release; never overwrite a later approved publication.

## Exact candidate component matrix

These are candidates, **not production approvals**. Each component must exist in the actual catalog and be explicitly approved for its exact pack SKU through Product Hub before it is selectable. API validation rejects missing identities. All component identity pairs below already exist in the approved reference catalog; no new SKU is created.

| Family / flavor                      | Mini component SKU                               | Individual component SKU                               |
| ------------------------------------ | ------------------------------------------------ | ------------------------------------------------------ |
| Traditional · Vanilla                | `conchas-traditional-vainilla-mini-40-g`         | `conchas-traditional-vainilla-individual-70-g`         |
| Traditional · Chocolate              | `conchas-traditional-chocolate-mini-40-g`        | `conchas-traditional-chocolate-individual-70-g`        |
| Traditional · Pistachio              | `conchas-traditional-pistache-mini-40-g`         | `conchas-traditional-pistache-individual-70-g`         |
| Traditional · Tricolour              | `conchas-traditional-tricolor-mini-40-g`         | `conchas-traditional-tricolor-individual-70-g`         |
| Filled · Diplomat cream (vanilla)    | `conchas-filled-crema-diplomatica-vainilla-mini` | `conchas-filled-crema-diplomatica-vainilla-individual` |
| Filled · Chocolate                   | `conchas-filled-chocolate-mini`                  | `conchas-filled-chocolate-individual`                  |
| Filled · Mascarpone and cajeta       | `conchas-filled-mascarpone-y-cajeta-mini`        | `conchas-filled-mascarpone-y-cajeta-individual`        |
| Filled · Mascarpone and strawberries | `conchas-filled-mascarpone-y-fresas-mini`        | `conchas-filled-mascarpone-y-fresas-individual`        |
| Filled · Pistachio                   | `conchas-filled-pistache-mini`                   | `conchas-filled-pistache-individual`                   |

[Expanded pack-to-component matrix: 36 candidate associations](conchas/sku-flavor-matrix.csv). Mini components apply only to the 6/12 mini packs; individual components apply only to the 6/12 individual packs of their own family. No traditional/filled, size or Pan de Muerto cross-mixing.

Only filled Pistachio is currently retail-orderable in public Production config; the other eight filled retail SKUs remain inactive/unavailable in the approved reference catalog. This implementation never reactivates them. Approval for pack production is a separate explicit decision, without implying retail availability, inventory or stock. No Conchas rules were published in the observed Production revision.

## Independent rollout / compatibility

- Existing `PERSONALIZED_PACKS_ENABLED` continues to control Pan de Muerto only.
- New `PERSONALIZED_CONCHAS_PACKS_ENABLED=false` by default. Absent, false or invalid values keep all eight legacy Conchas packs purchasable without compositions. A Pan flag already on cannot activate Conchas.
- Conchas can be enabled independently; the old Pan flag is not a prerequisite. Enabling the new flag does not approve any flavor. Missing published rules enable nothing.
- Existing optional Foundation `packEligibility` supports up to 16 distinct format rules instead of 8. Old eight-rule or absent-field revisions keep their schema version, identity and fingerprint. No migration/import/bootstrap is needed.
- Active rules are canonicalized and filtered by the family gate for quote/config responses. Publishing inactive Conchas eligibility does not invalidate existing Pan quote tokens. Once Conchas is active, stale or disabled preparation is rejected before new payment creation.
- Shared cart identity, quantities, edit/refresh, price authority, quote revision, idempotency, retry/resume, financial freezing, customer summaries, English kitchen/tickets and operational notification integrations are reused. Accepted version-1 preparation snapshots are read without consulting current flags, retail availability or flavor approvals.
- EN/ES/AR and RTL reuse the existing PackBuilder copy. Product Hub legend distinguishes Traditional/Filled Conchas from Pan de Muerto. No new commercial/public product name is introduced.

## Name proposals — founder approval required

Current names such as “Concha tradicional de chocolate · Pack” and “Concha rellena de pistache · Pack” remain unchanged, including accepted financial snapshots. Their current photos also remain unchanged. Before broad arbitrary-mix activation, approve neutral names or explicitly accept the current presentation:

| Family      | Proposed EN                             | Proposed ES                                | Proposed AR                       |
| ----------- | --------------------------------------- | ------------------------------------------ | --------------------------------- |
| Traditional | Traditional Conchas · Personalized Pack | Conchas tradicionales · Pack personalizado | كونشا تقليدية · عبوة حسب الاختيار |
| Filled      | Filled Conchas · Personalized Pack      | Conchas rellenas · Pack personalizado      | كونشا محشوة · عبوة حسب الاختيار   |

These are documentation-only proposals. Apply only a separately approved naming diff through Product Hub; do not rename historical orders. Image-disclaimer wording remains the earlier unpublished proposal, not newly approved commercial text.

## QA and evidence

- Typecheck, lint, build: PASS. Sites: 4/4. Heuristic secret scan: 0 findings. Dependency audit: 0 vulnerabilities.
- Full commercial/unit/HTTP suite: **648/648**, including the original **17 Pan** regressions and **21 Conchas** regressions. All eight prices, every candidate, one/all/arbitrary flavors, exact 6/12 counts, box multiplication, invalid/duplicate/cross-family/wrong-size rejection, four off/invalid gate states, accepted legacy checkout, independent activation, no implicit approvals, sixteen-rule publication/RBAC, unchanged retail flags, stale quote rejection and paid snapshot immutability.
- Conchas browser suite: **40/40** cases across Chromium/WebKit, EN/ES/AR, 390/768/1440. Each responsive scenario cycles all four formats of its family. Cart edits/distinct mixtures, refresh and server quote/checkout summaries, full axe on new controls, fake paid order → kitchen/ticket, sixteen Product Hub controls and Pan-on/Conchas-off compatibility.
- Existing Pan pack browser suite: **24/24**. Existing checkout: **21 Chromium + 21 WebKit**. Product Hub: **8/8**. These regressions run separately. All transport and fixture data are synthetic. No real payment or email was made.
- Existing build warnings remain: large bundle and pending business-content fields. New wording is developer-reviewed, not native-language certification.

[Representative screenshots](conchas/screenshots/README.md). Full local capture matrix: `work/qa/conchas-packs` (ignored). The GitHub browser workflow runs Conchas in parallel with the unchanged Pan/checkout/Operations gates, without secrets or deployment steps.

## Required approvals and release sequence

1. **Code review / release:** founder separately authorizes merge and code deployment. Deploy with the new Conchas flag absent/false; leave Pan's existing flag and published approvals untouched. Verify revision/health, legacy Conchas orderability and personalized Pan. No automatic activation in this PR.
2. **Availability:** Lisa confirms actual production eligibility per Conchas format. In Operations → Products → Pack flavor eligibility, admin/manager prepares a private draft. Verify all eight Conchas rows; no rules or presets are automatically seeded.
3. **Publication:** inspect the before/after review for Conchas eligibility only. Manager cannot publish, including forged API requests; admin publication requires separate authorization. Existing Pan rules and all commercial prices/retail flags must remain unchanged.
4. **Presentation:** resolve the flavor-specific name issue using founder-approved wording (or explicit acceptance of the existing names), via a separately reviewed Product Hub publication. No automatic name changes.
5. **Commercial activation:** after the reviewed code and approvals are live, founder separately authorizes only `PERSONALIZED_CONCHAS_PACKS_ENABLED=true` and its Railway restart. No changes to the Pan flag, provider settings, users, DNS or other features.
6. **UAT:** select all-one-flavor and mixed boxes in each of the eight formats; verify exact capacity, fixed AED amount, two distinct mixes, edit/refresh and EN/ES/AR. Confirm pickup and authoritative zone minima through existing quotation. Use fake transport or separately authorized natural events, never an unapproved LIVE test transaction.
7. **Rollback:** turn only the Conchas flag off on this snapshot-compatible build. Legacy Conchas purchasing resumes; Pan stays enabled. Preserve accepted Conchas preparation snapshots and reconcile existing payments from their frozen records. Repair rules through a new forward publication. Never restore an old database over transactions or deploy a pre-extension reader after composed Conchas orders exist.

**Code-review GO after final QA/CI. Commercial activation NO-GO until actual eligibility, presentation and separate founder release/flag approvals are complete.**
