import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CatalogItem, State } from "../domain/model";
import type { Store } from "../db/store";
import { validateCatalog } from "../domain/catalog";
import {
  catalogDigest,
  revisionFingerprint,
  validateFoundation,
  type CatalogFoundation,
} from "./contract";

type Family = {
  id: string;
  category: string;
  name: string;
  pack: boolean;
  advanceOrder: boolean;
  image: string | null;
  options: { id: string; variant: string; size: string; priceFils: number }[];
};
type Product = {
  id: string;
  slug: string;
  familyId: string;
  title: string;
  variant: string;
  optionIds: string[];
};
type Asset = {
  sourceId: string;
  family: string | null;
  variant: string | null;
  size?: string | null;
  status: string;
  alt: string;
  derivatives: { src: string; format: string; width: number; height: number }[];
};
type Assignment = {
  productId: string;
  primarySourceId: string | null;
  gallerySourceIds: string[];
};
export type BootstrapSources = {
  approved: CatalogItem[];
  categories: { id: string; name: string; image?: string }[];
  editorial: { category: string; sourceIds: string[] }[];
  families: Family[];
  products: Product[];
  assets: Asset[];
  assignments: Assignment[];
  sourceIndex: Record<string, string>;
  locales: Record<"en" | "es" | "ar", Record<string, Record<string, string>>>;
};
/** Explicit tooling only. The HTTP server never reads bootstrap source files. */
export function loadBootstrapSources(root: string): BootstrapSources {
  const read = (path: string) =>
    JSON.parse(readFileSync(resolve(root, path), "utf8"));
  const menu = read("src/brand/menu-data.json");
  const manifests = [
    "official-pan-media",
    "media-manifest",
    "category-media",
  ].map((name) => read(`src/brand/${name}.json`));
  const locales = Object.fromEntries(
    ["en", "es", "ar"].map((locale) => [
      locale,
      Object.fromEntries(
        [
          "common",
          "navigation",
          "home",
          "menu",
          "product",
          "checkout",
          "policies",
        ].map((ns) => [ns, read(`src/brand/locales/${locale}/${ns}.json`)]),
      ),
    ]),
  ) as BootstrapSources["locales"];
  return {
    approved: validateCatalog(read("data-imports/liza-current-menu.json")),
    categories: menu.categories,
    editorial: manifests.flatMap((m) => m.editorial ?? []),
    families: menu.families,
    products: read("shared/storefront-products.json"),
    assets: manifests.flatMap((m) => m.assets),
    assignments: manifests.flatMap((m) => m.products ?? []),
    sourceIndex: read("src/brand/locales/source-index.json"),
    locales,
  };
}
export function planCatalogBootstrap(
  catalog: CatalogItem[],
  sources: BootstrapSources,
) {
  const blockers: string[] = [],
    review: string[] = [];
  const sku = new Map(catalog.map((c) => [c.id, c]));
  if (sku.size !== catalog.length) blockers.push("Duplicate authoritative SKU");
  if (catalog.length !== sources.approved.length)
    blockers.push("Authoritative/source SKU counts differ");
  for (const approved of sources.approved) {
    const current = sku.get(approved.id);
    if (
      !current ||
      current.priceFils !== approved.priceFils ||
      current.active !== approved.active ||
      current.availability !== approved.availability ||
      current.name !== approved.name ||
      current.category !== approved.category ||
      current.description !== approved.description
    )
      blockers.push(`Commercial source mismatch: ${approved.id}`);
  }
  const translate = (
    value: string | null,
    locale: "en" | "es" | "ar",
  ): string | null => {
    if (!value) return null;
    const key = sources.sourceIndex[value];
    const dot = key?.indexOf(":") ?? -1;
    const translated =
      dot > 0
        ? sources.locales[locale][key!.slice(0, dot)]?.[key!.slice(dot + 1)]
        : undefined;
    return translated ?? (locale === "en" ? value : null);
  };
  const translations = (
    name: string | null,
    description: string | null = null,
    variant: string | null = null,
  ) =>
    Object.fromEntries(
      ["en", "es", "ar"].map((locale) => [
        locale,
        {
          name: translate(name, locale as "en" | "es" | "ar"),
          description: translate(description, locale as "en" | "es" | "ar"),
          variantLabel: translate(variant, locale as "en" | "es" | "ar"),
        },
      ]),
    ) as CatalogFoundation["products"][number]["translations"];
  const families = new Map(sources.families.map((f) => [f.id, f]));
  const availableAssets = sources.assets.filter((a) => a.status === "assigned");
  const assets = new Map<string, CatalogFoundation["assets"][number]>();
  const assetLink = (
    asset: Asset,
    role: "primary" | "gallery",
    order: number,
  ) => {
    const id = `asset-${catalogDigest(asset.sourceId)}`;
    const derivatives = asset.derivatives.map((d) => ({
      src: d.src,
      format: d.format as "avif" | "webp",
      width: d.width,
      height: d.height,
    }));
    assets.set(id, {
      id,
      version: catalogDigest(derivatives),
      alt: translations(asset.alt),
      derivatives,
    });
    return { assetId: id, role, order };
  };
  const products: CatalogFoundation["products"] = [],
    variants: CatalogFoundation["variants"] = [];
  for (const [displayOrder, product] of sources.products.entries()) {
    const family = families.get(product.familyId);
    if (!family) {
      blockers.push(`Missing family: ${product.id}`);
      continue;
    }
    const opts = product.optionIds.map((id) =>
      family.options.find((o) => o.id === id),
    );
    if (opts.some((o) => !o || !sku.has(o.id))) {
      blockers.push(`Missing option: ${product.id}`);
      continue;
    }
    const active = product.optionIds.some((id) => sku.get(id)!.active);
    const assignment = sources.assignments.find(
      (a) => a.productId === product.id,
    );
    const primary =
      availableAssets.find((a) => a.sourceId === assignment?.primarySourceId) ??
      availableAssets.find(
        (a) =>
          a.family === family.id && a.variant === product.variant && !a.size,
      );
    const media: CatalogFoundation["products"][number]["media"] = primary
      ? [assetLink(primary, "primary", 0)]
      : [];
    for (const [order, sourceId] of (
      assignment?.gallerySourceIds ?? []
    ).entries()) {
      const a = availableAssets.find((a) => a.sourceId === sourceId);
      if (a) media.push(assetLink(a, "gallery", order));
      else blockers.push(`Missing gallery asset: ${product.id}`);
    }
    if (!primary && family.image) {
      const id = `asset-${catalogDigest(family.image)}`;
      const derivatives = [
        {
          src: family.image,
          format: "legacy" as const,
          width: null,
          height: null,
        },
      ];
      assets.set(id, {
        id,
        version: catalogDigest(derivatives),
        alt: translations(product.title),
        derivatives,
      });
      media.push({ assetId: id, role: "primary", order: 0 });
    }
    products.push({
      id: product.id,
      slug: product.slug,
      familyId: family.id,
      categoryId: family.category,
      name: product.title,
      description: null,
      commercialState: active ? "published" : "archived",
      displayOrder,
      translations: translations(product.title),
      media,
    });
    for (const option of opts) {
      const o = option!;
      if (o.priceFils !== sku.get(o.id)!.priceFils)
        blockers.push(`Menu price mismatch: ${o.id}`);
      const packQuantity = family.pack
        ? Number(o.size.match(/^([0-9]+)(?:\s|$)/)?.[1])
        : null;
      if (family.pack && !packQuantity)
        blockers.push(`Ambiguous pack quantity: ${o.id}`);
      const variantAsset =
        availableAssets.find(
          (a) =>
            a.sourceId === assignment?.primarySourceId &&
            (!a.size || a.size === o.size),
        ) ??
        availableAssets.find(
          (a) =>
            a.family === family.id &&
            a.variant === product.variant &&
            (!a.size || a.size === o.size),
        );
      variants.push({
        skuId: o.id,
        productId: product.id,
        flavor: o.variant || null,
        size: o.size || null,
        packQuantity,
        commercialState: sku.get(o.id)!.active ? "published" : "archived",
        translations: translations(
          sku.get(o.id)!.name,
          sku.get(o.id)!.description ?? null,
          o.variant || null,
        ),
        media: variantAsset
          ? [assetLink(variantAsset, "primary", 0)]
          : media.filter((m) => m.role === "primary"),
      });
    }
  }
  const represented = new Set(variants.map((v) => v.skuId));
  for (const c of [...catalog].sort((a, b) => a.id.localeCompare(b.id, "en")))
    if (!represented.has(c.id)) {
      if (c.active) blockers.push(`Active SKU lacks product mapping: ${c.id}`);
      const id = `legacy-${c.id}`;
      products.push({
        id,
        slug: null,
        familyId: null,
        categoryId: null,
        name: c.name,
        description: c.description ?? null,
        commercialState: "archived",
        displayOrder: products.length,
        translations: translations(c.name, c.description ?? null),
        media: [],
      });
      variants.push({
        skuId: c.id,
        productId: id,
        flavor: null,
        size: null,
        packQuantity: null,
        commercialState: "archived",
        translations: translations(c.name, c.description ?? null),
        media: [],
      });
      review.push(
        `Inactive legacy SKU has no public family/size mapping: ${c.id}`,
      );
    }
  const categories = sources.categories.map((c, displayOrder) => {
    const media = (
      sources.editorial.find((e) => e.category === c.id)?.sourceIds ?? []
    ).flatMap((sourceId, order) => {
      const a = availableAssets.find((a) => a.sourceId === sourceId);
      if (!a) {
        blockers.push(`Missing editorial asset: ${c.id}`);
        return [];
      }
      return [assetLink(a, "gallery", order)];
    });
    return {
      id: c.id,
      name: c.name,
      image: c.image ?? null,
      media,
      displayOrder,
      translations: translations(c.name),
    };
  });
  const metadata = {
    schemaVersion: 1 as const,
    categories,
    families: sources.families.map((f) => ({
      id: f.id,
      categoryId: f.category,
      name: f.name,
      pack: f.pack,
      advanceOrder: f.advanceOrder,
    })),
    products,
    variants,
    assets: [...assets.values()].sort((a, b) => a.id.localeCompare(b.id, "en")),
  };
  const hash = revisionFingerprint(metadata, catalog);
  const foundation = {
    ...metadata,
    revision: {
      id: `catalog-v1-${hash}`,
      fingerprint: hash,
      publishedAt: null,
    },
  };
  try {
    validateFoundation(foundation, catalog);
  } catch (e) {
    blockers.push(e instanceof Error ? e.message : "Invalid foundation");
  }
  const missingTranslations = products
    .filter((p) => !p.translations.es.name || !p.translations.ar.name)
    .map((p) => p.id);
  return {
    foundation,
    report: {
      valid: blockers.length === 0,
      skuCount: catalog.length,
      mappedSkuCount: represented.size,
      activeSkuCount: catalog.filter((c) => c.active).length,
      productCount: products.length,
      publicProductCount: products.filter(
        (p) => p.commercialState === "published",
      ).length,
      preservedPriceCount: sources.approved.filter(
        (a) => sku.get(a.id)?.priceFils === a.priceFils,
      ).length,
      blockers,
      review,
      missingTranslations,
      revision: foundation.revision.id,
    },
  };
}
export function applyCatalogBootstrap(store: Store, sources: BootstrapSources) {
  return store.write((s: State) => {
    const plan = planCatalogBootstrap(s.catalog ?? [], sources);
    if (!plan.report.valid)
      throw new Error("Bootstrap blocked; inspect dry-run report");
    if (s.catalogFoundation) {
      validateFoundation(s.catalogFoundation, s.catalog ?? []);
      if (catalogDigest(s.catalogFoundation) !== catalogDigest(plan.foundation))
        throw new Error(
          "Existing foundation differs; explicit migration required",
        );
      return { applied: false, ...plan.report };
    }
    s.catalogFoundation = plan.foundation;
    return { applied: true, ...plan.report };
  });
}
