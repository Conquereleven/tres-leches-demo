import {
  acceptedLinePrice,
  premiumComponent,
  calculatePackPrice,
  type PackPricingPolicy,
} from "../../shared/pack-pricing";
import {
  PACK_SPECS,
  packSpec,
  type CommerceLine,
} from "../../shared/pack-composition";
import { requireThat, type CatalogItem } from "./model";
export const premiumPricingEnabled = (env = process.env) =>
  env.PAN_PACK_PREMIUM_PRICING_ENABLED === "true";
/** Published catalog is authoritative for Pistachio, bounded by this approved release policy. */
export function packPricingPolicy(
  products: CatalogItem[],
): PackPricingPolicy | null {
  if (!premiumPricingEnabled()) return null;
  const charges: Record<string, number> = {};
  for (const spec of PACK_SPECS)
    for (const c of spec.components) {
      if (c.componentSkuId.endsWith("-chocolate-covering"))
        charges[c.componentSkuId] = spec.size === "mini" ? 500 : 600;
      if (/^pan-de-muerto-filled-pistachio-/.test(c.componentSkuId)) {
        const p = products.filter((p) => p.id === c.componentSkuId),
          expected = spec.size === "mini" ? 2300 : 2600;
        requireThat(
          p.length === 1 && p[0]!.priceFils === expected,
          "Published Pistachio premium price conflicts with approved policy",
          503,
        );
        charges[c.componentSkuId] = p[0]!.priceFils;
      }
    }
  return { version: "pan-premium-v1", charges };
}
export function liveLinePrice(line: CommerceLine, products: CatalogItem[]) {
  const base = products.find((p) => p.id === line.productId)?.priceFils ?? 0;
  const policy = packPricingPolicy(products);
  if (
    !policy ||
    !line.productId.startsWith("pan-de-muerto-") ||
    !packSpec(line.productId) ||
    !line.composition
  )
    return base;
  try {
    return calculatePackPrice(line, base, policy).unitPriceFils;
  } catch {
    requireThat(false, "Premium pack price unavailable; review required", 422);
  }
}

/** Legacy paid orders are immutable; only a first paid transition checks this rollout guard. */
export function acceptedPackPricesCurrent(
  state: import("./model").State,
  order: import("./model").Order,
) {
  if (!premiumPricingEnabled()) return true;
  try {
    return order.lines.every((line) => {
      if (
        !line.productId.startsWith("pan-de-muerto-") ||
        !packSpec(line.productId) ||
        !line.composition
      )
        return true;
      const product = order.catalogSnapshot?.find(
        (p) => p.id === line.productId,
      );
      if (!product) return false;
      const accepted = acceptedLinePrice(line, product.priceFils);
      // New-model accepted prices are immutable, including pending checkouts.
      if (line.priceSnapshot) return accepted !== null;
      if (!line.composition.some((c) => premiumComponent(c.componentSkuId)))
        return true;
      return (
        accepted !== null &&
        accepted === liveLinePrice(line, state.catalog ?? [])
      );
    });
  } catch {
    return false;
  }
}
