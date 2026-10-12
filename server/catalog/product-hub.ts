import { storefrontCatalogMode } from "./storefront-api";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Actor, CatalogItem, State } from "../domain/model";
import { DomainError } from "../domain/model";
import { availableSku, RETIRED_SKUS } from "../../shared/commerce-policy";
import type { Store } from "../db/store";
import {
  catalogDigest,
  foundationSchema,
  revisionFingerprint,
  translationsSchema,
  validateFoundation,
  type CatalogFoundation,
} from "./contract";

/**
 * Product Hub V2: an editable DRAFT of the catalog and a guarded publication.
 *
 * Authority is unchanged. `State.catalog` is the only price and availability
 * source; `State.catalogFoundation` is its relational description. The draft
 * is a private candidate copy of both. Nothing a customer or the checkout
 * reads changes until `publish` replaces the two published values together,
 * inside one SQLite transaction, after validation. Orders and payments are
 * never read for writing here.
 */
export type HubMetadata = Omit<CatalogFoundation, "revision">;
export type HubDraft = {
  /** Published revision this draft was started from; publish refuses any other. */
  baseRevisionId: string;
  updatedAt: string;
  updatedBy: string;
  catalog: CatalogItem[];
  foundation: HubMetadata;
};
export type HubHistoryEntry = {
  at: string;
  actor: string;
  action:
    | "draft.product"
    | "draft.family"
    | "draft.asset"
    | "draft.media"
    | "draft.discard"
    | "publish";
  summary: string;
  version: number;
  fromRevision?: string;
  toRevision?: string;
};
export type HubState = {
  /** Optimistic revision of the editing session. Every accepted write adds one. */
  version: number;
  draft?: HubDraft;
  history: HubHistoryEntry[];
  /** Idempotency receipts: same key and body replays the stored result. */
  commands: Record<string, { hash: string; result: unknown }>;
};
export type HubFlags = {
  enabled: boolean;
  publishEnabled: boolean;
  /** Why publication is unavailable, or null when it is available. */
  publishBlocked: string | null;
};

const MAX_HISTORY = 200;
const MAX_RECEIPTS = 200;
const MAX_PRICE_FILS = 10_000_000; // AED 100,000
export const HUB_MEDIA_PREFIX = "/brand/hub/";

/**
 * Editor and publication are separate switches, both off by default.
 * Publication is refused in Production in this phase: the public storefront
 * still ships its catalog at build time, so a published price would not reach
 * customers and the storefront would block the item as mismatched.
 */
export function hubFlags(env: NodeJS.ProcessEnv): HubFlags {
  const enabled = env.PRODUCT_HUB_ENABLED === "true";
  // The environment's own name decides. Staging also runs with
  // NODE_ENV=production, so that alone is not Production; but an environment
  // that does not say what it is gets treated as Production.
  const production = !["test", "development", "staging"].includes(
    env.APP_ENV ?? "",
  );
  const publishBlocked = !enabled
    ? "Product Hub is disabled"
    : env.PRODUCT_HUB_PUBLISH_ENABLED !== "true"
      ? "Publication is disabled in this environment"
      : production && storefrontCatalogMode(env) !== "on"
        ? "Publication is blocked in Production until the storefront reads published data"
        : null;
  return { enabled, publishEnabled: publishBlocked === null, publishBlocked };
}

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,149}$/);
const text = z.string().trim().min(1).max(2000);
const mediaLink = z
  .object({
    assetId: id,
    role: z.enum(["primary", "gallery"]),
    order: z.number().int().min(0).max(49),
  })
  .strict();
const status = z.enum(["draft", "published", "archived"]);
const expectedVersion = z.number().int().min(0);
const variantInput = z
  .object({
    skuId: id,
    flavor: text.nullable(),
    size: text.nullable(),
    packQuantity: z.number().int().positive().max(1000).nullable(),
    commercialState: status,
    translations: translationsSchema,
    media: z.array(mediaLink).max(50),
    /** Commercial fields; written to the draft copy of State.catalog. */
    catalogName: text.max(300),
    priceFils: z.number().int().positive().max(MAX_PRICE_FILS),
    active: z.boolean(),
    availability: z.enum(["available", "unavailable"]),
  })
  .strict();
export const hubCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("saveProduct"),
      expectedVersion,
      product: z
        .object({
          id,
          slug: id.nullable(),
          familyId: id,
          categoryId: id,
          name: text.max(300),
          description: text.nullable(),
          commercialState: status,
          translations: translationsSchema,
          media: z.array(mediaLink).max(50),
        })
        .strict(),
      variants: z.array(variantInput).min(1).max(60),
    })
    .strict(),
  z
    .object({
      type: z.literal("saveFamily"),
      expectedVersion,
      family: z
        .object({
          id,
          categoryId: id,
          name: text.max(300),
          pack: z.boolean(),
          advanceOrder: z.boolean(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("saveAsset"),
      expectedVersion,
      asset: z.object({ id, alt: translationsSchema }).strict(),
    })
    .strict(),
  z.object({ type: z.literal("discardDraft"), expectedVersion }).strict(),
  z
    .object({
      type: z.literal("publish"),
      expectedVersion,
      /** The published revision the admin reviewed the comparison against. */
      expectedPublishedRevision: z.string().regex(/^catalog-v1-[a-f0-9]{64}$/),
    })
    .strict(),
]);
export type HubCommand = z.infer<typeof hubCommandSchema>;

const hub = (s: State): HubState =>
  (s.productHub ??= { version: 0, history: [], commands: {} });
const published = (s: State) => {
  if (!s.catalogFoundation)
    throw new DomainError(503, "Catalog foundation unavailable");
  // Fail closed: if the catalog was changed without its foundation (or the
  // other way round) the editor must not present, or publish over, a
  // revision that no longer describes the prices actually in force.
  try {
    validateFoundation(s.catalogFoundation, s.catalog ?? []);
  } catch {
    throw new DomainError(
      503,
      "Published catalog and its foundation disagree; review before editing",
    );
  }
  const { revision, ...foundation } = s.catalogFoundation;
  return { revision, foundation, catalog: s.catalog ?? [] };
};
/** What the editor shows: the draft when there is one, else the published catalog. */
function candidate(s: State) {
  const live = published(s);
  const draft = s.productHub?.draft;
  return draft
    ? { foundation: draft.foundation, catalog: draft.catalog }
    : { foundation: live.foundation, catalog: live.catalog };
}
function ensureDraft(s: State, actor: Actor, now: Date): HubDraft {
  const h = hub(s);
  const live = published(s);
  h.draft ??= {
    baseRevisionId: live.revision.id,
    updatedAt: now.toISOString(),
    updatedBy: actor.id,
    catalog: structuredClone(live.catalog),
    foundation: structuredClone(live.foundation),
  };
  h.draft.updatedAt = now.toISOString();
  h.draft.updatedBy = actor.id;
  return h.draft;
}

export type HubIssue = {
  level: "error" | "warning";
  code: string;
  target: string;
  message: string;
};
export type HubChange = {
  kind: "product" | "variant" | "price" | "availability" | "family" | "asset";
  target: string;
  field: string;
  before: string | null;
  after: string | null;
};
const show = (v: unknown) =>
  v === null || v === undefined
    ? null
    : typeof v === "string"
      ? v
      : JSON.stringify(v);
const aed = (fils: number) => `AED ${(fils / 100).toFixed(2)}`;

/** Before/after comparison of the published catalog and the draft. */
export function hubChanges(
  live: { foundation: HubMetadata; catalog: CatalogItem[] },
  next: { foundation: HubMetadata; catalog: CatalogItem[] },
): HubChange[] {
  const changes: HubChange[] = [];
  const add = (
    kind: HubChange["kind"],
    target: string,
    field: string,
    before: unknown,
    after: unknown,
  ) => {
    if (catalogDigest(before ?? null) !== catalogDigest(after ?? null))
      changes.push({
        kind,
        target,
        field,
        before: show(before),
        after: show(after),
      });
  };
  const byId = <T extends { id: string }>(list: T[]) =>
    new Map(list.map((x) => [x.id, x]));
  type Owner = {
    translations: CatalogFoundation["products"][number]["translations"];
    media: CatalogFoundation["products"][number]["media"];
  };
  // One readable line per language and field, and per image list, instead of raw structures.
  const addContent = (
    kind: HubChange["kind"],
    target: string,
    before: Owner,
    after: Owner,
  ) => {
    for (const locale of ["en", "es", "ar"] as const)
      for (const field of [
        "name",
        "description",
        "variantLabel",
        "sizeLabel",
      ] as const)
        add(
          kind,
          target,
          `${field} · ${locale.toUpperCase()}`,
          before.translations[locale][field] ?? null,
          after.translations[locale][field] ?? null,
        );
    const images = (o: Owner) =>
      [...o.media]
        .sort((x, y) => x.role.localeCompare(y.role) * -1 || x.order - y.order)
        .map((m) => `${m.role}: ${m.assetId}`)
        .join(", ") || null;
    add(kind, target, "media", images(before), images(after));
  };
  const oldProducts = byId(live.foundation.products);
  for (const p of next.foundation.products) {
    const o = oldProducts.get(p.id);
    if (!o) {
      changes.push({
        kind: "product",
        target: p.id,
        field: "created",
        before: null,
        after: p.name,
      });
      continue;
    }
    for (const field of [
      "name",
      "description",
      "slug",
      "familyId",
      "categoryId",
      "commercialState",
    ] as const)
      add("product", p.id, field, o[field], p[field]);
    addContent("product", p.id, o, p);
  }
  const oldVariants = new Map(
    live.foundation.variants.map((v) => [v.skuId, v]),
  );
  const oldCatalog = byId(live.catalog);
  const newCatalog = byId(next.catalog);
  for (const v of next.foundation.variants) {
    const o = oldVariants.get(v.skuId);
    const c = newCatalog.get(v.skuId);
    const oc = oldCatalog.get(v.skuId);
    if (!o) {
      changes.push({
        kind: "variant",
        target: v.skuId,
        field: "created",
        before: null,
        after: c ? `${c.name} · ${aed(c.priceFils)}` : v.skuId,
      });
      continue;
    }
    for (const field of [
      "flavor",
      "size",
      "packQuantity",
      "commercialState",
    ] as const)
      add("variant", v.skuId, field, o[field], v[field]);
    addContent("variant", v.skuId, o, v);
    if (c && oc) {
      if (c.priceFils !== oc.priceFils)
        changes.push({
          kind: "price",
          target: v.skuId,
          field: "price",
          before: aed(oc.priceFils),
          after: aed(c.priceFils),
        });
      add("availability", v.skuId, "active", oc.active, c.active);
      add(
        "availability",
        v.skuId,
        "availability",
        oc.availability ?? "available",
        c.availability ?? "available",
      );
      add("variant", v.skuId, "catalogName", oc.name, c.name);
    }
  }
  const oldFamilies = byId(live.foundation.families);
  for (const f of next.foundation.families)
    add(
      "family",
      f.id,
      oldFamilies.has(f.id) ? "changed" : "created",
      oldFamilies.get(f.id),
      f,
    );
  const oldAssets = byId(live.foundation.assets);
  for (const a of next.foundation.assets)
    add(
      "asset",
      a.id,
      oldAssets.has(a.id) ? "changed" : "created",
      oldAssets.get(a.id),
      a,
    );
  return changes;
}

/** Everything that would stop, or should be reviewed before, a publication. */
export function hubIssues(
  live: { foundation: HubMetadata; catalog: CatalogItem[] },
  next: { foundation: HubMetadata; catalog: CatalogItem[] },
): HubIssue[] {
  const issues: HubIssue[] = [];
  const error = (code: string, target: string, message: string) =>
    issues.push({ level: "error", code, target, message });
  const warn = (code: string, target: string, message: string) =>
    issues.push({ level: "warning", code, target, message });
  const nextSkus = new Map(next.catalog.map((c) => [c.id, c]));
  // Stable identity: a SKU that customers or orders may reference never disappears.
  for (const c of live.catalog)
    if (!nextSkus.has(c.id))
      error(
        "sku-removed",
        c.id,
        "An existing SKU cannot be deleted; deactivate it instead",
      );
  const liveOwner = new Map(
    live.foundation.variants.map((v) => [v.skuId, v.productId]),
  );
  for (const v of next.foundation.variants) {
    const owner = liveOwner.get(v.skuId);
    if (owner && owner !== v.productId)
      error(
        "sku-moved",
        v.skuId,
        "An existing SKU cannot move to another product",
      );
    const c = nextSkus.get(v.skuId);
    if (!c) continue;
    if (
      RETIRED_SKUS.has(v.skuId) &&
      (c.active || v.commercialState === "published")
    )
      error(
        "sku-retired",
        v.skuId,
        "This combination was removed from the approved menu and cannot be sold",
      );
    const before = live.catalog.find((x) => x.id === v.skuId);
    if (before && before.priceFils !== c.priceFils) {
      const ratio = c.priceFils / before.priceFils;
      if (ratio > 1.5 || ratio < 0.5)
        warn(
          "price-jump",
          v.skuId,
          `Price changes by more than 50% (${aed(before.priceFils)} → ${aed(c.priceFils)})`,
        );
    }
  }
  // Wording customers have never seen has no translation anywhere: the storefront
  // would show "translation pending". Nothing is ever translated automatically.
  const known = {
    flavor: new Set(live.foundation.variants.map((v) => v.flavor)),
    size: new Set(live.foundation.variants.map((v) => v.size)),
    name: new Set(live.catalog.map((c) => c.name)),
  };
  for (const v of next.foundation.variants) {
    if (v.commercialState !== "published") continue;
    const name = nextSkus.get(v.skuId)?.name;
    for (const locale of ["es", "ar"] as const) {
      const t = v.translations[locale];
      const missing = [
        v.flavor && !known.flavor.has(v.flavor) && !t.variantLabel
          ? "flavour"
          : null,
        v.size && !known.size.has(v.size) && !t.sizeLabel ? "size" : null,
        name && !known.name.has(name) && !t.name ? "name" : null,
      ].filter(Boolean);
      if (missing.length)
        warn(
          "translation-missing",
          v.skuId,
          `Missing ${locale.toUpperCase()} ${missing.join(", ")}`,
        );
    }
  }
  for (const p of next.foundation.products) {
    if (p.commercialState !== "published") continue;
    for (const locale of ["es", "ar"] as const)
      if (!p.translations[locale].name)
        warn(
          "translation-missing",
          p.id,
          `Missing ${locale.toUpperCase()} name`,
        );
    if (!p.media.some((m) => m.role === "primary"))
      warn("image-missing", p.id, "No primary image");
    const variants = next.foundation.variants.filter(
      (v) => v.productId === p.id && v.commercialState === "published",
    );
    if (!variants.length)
      error(
        "no-published-variant",
        p.id,
        "A published product needs at least one published variant",
      );
    else if (!variants.some((v) => nextSkus.get(v.skuId)?.active))
      warn(
        "no-active-variant",
        p.id,
        "Published, but every variant is inactive",
      );
  }
  // The same structural contract the public read model enforces.
  try {
    const metadata = foundationSchema
      .omit({ revision: true })
      .parse(next.foundation);
    const hash = revisionFingerprint(metadata, next.catalog);
    validateFoundation(
      {
        ...metadata,
        revision: {
          id: `catalog-v1-${hash}`,
          fingerprint: hash,
          publishedAt: null,
        },
      },
      next.catalog,
    );
  } catch (e) {
    error(
      "contract",
      "catalog",
      e instanceof z.ZodError
        ? `Invalid catalog data: ${e.issues[0]?.path.join(".")} ${e.issues[0]?.message}`
        : (e as Error).message,
    );
  }
  return issues;
}

/** Everything the operations UI needs; role decides what may be done with it. */
export function hubView(
  s: State,
  actor: Actor,
  flags: HubFlags,
  now = new Date(),
) {
  if (!["admin", "manager"].includes(actor.role))
    throw new DomainError(403, "Product Hub access is restricted");
  const permissions = {
    canEdit: flags.enabled && actor.role === "admin",
    canPublish: flags.publishEnabled && actor.role === "admin",
  };
  if (!flags.enabled || !s.catalogFoundation)
    return {
      flags,
      permissions: { canEdit: false, canPublish: false },
      available: false as const,
      reason: !flags.enabled
        ? "Product Hub is disabled in this environment"
        : "Catalog foundation has not been initialized",
    };
  const live = published(s);
  const h = s.productHub;
  const next = candidate(s);
  const commercial = new Map(next.catalog.map((c) => [c.id, c]));
  const liveProducts = new Set(live.foundation.products.map((p) => p.id));
  const changes = h?.draft ? hubChanges(live, next) : [];
  const touched = new Set(changes.map((c) => c.target));
  return {
    flags,
    permissions,
    available: true as const,
    version: h?.version ?? 0,
    published: live.revision,
    draft: h?.draft
      ? {
          baseRevisionId: h.draft.baseRevisionId,
          updatedAt: h.draft.updatedAt,
          updatedBy: h.draft.updatedBy,
          stale: h.draft.baseRevisionId !== live.revision.id,
        }
      : null,
    categories: next.foundation.categories.map((c) => ({
      id: c.id,
      name: c.name,
      translations: c.translations,
    })),
    families: next.foundation.families,
    products: [...next.foundation.products]
      .sort(
        (a, b) =>
          a.displayOrder - b.displayOrder || a.id.localeCompare(b.id, "en"),
      )
      .map((p) => {
        const variants = next.foundation.variants
          // A variant without a commercial record is reported as an issue, not shown as sellable.
          .filter((v) => v.productId === p.id && commercial.has(v.skuId))
          .map((v) => {
            const c = commercial.get(v.skuId)!;
            return {
              ...v,
              catalogName: c.name,
              priceFils: c.priceFils,
              active: c.active !== false,
              availability: c.availability ?? ("available" as const),
              retired: RETIRED_SKUS.has(v.skuId),
              inSeason: availableSku(v.skuId, now),
              existing: live.catalog.some((x) => x.id === v.skuId),
            };
          });
        return {
          ...p,
          variants,
          isNew: !liveProducts.has(p.id),
          changed:
            touched.has(p.id) || variants.some((v) => touched.has(v.skuId)),
        };
      }),
    assets: next.foundation.assets,
    // Errors always; warnings only for what this draft touches, so the review
    // is about the pending change and not about long-standing gaps.
    issues: h?.draft
      ? hubIssues(live, next).filter(
          (i) => i.level === "error" || touched.has(i.target),
        )
      : [],
    changes,
    history: (h?.history ?? []).slice(-30).reverse(),
  };
}

function applySaveProduct(
  s: State,
  draft: HubDraft,
  cmd: Extract<HubCommand, { type: "saveProduct" }>,
) {
  const live = published(s);
  const f = draft.foundation;
  const { product, variants } = cmd;
  const family = f.families.find((x) => x.id === product.familyId);
  if (!f.categories.some((c) => c.id === product.categoryId))
    throw new DomainError(422, "Unknown category");
  if (!family || family.categoryId !== product.categoryId)
    throw new DomainError(422, "The family does not belong to that category");
  const lower = (v: string) => v.toLowerCase();
  const existing = f.products.find((p) => p.id === product.id);
  if (!existing && f.products.some((p) => lower(p.id) === lower(product.id)))
    throw new DomainError(422, "A product with that identifier already exists");
  if (
    product.slug &&
    f.products.some(
      (p) =>
        p.id !== product.id && p.slug && lower(p.slug) === lower(product.slug!),
    )
  )
    throw new DomainError(422, "That slug is used by another product");
  // Stable identity: a published product keeps its id, slug and SKUs.
  const publishedProduct = live.foundation.products.find(
    (p) => p.id === product.id,
  );
  if (publishedProduct?.slug && publishedProduct.slug !== product.slug)
    throw new DomainError(422, "A published product's slug cannot change");
  const incoming = new Set(variants.map((v) => lower(v.skuId)));
  if (incoming.size !== variants.length)
    throw new DomainError(422, "Duplicate SKU in this product");
  for (const v of live.foundation.variants)
    if (v.productId === product.id && !incoming.has(lower(v.skuId)))
      throw new DomainError(
        422,
        "An existing SKU cannot be deleted; deactivate it instead",
      );
  for (const v of variants) {
    const elsewhere = f.variants.find(
      (x) => lower(x.skuId) === lower(v.skuId) && x.productId !== product.id,
    );
    if (elsewhere)
      throw new DomainError(422, "That SKU belongs to another product");
    if (
      !f.variants.some((x) => x.skuId === v.skuId) &&
      draft.catalog.some((c) => lower(c.id) === lower(v.skuId))
    )
      throw new DomainError(422, "That SKU identifier is already in use");
    if (family.pack && v.packQuantity === null)
      throw new DomainError(422, "Pack products need a pack quantity");
    if (
      RETIRED_SKUS.has(v.skuId) &&
      (v.active || v.commercialState === "published")
    )
      throw new DomainError(
        422,
        "This combination was removed from the approved menu and cannot be sold",
      );
    if (
      v.commercialState === "published" &&
      product.commercialState !== "published"
    )
      throw new DomainError(
        422,
        "A draft product cannot have published variants",
      );
  }
  if (product.commercialState === "published" && !product.slug)
    throw new DomainError(422, "A published product needs a slug");
  const assets = new Set(f.assets.map((a) => a.id));
  for (const owner of [product, ...variants]) {
    if (owner.media.some((m) => !assets.has(m.assetId)))
      throw new DomainError(422, "Unknown image reference");
    if (owner.media.filter((m) => m.role === "primary").length > 1)
      throw new DomainError(422, "Only one primary image is allowed");
    if (
      new Set(owner.media.map((m) => `${m.role}-${m.order}`)).size !==
      owner.media.length
    )
      throw new DomainError(422, "Two images share the same position");
  }
  const displayOrder =
    existing?.displayOrder ??
    Math.max(-1, ...f.products.map((p) => p.displayOrder)) + 1;
  const record = { ...product, displayOrder };
  if (existing) f.products[f.products.indexOf(existing)] = record;
  else f.products.push(record);
  // Draft-only SKUs dropped from this product disappear from the draft too.
  const dropped = f.variants.filter(
    (x) => x.productId === product.id && !incoming.has(lower(x.skuId)),
  );
  f.variants = f.variants.filter((x) => !dropped.includes(x));
  draft.catalog = draft.catalog.filter(
    (c) => !dropped.some((d) => d.skuId === c.id),
  );
  const categoryName = f.categories.find(
    (c) => c.id === product.categoryId,
  )!.name;
  for (const v of variants) {
    const { catalogName, priceFils, active, availability, ...variant } = v;
    const row = { ...variant, productId: product.id };
    const at = f.variants.findIndex((x) => x.skuId === v.skuId);
    if (at >= 0) f.variants[at] = row;
    else f.variants.push(row);
    const item = draft.catalog.find((c) => c.id === v.skuId);
    if (item)
      Object.assign(item, {
        name: catalogName,
        priceFils,
        active,
        availability,
      });
    else
      draft.catalog.push({
        id: v.skuId,
        name: catalogName,
        category: categoryName,
        description: catalogName,
        priceFils,
        active,
        availability,
      });
  }
  return `${existing ? "Edited" : "Created"} ${product.id} (${variants.length} variants)`;
}

/**
 * The single write entry point. Admin only; idempotent by key; rejected when
 * the caller's version is stale. Runs entirely inside one Store.write, so a
 * failure at any point leaves the database exactly as it was.
 */
export function hubCommand(
  store: Store,
  actor: Actor,
  key: string,
  raw: unknown,
  flags: HubFlags,
  now = new Date(),
) {
  if (actor.role !== "admin")
    throw new DomainError(403, "Only an administrator can change the catalog");
  if (!flags.enabled) throw new DomainError(404, "Not found");
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(key))
    throw new DomainError(400, "Idempotency-Key required");
  const cmd = hubCommandSchema.parse(raw);
  const hash = createHash("sha256")
    .update(JSON.stringify([actor.id, cmd]))
    .digest("hex");
  return store.write((s) => {
    const h = hub(s);
    const receipt = h.commands[key];
    if (receipt) {
      if (receipt.hash !== hash)
        throw new DomainError(
          409,
          "Idempotency key reused with different data",
        );
      return receipt.result;
    }
    if (cmd.expectedVersion !== h.version)
      throw new DomainError(
        409,
        "The catalog draft changed since you loaded it. Refresh and review before saving.",
      );
    const live = published(s);
    let summary: string;
    let action: HubHistoryEntry["action"];
    let result: Record<string, unknown> = {};
    const entry: Partial<HubHistoryEntry> = {};
    if (cmd.type === "publish") {
      if (!flags.publishEnabled)
        throw new DomainError(
          403,
          flags.publishBlocked ?? "Publication is disabled",
        );
      const draft = h.draft;
      if (!draft)
        throw new DomainError(409, "There are no draft changes to publish");
      if (
        draft.baseRevisionId !== live.revision.id ||
        cmd.expectedPublishedRevision !== live.revision.id
      )
        throw new DomainError(
          409,
          "The published catalog changed after this draft was started. Discard the draft and re-apply your changes.",
        );
      const next = { foundation: draft.foundation, catalog: draft.catalog };
      const blocking = hubIssues(live, next).filter((i) => i.level === "error");
      if (blocking.length)
        throw new DomainError(
          422,
          `Publication blocked: ${blocking[0]!.message}`,
        );
      const changes = hubChanges(live, next);
      if (!changes.length)
        throw new DomainError(409, "There are no draft changes to publish");
      const fingerprint = revisionFingerprint(draft.foundation, draft.catalog);
      const foundation = validateFoundation(
        {
          ...draft.foundation,
          revision: {
            id: `catalog-v1-${fingerprint}`,
            fingerprint,
            publishedAt: now.toISOString(),
          },
        },
        draft.catalog,
      );
      // The only place the published catalog changes. Orders and payments are untouched.
      s.catalog = draft.catalog;
      s.catalogFoundation = foundation;
      h.draft = undefined;
      action = "publish";
      summary = `Published ${changes.length} changes (${changes.filter((c) => c.kind === "price").length} prices)`;
      entry.fromRevision = live.revision.id;
      entry.toRevision = foundation.revision.id;
      result = { revision: foundation.revision.id, changes: changes.length };
      s.audit.push({
        at: now.toISOString(),
        actor: actor.id,
        action: `Product Hub: catalog published ${live.revision.id.slice(0, 22)} → ${foundation.revision.id.slice(0, 22)} (${changes.length} changes)`,
      });
    } else if (cmd.type === "discardDraft") {
      if (!h.draft) throw new DomainError(409, "There is no draft to discard");
      h.draft = undefined;
      action = "draft.discard";
      summary = "Discarded draft changes";
    } else {
      const draft = ensureDraft(s, actor, now);
      if (cmd.type === "saveProduct") {
        action = "draft.product";
        summary = applySaveProduct(s, draft, cmd);
      } else if (cmd.type === "saveFamily") {
        if (
          !draft.foundation.categories.some(
            (c) => c.id === cmd.family.categoryId,
          )
        )
          throw new DomainError(422, "Unknown category");
        const at = draft.foundation.families.findIndex(
          (x) => x.id === cmd.family.id,
        );
        const liveFamily = live.foundation.families.find(
          (x) => x.id === cmd.family.id,
        );
        if (
          liveFamily &&
          (liveFamily.categoryId !== cmd.family.categoryId ||
            liveFamily.pack !== cmd.family.pack)
        )
          throw new DomainError(
            422,
            "A published family keeps its category and pack setting",
          );
        if (at >= 0) draft.foundation.families[at] = cmd.family;
        else draft.foundation.families.push(cmd.family);
        action = "draft.family";
        summary = `${at >= 0 ? "Edited" : "Created"} family ${cmd.family.id}`;
      } else {
        const asset = draft.foundation.assets.find(
          (a) => a.id === cmd.asset.id,
        );
        if (!asset) throw new DomainError(404, "Image not found");
        asset.alt = cmd.asset.alt;
        action = "draft.asset";
        summary = `Edited image text ${cmd.asset.id}`;
      }
    }
    h.version += 1;
    result = { ...result, ok: true, version: h.version };
    h.history.push({
      at: now.toISOString(),
      actor: actor.id,
      action,
      summary,
      version: h.version,
      ...entry,
    });
    if (h.history.length > MAX_HISTORY)
      h.history.splice(0, h.history.length - MAX_HISTORY);
    h.commands[key] = { hash, result };
    const keys = Object.keys(h.commands);
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_RECEIPTS)))
      delete h.commands[old];
    return result;
  });
}

// ---- Media ----------------------------------------------------------------

export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const MIN_SIDE = 200;
const MAX_SIDE = 6000;
type ImageInfo = {
  type: "image/png" | "image/jpeg" | "image/webp" | "image/avif";
  ext: "png" | "jpg" | "webp" | "avif";
  width: number;
  height: number;
};
/**
 * Identify an upload from its own bytes; the declared type is never trusted.
 * Only PNG, JPEG, WebP and AVIF are accepted. SVG and anything scriptable is not.
 */
export function inspectImage(bytes: Buffer): ImageInfo {
  const bad = () => new DomainError(415, "Use a PNG, JPEG, WebP or AVIF image");
  if (bytes.length < 32) throw bad();
  let info: ImageInfo | null = null;
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    if (bytes.toString("latin1", 12, 16) !== "IHDR") throw bad();
    info = {
      type: "image/png",
      ext: "png",
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) throw bad();
      const marker = bytes[at + 1]!;
      const length = bytes.readUInt16BE(at + 2);
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker)
      ) {
        info = {
          type: "image/jpeg",
          ext: "jpg",
          height: bytes.readUInt16BE(at + 5),
          width: bytes.readUInt16BE(at + 7),
        };
        break;
      }
      if (length < 2) throw bad();
      at += 2 + length;
    }
  } else if (
    bytes.toString("latin1", 0, 4) === "RIFF" &&
    bytes.toString("latin1", 8, 12) === "WEBP"
  ) {
    const chunk = bytes.toString("latin1", 12, 16);
    if (chunk === "VP8X")
      info = {
        type: "image/webp",
        ext: "webp",
        width: 1 + bytes.readUIntLE(24, 3),
        height: 1 + bytes.readUIntLE(27, 3),
      };
    else if (chunk === "VP8 ")
      info = {
        type: "image/webp",
        ext: "webp",
        width: bytes.readUInt16LE(26) & 0x3fff,
        height: bytes.readUInt16LE(28) & 0x3fff,
      };
    else if (chunk === "VP8L") {
      const b = bytes.readUInt32LE(21);
      info = {
        type: "image/webp",
        ext: "webp",
        width: 1 + (b & 0x3fff),
        height: 1 + ((b >> 14) & 0x3fff),
      };
    }
  } else if (
    bytes.toString("latin1", 4, 8) === "ftyp" &&
    ["avif", "avis"].includes(bytes.toString("latin1", 8, 12))
  ) {
    const ispe = bytes.indexOf("ispe", 0, "latin1");
    if (ispe > 0 && ispe + 16 <= bytes.length)
      info = {
        type: "image/avif",
        ext: "avif",
        width: bytes.readUInt32BE(ispe + 8),
        height: bytes.readUInt32BE(ispe + 12),
      };
  }
  if (!info) throw bad();
  if (
    info.width < MIN_SIDE ||
    info.height < MIN_SIDE ||
    info.width > MAX_SIDE ||
    info.height > MAX_SIDE
  )
    throw new DomainError(
      422,
      `Image must be between ${MIN_SIDE} and ${MAX_SIDE} pixels on each side`,
    );
  return info;
}
const uploadMeta = z
  .object({ expectedVersion, alt: translationsSchema })
  .strict();
/**
 * Store an uploaded image and add it to the draft as a new asset.
 * Bytes are content-addressed (the SHA-256 is the file name and the asset
 * version), so a changed image is always a new URL and caches never go stale.
 */
export function hubUpload(
  store: Store,
  actor: Actor,
  key: string,
  bytes: Buffer,
  declaredType: string,
  rawMeta: unknown,
  flags: HubFlags,
  now = new Date(),
) {
  if (actor.role !== "admin")
    throw new DomainError(403, "Only an administrator can change the catalog");
  if (!flags.enabled) throw new DomainError(404, "Not found");
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(key))
    throw new DomainError(400, "Idempotency-Key required");
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES)
    throw new DomainError(413, "Image is larger than 3 MB");
  const meta = uploadMeta.parse(rawMeta);
  const info = inspectImage(bytes);
  if (declaredType.split(";")[0]!.trim().toLowerCase() !== info.type)
    throw new DomainError(415, "The file does not match its declared type");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const hash = createHash("sha256")
    .update(JSON.stringify([actor.id, sha, meta]))
    .digest("hex");
  const assetId = `hub-${sha.slice(0, 24)}`;
  return store.write((s) => {
    const h = hub(s);
    const receipt = h.commands[key];
    if (receipt) {
      if (receipt.hash !== hash)
        throw new DomainError(
          409,
          "Idempotency key reused with different data",
        );
      return receipt.result;
    }
    if (meta.expectedVersion !== h.version)
      throw new DomainError(
        409,
        "The catalog draft changed since you loaded it. Refresh and review before saving.",
      );
    const draft = ensureDraft(s, actor, now);
    if (draft.foundation.assets.some((a) => a.id === assetId))
      throw new DomainError(409, "This image is already in the library");
    // Same transaction as the draft write: both land or neither does.
    store.putMedia({
      sha256: sha,
      contentType: info.type,
      bytes,
      width: info.width,
      height: info.height,
      createdAt: now.toISOString(),
      createdBy: actor.id,
    });
    draft.foundation.assets.push({
      id: assetId,
      version: sha,
      alt: meta.alt,
      derivatives: [
        {
          src: `${HUB_MEDIA_PREFIX}${sha}.${info.ext}`,
          format:
            info.ext === "webp"
              ? "webp"
              : info.ext === "avif"
                ? "avif"
                : "legacy",
          width: info.width,
          height: info.height,
        },
      ],
    });
    h.version += 1;
    const result = { ok: true, version: h.version, assetId };
    h.history.push({
      at: now.toISOString(),
      actor: actor.id,
      action: "draft.media",
      summary: `Uploaded image ${assetId} (${info.width}×${info.height})`,
      version: h.version,
    });
    h.commands[key] = { hash, result };
    return result;
  });
}
/**
 * Who may fetch an uploaded image: anyone once a published asset references
 * it; otherwise only signed-in catalog staff previewing a draft.
 */
export function hubMediaAccess(s: State, sha: string, actor: Actor | null) {
  const src = (a: CatalogFoundation["assets"][number]) =>
    a.derivatives.some((d) => d.src.startsWith(`${HUB_MEDIA_PREFIX}${sha}.`));
  if (s.catalogFoundation?.assets.some(src)) return "public" as const;
  if (
    actor &&
    ["admin", "manager"].includes(actor.role) &&
    s.productHub?.draft?.foundation.assets.some(src)
  )
    return "private" as const;
  return null;
}
