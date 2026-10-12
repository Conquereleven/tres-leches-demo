import { createHash } from "node:crypto";
import { z } from "zod";
import type { CatalogItem } from "../domain/model";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,149}$/);
const text = z.string().trim().min(1).max(2000);
const content = z
  .object({
    name: text.nullable(),
    description: text.nullable(),
    variantLabel: text.nullable(),
    /** Variants only: the size wording in this language. Optional: older revisions lack it. */
    sizeLabel: text.nullable().optional(),
  })
  .strict();
export const translationsSchema = z
  .object({ en: content, es: content, ar: content })
  .strict();
const status = z.enum(["draft", "published", "archived"]);
const publicPath = z
  .string()
  .max(1000)
  .regex(/^\/brand\/[A-Za-z0-9_./%\-\u0080-\uffff ]+$/)
  .refine((v) => {
    try {
      const decoded = decodeURIComponent(v);
      return (
        !decoded.includes("..") &&
        !decoded.includes("//") &&
        !decoded.includes("\\") &&
        !decoded.includes("%")
      );
    } catch {
      return false;
    }
  }, "Invalid asset path");
const mediaLink = z
  .object({
    assetId: id,
    role: z.enum(["primary", "gallery"]),
    order: z.number().int().min(0),
  })
  .strict();
export const foundationSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z
      .object({
        id: z.string().regex(/^catalog-v1-[a-f0-9]{64}$/),
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        publishedAt: z.iso.datetime().nullable(),
      })
      .strict(),
    categories: z
      .array(
        z
          .object({
            id,
            name: text,
            image: publicPath.nullable(),
            media: z.array(mediaLink).max(50),
            displayOrder: z.number().int().min(0),
            translations: translationsSchema,
          })
          .strict(),
      )
      .max(100),
    families: z
      .array(
        z
          .object({
            id,
            categoryId: id,
            name: text,
            pack: z.boolean(),
            advanceOrder: z.boolean(),
          })
          .strict(),
      )
      .max(10000),
    products: z
      .array(
        z
          .object({
            id,
            slug: id.nullable(),
            familyId: id.nullable(),
            categoryId: id.nullable(),
            name: text,
            description: text.nullable(),
            commercialState: status,
            displayOrder: z.number().int().min(0),
            translations: translationsSchema,
            media: z.array(mediaLink).max(50),
          })
          .strict(),
      )
      .max(10000),
    // Prices and availability live ONLY in state.catalog. This is a relational read model.
    variants: z
      .array(
        z
          .object({
            skuId: id,
            productId: id,
            flavor: text.nullable(),
            size: text.nullable(),
            packQuantity: z.number().int().positive().max(1000).nullable(),
            commercialState: status,
            translations: translationsSchema,
            media: z.array(mediaLink).max(50),
          })
          .strict(),
      )
      .max(10000),
    assets: z
      .array(
        z
          .object({
            id,
            version: z.string().regex(/^[a-f0-9]{64}$/),
            alt: translationsSchema,
            derivatives: z
              .array(
                z
                  .object({
                    src: publicPath,
                    format: z.enum(["avif", "webp", "legacy"]),
                    width: z.number().int().positive().nullable(),
                    height: z.number().int().positive().nullable(),
                  })
                  .strict(),
              )
              .min(1)
              .max(30),
          })
          .strict(),
      )
      .max(10000),
  })
  .strict();
export type CatalogFoundation = z.infer<typeof foundationSchema>;
export function stableCatalogJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(stableCatalogJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableCatalogJson(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export const catalogDigest = (value: unknown) =>
  createHash("sha256").update(stableCatalogJson(value)).digest("hex");
export function revisionFingerprint(
  foundation: Omit<CatalogFoundation, "revision">,
  catalog: CatalogItem[],
) {
  return catalogDigest({
    foundation,
    catalog: [...catalog].sort((a, b) => a.id.localeCompare(b.id, "en")),
  });
}
export function validateFoundation(
  raw: unknown,
  catalog: CatalogItem[],
): CatalogFoundation {
  const f = foundationSchema.parse(raw);
  const unique = (values: string[], label: string) => {
    if (new Set(values.map((v) => v.toLowerCase())).size !== values.length)
      throw new Error(`Duplicate ${label}`);
  };
  unique(
    catalog.map((c) => c.id),
    "SKU",
  );
  for (const c of catalog)
    if (
      !Number.isSafeInteger(c.priceFils) ||
      c.priceFils <= 0 ||
      typeof c.active !== "boolean" ||
      !["available", "unavailable", undefined].includes(c.availability)
    )
      throw new Error("Invalid commercial record");
  for (const key of ["products", "categories", "families", "assets"] as const)
    unique(
      f[key].map((x) => x.id),
      key,
    );
  unique(
    f.products.flatMap((p) => (p.slug ? [p.slug] : [])),
    "slug",
  );
  unique(
    f.variants.map((v) => v.skuId),
    "variant SKU",
  );
  const categories = new Set(f.categories.map((c) => c.id)),
    families = new Map(f.families.map((x) => [x.id, x])),
    products = new Map(f.products.map((p) => [p.id, p])),
    assets = new Set(f.assets.map((a) => a.id)),
    skus = new Set(catalog.map((c) => c.id));
  for (const family of f.families)
    if (!categories.has(family.categoryId))
      throw new Error("Missing family category");
  for (const p of f.products) {
    if (p.categoryId && !categories.has(p.categoryId))
      throw new Error("Missing category");
    if (p.familyId && families.get(p.familyId)?.categoryId !== p.categoryId)
      throw new Error("Missing or inconsistent family");
    if (
      p.commercialState === "published" &&
      (!p.slug || !p.familyId || !p.categoryId)
    )
      throw new Error("Published product lacks relationships");
    if (!f.variants.some((v) => v.productId === p.id))
      throw new Error("Product lacks variants");
  }
  for (const v of f.variants) {
    if (!products.has(v.productId) || !skus.has(v.skuId))
      throw new Error("Missing variant reference");
    if (
      v.commercialState === "published" &&
      products.get(v.productId)?.commercialState !== "published"
    )
      throw new Error("Published variant has unpublished parent");
    if (
      families.get(products.get(v.productId)!.familyId ?? "")?.pack &&
      v.packQuantity === null
    )
      throw new Error("Missing pack quantity");
  }
  if (f.variants.length !== catalog.length)
    throw new Error("Unrepresented commercial SKU");
  for (const owner of [...f.categories, ...f.products, ...f.variants]) {
    const links = owner.media;
    unique(
      links.map((m) => `${m.role}-${m.order}`),
      "media position",
    );
    if (
      links.filter((m) => m.role === "primary").length > 1 ||
      links.some((m) => !assets.has(m.assetId))
    )
      throw new Error("Invalid media reference");
  }
  const { revision, ...metadata } = f;
  const hash = revisionFingerprint(metadata, catalog);
  if (revision.fingerprint !== hash || revision.id !== `catalog-v1-${hash}`)
    throw new Error("Catalog revision mismatch");
  return f;
}
/**
 * Commercial tools that change `State.catalog` directly call this in the same
 * transaction, so an initialized foundation never points at a stale catalog.
 * Structure it cannot represent (added or removed SKUs) is refused, not guessed.
 */
export function rebaseFoundation(
  s: {
    catalog?: CatalogItem[];
    catalogFoundation?: CatalogFoundation;
    productHub?: { draft?: unknown };
  },
  at: string,
) {
  if (!s.catalogFoundation) return;
  if (s.productHub?.draft)
    throw new Error(
      "A Product Hub draft is open; publish or discard it before changing the catalog directly",
    );
  const { revision: _revision, ...metadata } = s.catalogFoundation;
  const hash = revisionFingerprint(metadata, s.catalog ?? []);
  if (hash === s.catalogFoundation.revision.fingerprint) return;
  s.catalogFoundation = {
    ...metadata,
    revision: { id: `catalog-v1-${hash}`, fingerprint: hash, publishedAt: at },
  };
  validateFoundation(s.catalogFoundation, s.catalog ?? []);
}
