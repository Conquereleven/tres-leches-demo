import { useLanguage as useCustomerLanguage } from "./localization";
import { CustomerCopy } from "./localization";
import { ShoppingBag } from "@phosphor-icons/react";
import { cartCount, useCart, useCheckoutConfig } from "./cart";

/** Header cart link; hidden until online ordering is live and the cart has items. */
export function CartLink({ placement }: { placement: "desktop" | "mobile" }) {
  const { text: localize } = useCustomerLanguage();

  const lines = useCart();
  const { config } = useCheckoutConfig();
  const count = cartCount(lines);
  if (!config?.catalogAvailable && !config?.enabled) return null;
  return (
    <a
      className={`b-cart-link b-cart-${placement}`}
      href="/cart"
      aria-label={localize(`Cart, ${count} items`)}
    >
      <ShoppingBag aria-hidden />
      <span>
        <CustomerCopy>{`CART (${count})`}</CustomerCopy>
      </span>
    </a>
  );
}
