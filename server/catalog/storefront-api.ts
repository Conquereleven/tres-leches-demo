import type { IncomingMessage, ServerResponse } from "node:http";
import type { State } from "../domain/model";
import { DomainError } from "../domain/model";
import { RETIRED_SKUS, availableSku } from "../../shared/commerce-policy";
import { catalogDigest, validateFoundation } from "./contract";

/**
 * Public storefront catalog: the published revision, whole, in the three customer
 * languages. Reads `State.catalog` (prices, availability) and `State.catalogFoundation`
 * only. It never touches a Product Hub draft and exposes no administrative field.
 */
export const STOREFRONT_CATALOG_PATH = "/api/storefront/catalog";
const PRODUCTION_ACTIVATION = "founder-approved";

export type StorefrontMode = "off" | "on";
/**
 * Off unless explicitly enabled. Production additionally needs the activation
 * contract: a second, deliberate variable recorded with the founder's approval.
 * Unknown environments are treated as Production.
 */
export function storefrontCatalogMode(env: NodeJS.ProcessEnv): StorefrontMode {
  if (env.STOREFRONT_DYNAMIC_CATALOG_ENABLED !== "true") return "off";
  const production = !["test", "development", "staging"].includes(
    env.APP_ENV ?? "",
  );
  if (
    production &&
    env.STOREFRONT_DYNAMIC_CATALOG_PRODUCTION !== PRODUCTION_ACTIVATION
  )
    return "off";
  return "on";
}

/** What checkout may rely on: with adoption on, only a valid published revision sells. */
export function publishedRevision(state: State, mode: StorefrontMode) {
  if (mode === "off")
    return { dynamic: false, sellable: true, revision: null as string | null };
  try {
    if (!state.catalogFoundation) throw new Error("absent");
    const f = validateFoundation(state.catalogFoundation, state.catalog ?? []);
    return { dynamic: true, sellable: true, revision: f.revision.id };
  } catch {
    return { dynamic: true, sellable: false, revision: null };
  }
}
export function storefrontCatalog(state: State, now = new Date()) {
  if (!state.catalogFoundation)
    throw new DomainError(503, "Catalog revision unavailable");
  const f = validateFoundation(state.catalogFoundation, state.catalog ?? []);
  const commercial = new Map((state.catalog ?? []).map((c) => [c.id, c]));
  const families = new Map(f.families.map((x) => [x.id, x]));
  const products = f.products
    .filter(
      (p) =>
        p.commercialState === "published" &&
        p.slug &&
        p.familyId &&
        p.categoryId,
    )
    .sort(
      (a, b) =>
        a.displayOrder - b.displayOrder || a.id.localeCompare(b.id, "en"),
    )
    .map((p) => ({
      id: p.id,
      slug: p.slug!,
      familyId: p.familyId!,
      categoryId: p.categoryId!,
      content: p.translations,
      media: p.media,
      options: f.variants
        .filter(
          (v) =>
            v.productId === p.id &&
            v.commercialState === "published" &&
            !RETIRED_SKUS.has(v.skuId) &&
            commercial.get(v.skuId)?.active === true,
        )
        .map((v) => {
          const c = commercial.get(v.skuId)!;
          return {
            id: v.skuId,
            name: c.name,
            flavor: v.flavor,
            size: v.size,
            packQuantity: v.packQuantity,
            content: v.translations,
            media: v.media,
            priceFils: c.priceFils,
            // Seasonal rules are re-applied by the client clock and by checkout.
            available:
              c.availability !== "unavailable" && availableSku(c.id, now),
            orderable: c.availability !== "unavailable",
          };
        }),
    }))
    // A product whose every variant was deactivated is not shown at all.
    .filter((p) => p.options.length > 0);
  const usedFamilies = new Set(products.map((p) => p.familyId));
  const usedCategories = new Set(products.map((p) => p.categoryId));
  const assetIds = new Set([
    ...f.categories.flatMap((c) => c.media.map((m) => m.assetId)),
    ...products.flatMap((p) =>
      [...p.media, ...p.options.flatMap((o) => o.media)].map((m) => m.assetId),
    ),
  ]);
  return {
    schemaVersion: 1 as const,
    revision: f.revision.id,
    publishedAt: f.revision.publishedAt,
    currency: "AED" as const,
    categories: f.categories
      .filter((c) => usedCategories.has(c.id))
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((c) => ({
        id: c.id,
        name: c.name,
        image: c.image,
        media: c.media,
        content: c.translations,
      })),
    families: [...usedFamilies].map((id) => {
      const x = families.get(id)!;
      return {
        id: x.id,
        categoryId: x.categoryId,
        name: x.name,
        pack: x.pack,
        advanceOrder: x.advanceOrder,
      };
    }),
    products,
    assets: f.assets
      .filter((a) => assetIds.has(a.id))
      .map((a) => ({
        id: a.id,
        version: a.version,
        alt: a.alt,
        derivatives: a.derivatives,
      })),
  };
}
export type StorefrontCatalog = ReturnType<typeof storefrontCatalog>;

export function serveStorefrontCatalog(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  state: () => State,
  mode: StorefrontMode,
) {
  if (path !== STOREFRONT_CATALOG_PATH) return false;
  res.setHeader("X-Content-Type-Options", "nosniff");
  // 404 is the contract for "this site ships its catalog with the build".
  if (mode === "off" || !["GET", "HEAD"].includes(req.method ?? ""))
    throw new DomainError(404, "Not found");
  res.setHeader("Cache-Control", "no-cache, max-age=0, must-revalidate");
  let body;
  try {
    body = storefrontCatalog(state());
  } catch {
    // Adoption is on and there is no valid revision: say so, never fall back.
    res.setHeader("Retry-After", "30");
    throw new DomainError(503, "Catalog revision unavailable");
  }
  // The revision names the publication; the digest also covers seasonal availability.
  const etag = `"${body.revision.slice(-16)}-${catalogDigest(body).slice(0, 16)}"`;
  res.setHeader("ETag", etag);
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304);
    res.end();
    return true;
  }
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(req.method === "HEAD" ? undefined : JSON.stringify(body));
  return true;
}
