/**
 * Customer order reminder, built only from immutable accepted order data.
 *
 * Never consult live catalog, availability, pricing or Product Hub when
 * describing an order that was previously paid.
 */
import { packSpec, validPackSnapshot } from "../../shared/pack-composition";
import { tricolorSpec } from "../../shared/tricolor";
import type { Order } from "./model";
import names from "../../src/commerce/ops-product-names.json";

export type CustomerEmailItem = {
  name: string;
  quantity: number;
  /** Frozen preparation choices, with counts per box when relevant. */
  components: Array<{ name: string; units: number }>;
  boxCapacity?: number;
  /** True only if we know from the accepted order that the line is a box. */
  isBox: boolean;
  /** Do not invent unavailable historical selections. */
  contentsUnavailable: boolean;
};

export function customerEmailItems(order: Order): CustomerEmailItem[] {
  const dictionary = names as Record<string, { source: string; en: string }>;
  return order.lines
    .filter((line) => Number.isSafeInteger(line.quantity) && line.quantity > 0)
    .map((line) => {
      // A paid order's own frozen catalog is authoritative, not the current menu.
      const matches =
        order.catalogSnapshot?.filter((p) => p.id === line.productId) ?? [];
      const product =
        matches.length === 1 && matches[0]?.name?.trim()
          ? matches[0]
          : undefined;
      const translation = Object.hasOwn(dictionary, line.productId)
        ? dictionary[line.productId]
        : undefined;
      const name =
        product && translation && [translation.source, translation.en].includes(product.name)
          ? translation.en
          : product?.name?.trim() || "Product details unavailable";
      const spec = tricolorSpec(line.productId);
      const isBox =
        spec?.kind === "fixed" ||
        Boolean(packSpec(line.productId)) ||
        Boolean(line.composition) ||
        Boolean(line.packSnapshot && line.packSnapshot.capacity > 1);
      const snapshotValid = validPackSnapshot(line);
      const accepted = line.packSnapshot && snapshotValid ? line.packSnapshot : undefined;
      const components = accepted?.components.map((c) => ({
        name: c.names?.en?.trim() || c.name.trim(),
        units: c.units,
      })) ?? [];
      // Legacy Tricolor singles with no frozen colour have no such detail.
      const contentsUnavailable = isBox && !accepted;
      return {
        name,
        quantity: line.quantity,
        components,
        ...(isBox && accepted ? { boxCapacity: accepted.capacity } : {}),
        isBox,
        contentsUnavailable,
      };
    });
}

export function customerEmailItemsText(items: CustomerEmailItem[]) {
  if (!items.length) return ["ORDER SUMMARY", "Item details unavailable in this email."];
  const text = ["ORDER SUMMARY"];
  for (const item of items) {
    text.push(`- ${item.quantity} × ${item.name}`);
    if (item.isBox && item.boxCapacity !== undefined) {
      text.push(
        `  Each box (${item.boxCapacity} pieces):`,
        ...item.components.map((c) => `    - ${c.units} × ${c.name}`),
        `  Total: ${item.boxCapacity * item.quantity} pieces in ${item.quantity} ${item.quantity === 1 ? "box" : "boxes"}`,
      );
    } else if (item.contentsUnavailable) {
      text.push("  Box composition unavailable in this email.");
    } else if (item.components.length === 1) {
      text.push(`  Selection: ${item.components[0]!.name}`);
    }
  }
  return text;
}
