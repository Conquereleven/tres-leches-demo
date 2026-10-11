import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import type { State } from "../domain/model";
import { DomainError } from "../domain/model";
import { availableSku } from "../../shared/commerce-policy";
import { catalogDigest, validateFoundation } from "./contract";

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,149}$/);
export const catalogQuerySchema = z
  .object({
    locale: z.enum(["en", "es", "ar"]).default("en"),
    category: identifier.optional(),
    slug: identifier.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .strict();
export function publicCatalog(
  state: State,
  query: unknown,
  productId?: string,
  now = new Date(),
) {
  const q = catalogQuerySchema.parse(query);
  if (productId) identifier.parse(productId);
  if (!state.catalogFoundation)
    throw new DomainError(503, "Catalog foundation unavailable");
  const f = validateFoundation(state.catalogFoundation, state.catalog ?? []);
  const commercial = new Map((state.catalog ?? []).map((c) => [c.id, c]));
  const filtered = f.products
    .filter(
      (p) =>
        p.commercialState === "published" &&
        (!q.category || p.categoryId === q.category) &&
        (!q.slug || p.slug === q.slug) &&
        (!productId || p.id === productId),
    )
    .sort(
      (a, b) =>
        a.displayOrder - b.displayOrder || a.id.localeCompare(b.id, "en"),
    );
  if ((productId || q.slug) && filtered.length !== 1)
    throw new DomainError(404, "Product not found");
  const products = filtered.slice(q.offset, q.offset + q.limit).map((p) => ({
    id: p.id,
    slug: p.slug,
    familyId: p.familyId,
    categoryId: p.categoryId,
    displayOrder: p.displayOrder,
    content: p.translations[q.locale],
    media: p.media,
    variants: f.variants
      .filter((v) => v.productId === p.id && v.commercialState === "published")
      .map((v) => {
        const c = commercial.get(v.skuId)!;
        return {
          skuId: v.skuId,
          flavor: v.flavor,
          size: v.size,
          packQuantity: v.packQuantity,
          content: v.translations[q.locale],
          media: v.media,
          priceFils: c.priceFils,
          currency: "AED",
          available:
            c.active &&
            c.availability !== "unavailable" &&
            availableSku(c.id, now),
        };
      }),
  }));
  const productCategories = new Set(products.map((p) => p.categoryId));
  const familyIds = new Set(products.map((p) => p.familyId));
  const assetIds = new Set([
    ...f.categories
      .filter((c) => productCategories.has(c.id))
      .flatMap((c) => c.media.map((m) => m.assetId)),
    ...products.flatMap((p) =>
      [...p.media, ...p.variants.flatMap((v) => v.media)].map((m) => m.assetId),
    ),
  ]);
  return {
    schemaVersion: f.schemaVersion,
    revision: f.revision,
    locale: q.locale,
    total: filtered.length,
    offset: q.offset,
    limit: q.limit,
    categories: f.categories
      .filter((c) => productCategories.has(c.id))
      .map((c) => ({
        id: c.id,
        image: c.image,
        media: c.media,
        displayOrder: c.displayOrder,
        content: c.translations[q.locale],
      })),
    families: f.families
      .filter((x) => familyIds.has(x.id))
      .map((x) => ({
        id: x.id,
        categoryId: x.categoryId,
        pack: x.pack,
        advanceOrder: x.advanceOrder,
      })),
    products,
    assets: f.assets
      .filter((a) => assetIds.has(a.id))
      .map((a) => ({
        id: a.id,
        version: a.version,
        alt: a.alt[q.locale].name,
        derivatives: a.derivatives,
      })),
  };
}
/** Disabled by default and prohibited in Production until the frozen-checkout gate. */
export function catalogReadEnabled(env: NodeJS.ProcessEnv) {
  return (
    env.CATALOG_READ_API_ENABLED === "true" &&
    env.NODE_ENV !== "production" &&
    ["test", "development", "staging"].includes(env.APP_ENV ?? "")
  );
}
export function serveCatalogRead(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  state: () => State,
  enabled: boolean,
) {
  if (
    url.pathname !== "/api/catalog" &&
    !url.pathname.startsWith("/api/catalog/")
  )
    return false;
  if (!enabled || req.method !== "GET") throw new DomainError(404, "Not found");
  const match = /^\/api\/catalog\/products\/([A-Za-z0-9_-]+)$/.exec(
    url.pathname,
  );
  if (url.pathname !== "/api/catalog" && !match)
    throw new DomainError(404, "Not found");
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (key in query) throw new DomainError(400, "Duplicate catalog query");
    query[key] = value;
  }
  const parsedQuery = catalogQuerySchema.safeParse(query);
  if (!parsedQuery.success) throw new DomainError(400, "Invalid catalog query");
  let body;
  try {
    body = publicCatalog(state(), parsedQuery.data, match?.[1]);
  } catch (e) {
    if (e instanceof DomainError) throw e;
    throw new DomainError(503, "Catalog revision unavailable");
  }
  const etag = `"${catalogDigest(body)}"`;
  res.setHeader("Cache-Control", "no-cache, max-age=0, must-revalidate");
  res.setHeader("ETag", etag);
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304);
    res.end();
    return true;
  }
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
  return true;
}
