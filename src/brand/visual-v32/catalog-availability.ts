import { withdrawnConchaSku } from "../../../shared/storefront-visibility";
import { availableSku } from "../../../shared/commerce-policy";
import type { CheckoutConfig } from "../cart";
import { liveOrderable } from "../live-catalog";
import type { Menu, MenuFamily } from "../menu";

export function purchasableOptions(
  family: MenuFamily,
  status: Menu["status"],
  config: CheckoutConfig | null,
  now: Date,
) {
  return family.options.filter(
    (option) =>
      !withdrawnConchaSku(option.id) &&
      availableSku(option.id, now) &&
      config?.products.some(
        (item) => item.id === option.id && item.priceFils === option.priceFils,
      ) &&
      (status !== "live" || liveOrderable(option.id) === true),
  );
}
