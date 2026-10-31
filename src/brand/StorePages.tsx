import { useCheckoutConfig } from "./cart";
import { CustomerCopy } from "./localization";
import { MenuCatalog } from "./MenuCatalog";
import { productSlugFromPath } from "./menu";
import { SiteHeader, SiteFooter, FloatingShopping } from "./SiteChrome";
import { useLanguage } from "./localization";
import "./brand.css";
import "./storefront.css";
const contact = () => {
  location.href = "/contact";
};
export function MenuPage() {
  const { t } = useLanguage();
  return (
    <div className="brand-experience b-entered b-menu-page">
      <a className="b-skip" href="#main-content">
        <CustomerCopy>Skip to content</CustomerCopy>
      </a>
      <SiteHeader onContactUnavailable={contact} />
      <main id="main-content">
        {/* A product view has its own H1 (the product name); the page title then is not "Menu". */}
        {!new URLSearchParams(
          typeof location === "undefined" ? "" : location.search,
        ).has("product") &&
          !productSlugFromPath() && (
            <>
              {/* Decorative official logo behind the Menu introduction only. */}
              <div className="b-menu-intro-mark" aria-hidden="true" />
              <h1 className="b-heading" style={{ textAlign: "center" }}>
                <CustomerCopy>{t("menu")}</CustomerCopy>
              </h1>
            </>
          )}
        <MenuCatalog />
      </main>
      <SiteFooter onContactUnavailable={contact} />
      <FloatingShopping />
    </div>
  );
}
export function HowToOrder() {
  const { t } = useLanguage();
  const { config } = useCheckoutConfig();
  return (
    <div className="brand-experience b-entered b-how-page">
      <SiteHeader onContactUnavailable={contact} />
      <main id="main-content">
        <h1 className="b-heading">
          <CustomerCopy>{t("how")}</CustomerCopy>
        </h1>
        <ol>
          <li>
            <CustomerCopy>
              Choose your products from the menu, then select a size, flavour
              and quantity.
            </CustomerCopy>
          </li>
          <li>
            <CustomerCopy>
              Add to your cart. You can change quantities or remove items before
              checkout.
            </CustomerCopy>
          </li>
          <li>
            <CustomerCopy>
              {config?.addressVerificationRequired
                ? "Choose delivery or pickup. Delivery requires a verified address in a supported area. If verification is unavailable, choose pickup or contact 3L for help."
                : "Choose delivery or pickup. For delivery, enter your address and select your community. Our team will review the address manually."}
            </CustomerCopy>
          </li>
          <li>
            <CustomerCopy>
              {config?.addressVerificationRequired
                ? "Confirm the area detected from your verified address, review its minimum order and add items if needed. Delivery is included once the minimum is met."
                : "Review the minimum order for your selected community and add items if needed. Delivery is included once the minimum is met."}
            </CustomerCopy>
          </li>
          <li>
            <CustomerCopy>
              Choose a date from tomorrow onwards and an available time window:
              8 AM–1 PM, 1 PM–4 PM or 4 PM–9 PM.
            </CustomerCopy>
          </li>
          <li>
            <CustomerCopy>
              Allow at least 12 hours before your window starts. Mango cakes,
              gelatinas and Rosca require at least 24 hours.
            </CustomerCopy>
          </li>
          <li>
            <CustomerCopy>
              Enter your contact and billing details, review your order, then
              continue to secure Paymennt checkout.
            </CustomerCopy>
          </li>
          <li>
            <CustomerCopy>
              Return to 3L for payment verification, confirmation and order
              tracking. An unverified payment is never shown as confirmed.
            </CustomerCopy>
          </li>
        </ol>
        <a className="b-button" href="/menu">
          <CustomerCopy>EXPLORE THE MENU</CustomerCopy>
        </a>
      </main>
      <SiteFooter onContactUnavailable={contact} />
      <FloatingShopping />
    </div>
  );
}
