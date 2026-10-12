import { rebaseFoundation } from "../catalog/contract";
import { z } from "zod";
import type { CatalogItem } from "./model";
import type { Store } from "../db/store";
const item = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/),
    name: z.string().trim().min(1).max(150),
    category: z.string().trim().min(1).max(100),
    description: z.string().max(2000).optional(),
    priceAed: z.string().regex(/^(0|[1-9][0-9]{0,6})\.[0-9]{2}$/),
    active: z.boolean(),
    availability: z.enum(["available", "unavailable"]).default("available"),
    image: z.string().url().startsWith("https://").optional(),
    whatsappPrefill: z.string().max(1000).optional(),
  })
  .strict();
export const catalogImportSchema = z
  .object({ version: z.literal(1), items: z.array(item).max(10000) })
  .strict()
  .refine(
    (v) =>
      new Set(v.items.map((p) => p.id.toLowerCase())).size === v.items.length,
    "Duplicate SKU",
  );
export function validateCatalog(raw: unknown): CatalogItem[] {
  return catalogImportSchema.parse(raw).items.map(({ priceAed, ...p }) => {
    const [whole, cents] = priceAed.split(".");
    const priceFils = Number(whole) * 100 + Number(cents);
    if (!Number.isSafeInteger(priceFils) || priceFils <= 0)
      throw new Error("Price must be positive integer fils");
    return { ...p, priceFils };
  });
}
export async function importCatalog(
  store: Store,
  raw: unknown,
  apply: boolean,
  backupPath?: string,
) {
  const products = validateCatalog(raw);
  if (!apply) return { applied: false, count: products.length };
  if (!backupPath) throw new Error("Verified backup required");
  await store.backup(backupPath);
  store.write((s) => {
    s.catalog = products;
    rebaseFoundation(s, new Date().toISOString());
    s.audit.push({
      at: new Date().toISOString(),
      actor: "catalog-admin",
      action: `Approved catalog imported: ${products.length} items; backup created`,
    });
  });
  return { applied: true, count: products.length };
}
