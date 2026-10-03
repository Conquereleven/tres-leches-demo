import { MenuCatalog } from "./MenuCatalog";
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
        Skip to content
      </a>
      <SiteHeader onContactUnavailable={contact} />
      <main id="main-content">
        <h1 className="b-heading" style={{ textAlign: "center" }}>
          {t("menu")}
        </h1>
        <MenuCatalog />
      </main>
      <SiteFooter onContactUnavailable={contact} />
      <FloatingShopping />
    </div>
  );
}
export function HowToOrder() {
  const { t } = useLanguage();
  return (
    <div className="brand-experience b-entered b-how-page">
      <SiteHeader onContactUnavailable={contact} />
      <main id="main-content">
        <h1 className="b-heading">{t("how")}</h1>
        <ol>
          <li>
            Choose your products from the menu, then select a size, flavour and
            quantity.
          </li>
          <li>
            Add to your cart. You can change quantities or remove items before
            checkout.
          </li>
          <li>
            Choose delivery or pickup. Delivery requires a verified address in a
            supported area.
          </li>
          <li>
            Review your area’s minimum order and add items if needed. Delivery
            is included once the minimum is met.
          </li>
          <li>
            Choose a date from tomorrow onwards and an available time window: 8
            AM–1 PM, 1 PM–4 PM or 4 PM–9 PM.
          </li>
          <li>
            Allow at least 12 hours before your window starts. Mango cakes,
            gelatinas and Rosca require at least 24 hours.
          </li>
          <li>
            Enter your contact and billing details, review your order, then
            continue to secure Paymennt checkout.
          </li>
          <li>
            Return to 3L for payment verification, confirmation and order
            tracking. An unverified payment is never shown as confirmed.
          </li>
        </ol>
        <a className="b-button" href="/menu">
          EXPLORE THE MENU
        </a>
      </main>
      <SiteFooter onContactUnavailable={contact} />
      <FloatingShopping />
    </div>
  );
}
