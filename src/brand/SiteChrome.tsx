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
  return (
    <div className="b-payments">
      <p className="b-label" id="b-payments-label">
        Secure payments
      </p>
      <ul aria-labelledby="b-payments-label">
        <li>
          {/* Official Visa Brand Mark, viewBox 278.075 × 169.374 (ratio 1.642).
              The artboard carries Visa's required clear space, so the box is
              larger than the visible wordmark by design. */}
          <img src="/payments/visa.svg" alt="Visa" width="53" height="32" />
        </li>
        <li>
          {/* Official Mastercard Symbol, viewBox 152.4 × 108 (ratio 1.411).
              Same clear-space arrangement, so both marks use a 32px box and
              their visible artwork lands at a matching optical size. */}
          <img
            src="/payments/mastercard.svg"
            alt="Mastercard"
            width="45"
            height="32"
          />
        </li>
      </ul>
      <p className="b-caption">
        Card payments are processed on a secure page hosted by our payment
        provider, {business.paymentProcessor}. {business.tradingName} does not
        receive or store your full card details. Visa and Mastercard are
        trademarks of their respective owners.
      </p>
    </div>
  );
}

/** Compact ordering acknowledgement shown beside order actions. */
export function OrderAcknowledgement() {
  return (
    <p className="b-acknowledgement">
      By placing an order you agree to our{" "}
      <a href="/terms">Terms &amp; Conditions</a> and acknowledge our{" "}
      <a href="/refund-policy">Refund &amp; Cancellation</a>,{" "}
      <a href="/delivery-policy">Delivery</a> and <a href="/privacy">Privacy</a>{" "}
      policies.
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
  return (
    <footer className="b-footer">
      <div className="b-footer-main">
        <div>
          <Logo lazy />
          <p>
            Cakes, jars, bakery
            <br />
            and so much more.
          </p>
          <SectionLabel>{approved.heritage}</SectionLabel>
          <WhatsAppCTA unavailable={onContactUnavailable} />
        </div>
        <nav aria-label="Collections">
          <a href="/#home">HOME</a>
          <a href="/menu">CAKES</a>
          <a href="/menu?category=jars">CAKE JARS</a>
          <a href="/menu?category=bakery">BAKERY</a>
          <a href="/menu?category=seasonal">SPECIAL OCCASIONS</a>
        </nav>
        <nav aria-label="Information">
          <a href="/contact">CONTACT US</a>
          {onFaq && <button onClick={onFaq}>FAQ</button>}
          {onSocial && (
            <>
              <button onClick={onSocial}>Instagram</button>
              <button onClick={onSocial}>TikTok</button>
            </>
          )}
          <WhatsAppCTA unavailable={onContactUnavailable}>WhatsApp</WhatsAppCTA>
        </nav>
        <nav aria-label="Policies">
          {policyRoutes
            .filter((r) => r.path !== "/contact")
            .map((r) => (
              <a key={r.path} href={r.path}>
                {r.label.toUpperCase()}
              </a>
            ))}
        </nav>
      </div>
      <PaymentMarks />
      <p className="b-closing">
        SWEET PEOPLE.
        <br />
        BRIGHTER DAYS.
      </p>
      <div className="b-footer-bottom">
        <span>
          © {new Date().getFullYear()} {legalEntityLabel()} ·{" "}
          {business.address ?? `${business.city}, ${business.country}`}
          {business.supportContacts.length > 0 && (
            <>
              {" · "}
              {business.supportContacts.map((c, i) => (
                <span key={c.phone}>
                  {i > 0 && " · "}
                  <a href={phoneHref(c.phone)}>{c.phone}</a>
                </span>
              ))}
            </>
          )}
        </span>
        {onManage && (
          <div>
            <button onClick={onManage}>Gestión</button>
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
  const [menu, setMenu] = useState(false);
  const { t } = useLanguage();
  void onContactUnavailable;
  return (
    <>
      <header className="b-header b-scrolled">
        <nav className="b-nav-left" aria-label="Primary">
          <a href="/#story">{t("story").toUpperCase()}</a>
          <a href="/menu">{t("menu").toUpperCase()}</a>
        </nav>
        <button
          className="b-menu"
          aria-label="Open menu"
          aria-haspopup="dialog"
          onClick={() => setMenu(true)}
        >
          <List aria-hidden />
        </button>
        <a href="/" className="b-home" aria-label="3L home">
          {home ? (
            <img
              className="b-logo"
              src="/brand/reference/mark.png"
              alt="Pastelerías 3L"
              width="72"
              height="52"
            />
          ) : (
            <Logo />
          )}
        </a>
        <nav className="b-nav-right" aria-label="Contact">
          <a href="/#family-story">JOURNAL</a>
          <a href="/contact">{t("contact").toUpperCase()}</a>
          <LanguageSwitcher />
          <CartLink placement="desktop" />
        </nav>
        <CartLink placement="mobile" />
      </header>
      {menu && (
        <Modal title="EXPLORE 3L" onClose={() => setMenu(false)}>
          <nav className="b-modal-nav" aria-label="Mobile navigation">
            <LanguageSwitcher />
            <a href="/">HOME</a>
            <a href="/menu">{t("menu").toUpperCase()}</a>
            {policyRoutes.map((r) => (
              <a key={r.path} href={r.path}>
                {r.label.toUpperCase()}
              </a>
            ))}
          </nav>
        </Modal>
      )}
    </>
  );
}

export function FloatingShopping() {
  const count = cartCount(useCart());
  const support = whatsappUrl(
    destinations.whatsapp,
    "Hello 3L, I need help with the online store.",
  );
  return (
    <>
      {support && (
        <a
          className="b-shopping-wa"
          href={support}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp support"
        >
          <WhatsappLogo aria-hidden />
          <span>Need help?</span>
        </a>
      )}
      {count > 0 && (
        <a
          className="b-floating-cart"
          href="/cart"
          aria-label={`View cart, ${count} items`}
        >
          <ShoppingBag aria-hidden />
          Cart ({count})
        </a>
      )}
    </>
  );
}
