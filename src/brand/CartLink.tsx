import { ShoppingBag } from "@phosphor-icons/react";
import { cartCount, useCart, useCheckoutConfig } from "./cart";

/** Header cart link; hidden until online ordering is live and the cart has items. */
export function CartLink() {
  const lines = useCart();
  const { config } = useCheckoutConfig();
  const count = cartCount(lines);
  if (!config?.enabled || count === 0) return null;
  return (
    <a
      className="b-cart-link"
      href="/cart"
      aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}
    >
      <ShoppingBag aria-hidden />
      <span>{count}</span>
    </a>
  );
}
