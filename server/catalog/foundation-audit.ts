import type { CatalogItem, State } from "../domain/model";
import type { Store } from "../db/store";
import { RETIRED_SKUS } from "../../shared/commerce-policy";
import { planCatalogBootstrap, type BootstrapSources } from "./bootstrap";
import { catalogDigest, validateFoundation } from "./contract";

/**
 * Production initialization of the catalog foundation.
 * The audit reads; apply adds `catalogFoundation` and nothing else. Reports carry
 * catalog facts and counts only: never customers, orders, payments or secrets.
 */
const FIELDS = [
  "name",
  "priceFils",
  "active",
  "availability",
  "category",
  "description",
] as const;
export type Discrepancy = {
  sku: string;
  field: (typeof FIELDS)[number] | "missing-in-database" | "not-in-sources";
  database: string | number | boolean | null;
  approved: string | number | boolean | null;
};
// Product Hub V2 state, where that feature is present; this module does not depend on it.
const hub = (s: State) =>
  (s as State & { productHub?: { draft?: unknown } }).productHub;
const sorted = (catalog: CatalogItem[]) =>
  [...catalog].sort((a, b) => a.id.localeCompare(b.id, "en"));
export const catalogFingerprint = (catalog: CatalogItem[]) =>
  catalogDigest(sorted(catalog));
/** Everything the initialization must leave untouched, the commercial catalog included. */
export const protectedFingerprint = (state: State) => {
  const { catalogFoundation: _foundation, ...rest } = state;
  return catalogDigest(rest);
};
export const sourcesFingerprint = (sources: BootstrapSources) =>
  catalogDigest(sources);

/** The database is evidence; the repository never overrides it. */
export function reconcileCatalog(
  catalog: CatalogItem[],
  approved: CatalogItem[],
): Discrepancy[] {
  const out: Discrepancy[] = [];
  const db = new Map(catalog.map((c) => [c.id, c]));
  const src = new Map(approved.map((c) => [c.id, c]));
  for (const a of sorted(approved)) {
    const c = db.get(a.id);
    if (!c) {
      out.push({
        sku: a.id,
        field: "missing-in-database",
        database: null,
        approved: a.name,
      });
      continue;
    }
    for (const field of FIELDS)
      if (c[field] !== a[field])
        out.push({
          sku: a.id,
          field,
          database: c[field] ?? null,
          approved: a[field] ?? null,
        });
  }
  for (const c of sorted(catalog))
    if (!src.has(c.id))
      out.push({
        sku: c.id,
        field: "not-in-sources",
        database: c.name,
        approved: null,
      });
  return out;
}

export type FoundationStatus =
  "absent" | "current" | "differs-from-plan" | "inconsistent";
export function auditFoundation(
  state: State,
  sources: BootstrapSources,
  profile: string | null,
) {
  const catalog = state.catalog ?? [];
  const discrepancies = reconcileCatalog(catalog, sources.approved);
  const plan = planCatalogBootstrap(catalog, sources);
  let status: FoundationStatus = "absent";
  let storedRevision: string | null = null;
  let foundationProblem: string | null = null;
  const stored = state.catalogFoundation;
  if (stored) {
    storedRevision = stored.revision?.id ?? null;
    try {
      validateFoundation(stored, catalog);
      status =
        catalogDigest(stored) === catalogDigest(plan.foundation)
          ? "current"
          : "differs-from-plan";
    } catch (e) {
      status = "inconsistent";
      foundationProblem = e instanceof Error ? e.message : "Invalid foundation";
    }
  }
  const ids = new Set(catalog.map((c) => c.id));
  const retiredSellable = catalog
    .filter((c) => RETIRED_SKUS.has(c.id) && c.active)
    .map((c) => c.id);
  const blockers = [
    ...new Set([
      ...plan.report.blockers,
      ...(discrepancies.length
        ? [`${discrepancies.length} catalog discrepancies`]
        : []),
      ...(ids.size !== catalog.length ? ["Duplicate SKU in database"] : []),
      ...(status === "inconsistent"
        ? [`Stored foundation is inconsistent: ${foundationProblem}`]
        : []),
      ...(hub(state) && !stored
        ? ["Product Hub state exists without a foundation"]
        : []),
    ]),
  ];
  // An initialized, self-consistent foundation is the published truth from then on;
  // differences with the repository are then reported, not blocking.
  const decision =
    status === "inconsistent"
      ? ("BLOCKED" as const)
      : status !== "absent"
        ? ("ALREADY_INITIALIZED" as const)
        : blockers.length
          ? ("BLOCKED" as const)
          : ("READY_TO_APPLY" as const);
  return {
    decision,
    profile,
    database: {
      skuCount: catalog.length,
      activeSkuCount: catalog.filter((c) => c.active).length,
      unavailableSkuCount: catalog.filter(
        (c) => c.availability === "unavailable",
      ).length,
      catalogFingerprint: catalogFingerprint(catalog),
      protectedFingerprint: protectedFingerprint(state),
      // Counts only; the records themselves are never read into a report.
      orderCount: state.orders?.length ?? 0,
      paymentCount: state.payments?.length ?? 0,
    },
    sources: {
      skuCount: sources.approved.length,
      fingerprint: sourcesFingerprint(sources),
    },
    foundation: {
      status,
      storedRevision,
      plannedRevision: plan.report.valid ? plan.foundation.revision.id : null,
      productHubPresent: !!hub(state),
    },
    plan: {
      productCount: plan.report.productCount,
      publicProductCount: plan.report.publicProductCount,
      mappedSkuCount: plan.report.mappedSkuCount,
      legacySkuCount: plan.report.review.length,
      missingTranslationCount: plan.report.missingTranslations.length,
    },
    retiredSkusStillActiveInDatabase: retiredSellable,
    discrepancies,
    blockers,
  };
}
export type FoundationAudit = ReturnType<typeof auditFoundation>;

export class BootstrapRefused extends Error {}
/**
 * Adds the foundation and nothing else, in one transaction. The operator passes the
 * fingerprints from the audit they reviewed; any change since then refuses the write.
 */
export function applyFoundation(
  store: Store,
  sources: BootstrapSources,
  expected: {
    catalogFingerprint: string;
    plannedRevision: string;
    profile: string | null;
  },
) {
  return store.write((s: State) => {
    const audit = auditFoundation(s, sources, expected.profile);
    if (audit.database.catalogFingerprint !== expected.catalogFingerprint)
      throw new BootstrapRefused(
        "The catalog changed since the audit; audit again",
      );
    if (audit.decision === "ALREADY_INITIALIZED")
      return {
        applied: false as const,
        revision: audit.foundation.storedRevision,
      };
    if (audit.decision !== "READY_TO_APPLY")
      throw new BootstrapRefused(`Not ready: ${audit.decision}`);
    if (audit.foundation.plannedRevision !== expected.plannedRevision)
      throw new BootstrapRefused(
        "The planned revision differs from the audited one; audit again",
      );
    const before = protectedFingerprint(s);
    const { foundation } = planCatalogBootstrap(s.catalog ?? [], sources);
    s.catalogFoundation = foundation;
    validateFoundation(s.catalogFoundation, s.catalog ?? []);
    if (protectedFingerprint(s) !== before)
      throw new BootstrapRefused("Protected state would change");
    return { applied: true as const, revision: foundation.revision.id };
  });
}
/**
 * Non-destructive recovery: removes only the foundation this tool added, and only while
 * nothing has been built on it. Never restores a backup over newer orders.
 */
export function revertFoundation(store: Store, expectedRevision: string) {
  return store.write((s: State) => {
    if (!s.catalogFoundation) return { reverted: false as const };
    if (hub(s))
      throw new BootstrapRefused(
        "Product Hub has state built on this foundation; it cannot be removed",
      );
    if (s.catalogFoundation.revision.id !== expectedRevision)
      throw new BootstrapRefused("Stored revision is not the expected one");
    const before = protectedFingerprint(s);
    delete s.catalogFoundation;
    if (protectedFingerprint(s) !== before)
      throw new BootstrapRefused("Protected state would change");
    return { reverted: true as const };
  });
}

/**
 * Separate, separately approved step: the combinations removed on 9 October 2026 are
 * blocked in code but may still be stored as sellable. This brings those rows, and no
 * others, in line with that decision. It is never part of `apply`.
 */
export const retiredStillSellable = (catalog: CatalogItem[]) =>
  catalog
    .filter(
      (c) =>
        RETIRED_SKUS.has(c.id) &&
        (c.active !== false || c.availability !== "unavailable"),
    )
    .map((c) => c.id);
export function deactivateRetired(
  store: Store,
  expectedCatalogFingerprint: string,
  at: string,
) {
  return store.write((s: State) => {
    const catalog = s.catalog ?? [];
    if (catalogFingerprint(catalog) !== expectedCatalogFingerprint)
      throw new BootstrapRefused(
        "The catalog changed since the audit; audit again",
      );
    if (s.catalogFoundation)
      throw new BootstrapRefused(
        "The foundation exists; change products in Product Hub",
      );
    const targets = new Set(retiredStillSellable(catalog));
    if (!targets.size) return { changed: [] as string[] };
    const untouched = (items: CatalogItem[]) =>
      catalogFingerprint(items.filter((c) => !targets.has(c.id)));
    const before = untouched(catalog);
    for (const c of catalog)
      if (targets.has(c.id)) {
        c.active = false;
        c.availability = "unavailable";
      }
    if (untouched(catalog) !== before)
      throw new BootstrapRefused("Other products would change");
    s.audit.push({
      at,
      actor: "catalog-admin",
      action: `Removed Pan de Muerto combinations stored as inactive: ${targets.size} SKUs; verified backup created`,
    });
    return { changed: [...targets].sort() };
  });
}
