/** Read-only, revision-bound Product Hub command plan. Never imports a whole catalog. */
import { catalogDigest } from "./contract";
import type { State } from "../domain/model";
import { hubView, type HubCommand } from "./product-hub";
import { tricolorSpec } from "../../shared/tricolor";
import type { BootstrapSources } from "./bootstrap";
import { planCatalogBootstrap } from "./bootstrap";

export function planTricolorCatalog(state: State, sources: BootstrapSources) {
  if (!state.catalogFoundation) throw new Error("Catalog Foundation required");
  if (state.productHub?.draft)
    throw new Error("Existing draft must be reviewed separately");
  const view = hubView(
    state,
    { id: "tricolor-plan", role: "admin" },
    { enabled: true, publishEnabled: true, publishBlocked: null },
  );
  if (!view.available) throw new Error("Product Hub unavailable");
  for (const [sku, price] of [
    ["conchas-traditional-tricolor-mini-40-g", 1100],
    ["conchas-traditional-tricolor-individual-70-g", 1300],
  ] as const) {
    const item = state.catalog!.find((c) => c.id === sku);
    if (
      !item ||
      item.priceFils !== price ||
      !item.active ||
      item.availability !== "available"
    )
      throw new Error(`Unexpected commercial record: ${sku}`);
  }
  const proposed = planCatalogBootstrap(sources.approved, sources).foundation;
  if (!proposed) throw new Error("Invalid proposed catalog sources");
  const commands: HubCommand[] = [];
  let expectedVersion = view.version;
  const family = proposed.families.find(
    (f) => f.id === "conchas-tricolor-pack",
  )!;
  const currentFamily = state.catalogFoundation.families.find(
    (f) => f.id === family.id,
  );
  if (currentFamily && JSON.stringify(currentFamily) !== JSON.stringify(family))
    throw new Error("Existing pack family differs; review required");
  if (!currentFamily)
    commands.push({
      type: "saveFamily",
      expectedVersion: expectedVersion++,
      family,
    });
  const pack = proposed.products.find((p) => p.id === family.id)!;
  const existingPack = view.products.find((p) => p.id === pack.id);
  const variants = proposed.variants
    .filter((v) => v.productId === pack.id)
    .map((v) => {
      const c = sources.approved.find((c) => c.id === v.skuId)!;
      const { productId: _id, ...meta } = v;
      const existing = state.catalog!.find((i) => i.id === v.skuId);
      if (
        existing &&
        (existing.name !== c.name ||
          existing.priceFils !== c.priceFils ||
          !existing.active ||
          existing.availability !== "available")
      )
        throw new Error(`Existing pack SKU conflict: ${v.skuId}`);
      return {
        ...meta,
        media: [],
        catalogName: c.name,
        priceFils: c.priceFils,
        active: c.active !== false,
        availability: c.availability ?? "available",
      };
    });
  if (
    existingPack &&
    (existingPack.variants.length !== 2 ||
      existingPack.variants.some(
        (v) =>
          !variants.some(
            (n) =>
              n.skuId === v.skuId &&
              n.priceFils === v.priceFils &&
              v.packQuantity === 3,
          ),
      ))
  )
    throw new Error("Existing pack product conflicts");
  if (!existingPack) {
    if (variants.some((v) => state.catalog!.some((c) => c.id === v.skuId)))
      throw new Error("Orphan pack SKU conflict");
    const { displayOrder: _order, ...product } = pack;
    commands.push({
      type: "saveProduct",
      expectedVersion: expectedVersion++,
      product: {
        ...product,
        familyId: family.id,
        categoryId: "conchas",
        media: [],
      },
      variants,
    });
  }
  // Clear only the known misleading authored image; preserve later uploaded replacements.
  const single = view.products.find(
    (p) => p.id === "conchas-traditional--tricolor",
  )!;
  if (
    !single ||
    single.variants.length !== 2 ||
    single.variants.some((v) => tricolorSpec(v.skuId)?.kind !== "single")
  )
    throw new Error("Unexpected Tricolor singles");
  const oldAsset = sources.assets.find(
    (a) =>
      a.sourceId === "3l-conchas-editorial-concha-tradicional-tricolor-mexico",
  );
  if (!oldAsset) throw new Error("Original image provenance missing");
  const misleadingId = `asset-${catalogDigest(oldAsset.sourceId)}`;
  const safeMedia = (media: typeof single.media) =>
    media.filter((m) => m.assetId !== misleadingId);
  const productMedia = safeMedia(single.media);
  const proposedSingle = proposed.products.find((p) => p.id === single.id)!;
  const names = (
    existing: typeof single.translations,
    approved: typeof single.translations,
  ) => ({
    en: { ...existing.en, name: approved.en.name },
    es: { ...existing.es, name: approved.es.name },
    ar: { ...existing.ar, name: approved.ar.name },
  });
  const productTranslations = names(
    single.translations,
    proposedSingle.translations,
  );
  const variantTranslations = (v: (typeof single.variants)[number]) =>
    names(
      v.translations,
      proposed.variants.find((n) => n.skuId === v.skuId)!.translations,
    );
  const translationsChanged =
    JSON.stringify(productTranslations) !==
      JSON.stringify(single.translations) ||
    single.variants.some(
      (v) =>
        JSON.stringify(variantTranslations(v)) !==
        JSON.stringify(v.translations),
    );
  if (
    translationsChanged ||
    single.media.length !== productMedia.length ||
    single.variants.some((v) => safeMedia(v.media).length !== v.media.length)
  ) {
    commands.push({
      type: "saveProduct",
      expectedVersion: expectedVersion++,
      product: {
        id: single.id,
        slug: single.slug,
        familyId: single.familyId!,
        categoryId: single.categoryId!,
        name: single.name,
        description: single.description,
        commercialState: single.commercialState,
        translations: productTranslations,
        media: productMedia,
      },
      variants: single.variants.map((v) => ({
        skuId: v.skuId,
        flavor: v.flavor,
        size: v.size,
        packQuantity: v.packQuantity,
        ...(v.operationsName !== undefined
          ? { operationsName: v.operationsName }
          : {}),
        commercialState: v.commercialState,
        translations: variantTranslations(v),
        media: safeMedia(v.media),
        catalogName: v.catalogName,
        priceFils: v.priceFils,
        active: v.active,
        availability: v.availability,
      })),
    });
  }
  return {
    expectedPublishedRevision: state.catalogFoundation.revision.id,
    expectedVersion: view.version,
    commands,
    publish: commands.length
      ? {
          type: "publish" as const,
          expectedVersion,
          expectedPublishedRevision: state.catalogFoundation.revision.id,
        }
      : null,
  };
}
