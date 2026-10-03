import { useLanguage as useCustomerLanguage } from "./localization";
import { CustomerCopy } from "./localization";
import { useState } from "react";
import { List, ShoppingBag, WhatsappLogo } from "@phosphor-icons/react";
import { approved, destinations, whatsappUrl } from "./content";
import {
  business,
  legalEntityLabel,
  phoneHref,
  policyRoutes,
} from "./business";
import { Logo, Modal, SectionLabel, WhatsAppCTA } from "./primitives";
import { CartLink } from "./CartLink";
import { cartCount, useCart } from "./cart";
import { LanguageSwitcher, useLanguage } from "./localization";

/**
 * Card acceptance marks. Locally hosted; no endorsement is implied.
 * Intrinsic width/height match each file's viewBox aspect ratio so the marks
 * reserve their space before the SVG loads and cause no layout shift.
 * Swapping either file for official artwork of the same proportions needs no
 * change here — see public/payments/README.md.
 */
export function PaymentMarks() {
  const { text: localize } = useCustomerLanguage();

  return (
    <div className="b-payments">
      <p className="b-label" id="b-payments-label">
        <CustomerCopy>Secure payments</CustomerCopy>
      </p>
      <ul aria-labelledby="b-payments-label">
        <li>
          {/* Official Visa Brand Mark, viewBox 278.075 × 169.374 (ratio 1.642).
              The artboard carries Visa's required clear space, so the box is
              larger than the visible wordmark by design. */}
          <img
            src="/payments/visa.svg"
            alt={localize("Visa")}
            width="53"
            height="32"
          />
        </li>
        <li>
          {/* Official Mastercard Symbol, viewBox 152.4 × 108 (ratio 1.411).
              Same clear-space arrangement, so both marks use a 32px box and
              their visible artwork lands at a matching optical size. */}
          <img
            src="/payments/mastercard.svg"
            alt={localize("Mastercard")}
            width="45"
            height="32"
          />
        </li>
      </ul>
      <p className="b-caption">
        <CustomerCopy>
          Card payments are processed on a secure page hosted by our payment
          provider,
        </CustomerCopy>{" "}
        <CustomerCopy>{business.paymentProcessor}</CustomerCopy>.{" "}
        <CustomerCopy>{business.tradingName}</CustomerCopy>{" "}
        <CustomerCopy>
          does not receive or store your full card details. Visa and Mastercard
          are trademarks of their respective owners.
        </CustomerCopy>
      </p>
    </div>
  );
}

/** Compact ordering acknowledgement shown beside order actions. */
export function OrderAcknowledgement() {
  return (
    <p className="b-acknowledgement">
      <CustomerCopy>By placing an order you agree to our</CustomerCopy>{" "}
      <a href="/terms">
        <CustomerCopy>Terms &amp; Conditions</CustomerCopy>
      </a>{" "}
      <CustomerCopy>and acknowledge our</CustomerCopy>{" "}
      <a href="/refund-policy">
        <CustomerCopy>Refund &amp; Cancellation</CustomerCopy>
      </a>
      ,{" "}
      <a href="/delivery-policy">
        <CustomerCopy>Delivery</CustomerCopy>
      </a>{" "}
      <CustomerCopy>and</CustomerCopy>{" "}
      <a href="/privacy">
        <CustomerCopy>Privacy</CustomerCopy>
      </a>{" "}
      <CustomerCopy>policies.</CustomerCopy>
    </p>
  );
}

/**
 * Global customer footer. Home-only interactions (FAQ, social dialogs) are
 * optional so the same footer renders on every public page.
 */
export function SiteFooter({
  onContactUnavailable,
  onFaq,
  onSocial,
  onManage,
}: {
  onContactUnavailable: () => void;
  onFaq?: () => void;
  onSocial?: () => void;
  onManage?: () => void;
}) {
  const { text: localize } = useCustomerLanguage();

  return (
    <footer className="b-footer">
      <div className="b-footer-main">
        <div>
          <Logo lazy />
          <p>
            <CustomerCopy>Cakes, jars, bakery</CustomerCopy> <br />{" "}
            <CustomerCopy>and so much more.</CustomerCopy>
          </p>
          <SectionLabel>
            <CustomerCopy>{approved.heritage}</CustomerCopy>
          </SectionLabel>
          <WhatsAppCTA unavailable={onContactUnavailable} />
        </div>
        <nav aria-label={localize("Collections")}>
          <a href="/#home">
            <CustomerCopy>HOME</CustomerCopy>
          </a>
          <a href="/menu">
            <CustomerCopy>CAKES</CustomerCopy>
          </a>
          <a href="/menu?category=jars">
            <CustomerCopy>CAKE JARS</CustomerCopy>
          </a>
          <a href="/menu?category=bakery">
            <CustomerCopy>BAKERY</CustomerCopy>
          </a>
          <a href="/menu?category=seasonal">
            <CustomerCopy>SPECIAL OCCASIONS</CustomerCopy>
          </a>
        </nav>
        <nav aria-label={localize("Information")}>
          <a href="/contact">
            <CustomerCopy>CONTACT US</CustomerCopy>
          </a>
          {onFaq && (
            <button onClick={onFaq}>
              <CustomerCopy>FAQ</CustomerCopy>
            </button>
          )}
          {onSocial && (
            <>
              <button onClick={onSocial}>
                <CustomerCopy>Instagram</CustomerCopy>
              </button>
              <button onClick={onSocial}>
                <CustomerCopy>TikTok</CustomerCopy>
              </button>
            </>
          )}
          <WhatsAppCTA unavailable={onContactUnavailable}>
            <CustomerCopy>WhatsApp</CustomerCopy>
          </WhatsAppCTA>
        </nav>
        <nav aria-label={localize("Policies")}>
          {policyRoutes
            .filter((r) => r.path !== "/contact")
            .map((r) => (
              <a key={r.path} href={r.path}>
                <CustomerCopy>{r.label.toUpperCase()}</CustomerCopy>
              </a>
            ))}
        </nav>
      </div>
      <PaymentMarks />
      <p className="b-closing">
        <CustomerCopy>SWEET PEOPLE.</CustomerCopy> <br />{" "}
        <CustomerCopy>BRIGHTER DAYS.</CustomerCopy>
      </p>
      <div className="b-footer-bottom">
        <span>
          © {new Date().getFullYear()}{" "}
          <CustomerCopy>{legalEntityLabel()}</CustomerCopy> ·{" "}
          <bdi>{business.address ?? `${business.city}, ${business.country}`}</bdi>
          {business.supportContacts.length > 0 && (
            <>
              {" · "}
              {business.supportContacts.map((c, i) => (
                <span key={c.phone}>
                  {i > 0 && " · "}
                  <a href={phoneHref(c.phone)}>
                    <CustomerCopy>{c.phone}</CustomerCopy>
                  </a>
                </span>
              ))}
            </>
          )}
        </span>
        {onManage && (
          <div>
            <button onClick={onManage}>
              <CustomerCopy>Gestión</CustomerCopy>
            </button>
          </div>
        )}
      </div>
    </footer>
  );
}

/** Header for standalone customer pages; mirrors the home header anatomy. */
export function SiteHeader({
  home = false,
  onContactUnavailable,
}: {
  home?: boolean;
  onContactUnavailable: () => void;
}) {
  const { text: localize } = useCustomerLanguage();

  const [menu, setMenu] = useState(false);
  const { t } = useLanguage();
  void onContactUnavailable;
  void home;
  return (
    <>
      <header className="b-header b-scrolled">
        <nav className="b-nav-left" aria-label={localize("Primary")}>
          <a href="/#story">
            <CustomerCopy>{t("story").toUpperCase()}</CustomerCopy>
          </a>
          <a href="/menu">
            <CustomerCopy>{t("menu").toUpperCase()}</CustomerCopy>
          </a>
          <a href="/#how-to-order">
            <CustomerCopy>HOW TO ORDER?</CustomerCopy>
          </a>
        </nav>
        <button
          className="b-menu"
          aria-label={localize("Open menu")}
          aria-haspopup="dialog"
          onClick={() => setMenu(true)}
        >
          <List aria-hidden />
        </button>
        <a href="/" className="b-home" aria-label={localize("3L home")}>
          <Logo />
        </a>
        <nav className="b-nav-right" aria-label={localize("Contact")}>
          <a href="/#family-story">
            <CustomerCopy>JOURNAL</CustomerCopy>
          </a>
          <a href="/contact">
            <CustomerCopy>{t("contact").toUpperCase()}</CustomerCopy>
          </a>
          <LanguageSwitcher />
          <CartLink placement="desktop" />
        </nav>
        <div className="b-mobile-language">
          <LanguageSwitcher />
        </div>
        <CartLink placement="mobile" />
      </header>
      {menu && (
        <Modal title={localize("EXPLORE 3L")} onClose={() => setMenu(false)}>
          <nav
            className="b-modal-nav"
            aria-label={localize("Mobile navigation")}
          >
            <LanguageSwitcher />
            <a href="/">
              <CustomerCopy>HOME</CustomerCopy>
            </a>
            <a href="/menu">
              <CustomerCopy>{t("menu").toUpperCase()}</CustomerCopy>
            </a>
            <a href="/#how-to-order" onClick={() => setMenu(false)}>
              <CustomerCopy>HOW TO ORDER?</CustomerCopy>
            </a>
            {policyRoutes.map((r) => (
              <a key={r.path} href={r.path}>
                <CustomerCopy>{r.label.toUpperCase()}</CustomerCopy>
              </a>
            ))}
          </nav>
        </Modal>
      )}
    </>
  );
}

export function FloatingShopping() {
  const { text: localize } = useCustomerLanguage();

  const count = cartCount(useCart());
  const { t, text } = useLanguage();
  const support = whatsappUrl(
    destinations.whatsapp,
    "Hello 3L, I need help with the online store.",
  );
  return (
    <aside aria-label={localize("Shopping assistance")}>
      {support && (
        <a
          className="b-shopping-wa"
          href={support}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={text("WhatsApp support")}
        >
          <WhatsappLogo aria-hidden />
          <span>
            <CustomerCopy>{text("Need help?")}</CustomerCopy>
          </span>
        </a>
      )}
      {count > 0 && (
        <a
          className="b-floating-cart"
          href="/cart"
          aria-label={localize(`View cart, ${count} items`)}
        >
          <ShoppingBag aria-hidden />
          <CustomerCopy>{t("cart")}</CustomerCopy> ({count})
        </a>
      )}
    </aside>
  );
}
