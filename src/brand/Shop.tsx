import { storefrontI18n } from "./locales/engine";
import { useLanguage as useCustomerLanguage } from "./localization";
import { QuantityInput } from "./QuantityInput";
import { normalizeWhatsAppNumber } from "../../shared/contact";
import { ResponsiveMedia, selectedProductMedia } from "./media";
import { AddressAutocomplete } from "./AddressAutocomplete";
import { CustomerCopy, LanguageSwitcher } from "./localization";
import { useCheckoutNow } from "./cart";
import {
  validWindow,
  leadHours,
  earliestFulfillmentDate,
  nextDayClosed,
} from "../../shared/commerce-policy";
import { FloatingShopping } from "./SiteChrome";
import "./storefront.css";
import { business } from "./business";
import { menuFamilyForSku, storefrontProductForSku } from "./menu";
/**
 * The 3L online store: cart → delivery → details → payment → confirmation.
 *
 * Prices shown here are for display only. The server re-prices the cart from
 * the approved catalog and delivery zone at quote, at checkout creation and
 * again before checkout creation. Card details are entered only on Paymennt.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  CaretDown,
  Check,
  CheckCircle,
  HourglassMedium,
  LockSimple,
  Minus,
  Plus,
  ShieldCheck,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import "./brand.css";
import "./checkout.css";
import {
  Button,
  Input,
  Logo,
  Select,
  Textarea,
  WhatsAppCTA,
} from "./primitives";
import { collections, formatAed } from "./content";
import { SiteFooter } from "./SiteChrome";
import {
  FULFILMENT_STEPS,
  PAID_STATES,
  firstName,
  fulfilmentStep,
  paymentStateOf,
  paymentStateOfError,
  stateCopy,
  type CustomerPaymentState,
} from "./checkout-states";
import {
  cart,
  cartSubtotalFils,
  MAX_QTY,
  useCart,
  useCheckoutConfig,
  type CartLine,
  type CheckoutConfig,
} from "./cart";

// ── Shared ───────────────────────────────────────────────────────────────

type Quote = {
  eligible: boolean;
  minimumMet: boolean;
  reason: string;
  subtotalFils: number;
  feeFils: number | null;
  totalFils: number | null;
  minOrderAed: number | null;
  zoneName: string | null;
};
type Summary = {
  items: {
    productId: string;
    name: string;
    quantity: number;
    lineFils: number;
  }[];
  subtotalFils: number;
  feeFils: number;
  fulfillmentMethod?: "delivery" | "pickup";
  pickup?: { pickupDate: string; preferredTime: string };
  delivery?: Delivery & { zoneName?: string };
  customerName?: string;
};
type Status = {
  orderId: string;
  status: string;
  paymentStatus: string;
  paymentFlow?: "web";
  amountFils: number;
  currency: string;
  url: string | null;
  actionRequired?: "review_payment" | "complete_payment" | null;
  summary?: Summary;
};
type Delivery = {
  addressRef?: string;
  zoneId: string;
  address: string;
  building: string;
  unit?: string;
  date: string;
  slot: string;
  notes?: string;
};
type Customer = {
  whatsappNumber?: string;
  name: string;
  phone: string;
  email?: string;
  instructions?: string;
};
type Billing = {
  sameAsDelivery: boolean;
  name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  zip?: string;
  country?: string;
};
/** 3L delivers only within Dubai; a delivery address is in Dubai, UAE. */
const SERVICE_AREA = { city: "Dubai", country: "AE" };
/** ISO 3166-1 alpha-2 codes; names come from the browser, in English. */
const COUNTRY_CODES =
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  );
function countryName(code: string) {
  try {
    return (
      new Intl.DisplayNames([storefrontI18n.language], { type: "region" }).of(
        code,
      ) ?? code
    );
  } catch {
    return code;
  }
}
const COUNTRIES = COUNTRY_CODES.map((code) => ({
  code,
  name: countryName(code),
})).sort((a, b) =>
  a.code === "AE" ? -1 : b.code === "AE" ? 1 : a.name.localeCompare(b.name),
);
/** The billing address exactly as it will be sent, for the review screen. */
function billingLines(billing: Billing, delivery: Delivery, name: string) {
  return billing.sameAsDelivery
    ? [
        name,
        delivery.unit && `Unit ${delivery.unit}`,
        delivery.building,
        delivery.address,
        SERVICE_AREA.city,
        countryName(SERVICE_AREA.country),
      ]
    : [
        billing.name,
        billing.address1,
        billing.address2,
        billing.city,
        billing.zip,
        billing.country && countryName(billing.country),
      ];
}
const billingComplete = (b: Billing) =>
  b.sameAsDelivery ||
  !!(b.name?.trim() && b.address1?.trim() && b.city?.trim() && b.country);

async function post<T>(path: string, body: unknown, key?: string): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      friendly(data.message ?? data.error) ??
        "Something went wrong. Please try again.",
    );
  return data as T;
}
/** Server messages written for operators are replaced with customer copy. */
function friendly(message?: string) {
  if (!message) return undefined;
  if (/held for review|could not be verified/i.test(message))
    return "The payment result could not be verified. Your order is held for review.";
  if (/could not be processed/i.test(message))
    return "Payment could not be processed. Please check your details or try again.";

  if (/mínimo/i.test(message))
    return "Your order is below the minimum for this delivery area.";
  if (/pendiente de revisión|Regla pendiente/i.test(message))
    return "Online delivery isn't available for this area yet.";
  if (/catálogo/i.test(message))
    return "An item in your cart is no longer available.";
  if (/[áéíóúñ¿]/i.test(message))
    return "Something went wrong. Please try again.";
  return "Something went wrong. Please try again.";
}
/** Mirrors the server's UAE mobile rule so mistakes are caught before submit. */
export function normalizeUaeMobile(raw: string) {
  const m = /^(?:\+971|00971|971|0)?(5\d{8})$/.exec(
    raw.replace(/[\s\-().]/g, ""),
  );
  return m ? `+971${m[1]}` : null;
}
const CAPABILITY = "3l-checkout";
const DRAFT = "3l-checkout-draft";
function loadDraft(): {
  fulfillmentMethod?: "delivery" | "pickup";
  delivery?: Partial<Delivery>;
  customer?: Partial<Customer>;
  billing?: Billing;
} {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT) ?? "{}");
  } catch {
    return {};
  }
}
function saveDraft(draft: {
  fulfillmentMethod?: "delivery" | "pickup";
  delivery?: Partial<Delivery>;
  customer?: Partial<Customer>;
  billing?: Billing;
}) {
  try {
    sessionStorage.setItem(DRAFT, JSON.stringify(draft));
  } catch {
    /* Session storage unavailable: the form still works on this page. */
  }
}
const longDate = (iso?: string) =>
  iso
    ? new Date(`${iso}T12:00:00Z`).toLocaleDateString(
        storefrontI18n.language === "en" ? "en-GB" : storefrontI18n.language,
        {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: "UTC",
        },
      )
    : "";

/** Owner-approved photograph for a catalog product, when one exists. */
function productImage(productId: string) {
  const image = Object.values(collections)
    .flat()
    .find((p) => p.id === productId)?.image;
  const family = menuFamilyForSku(productId);
  return image?.src ? image : family?.image ? { src: family.image } : null;
}
function Thumb({ productId, name }: { productId: string; name: string }) {
  const image = productImage(productId);
  const family = menuFamilyForSku(productId);
  const option = family?.options.find((o) => o.id === productId);
  if (
    family &&
    option &&
    selectedProductMedia(
      storefrontProductForSku(productId)?.id,
      family.id,
      option.variant,
      option.size,
    )
  )
    return (
      <ResponsiveMedia
        productId={storefrontProductForSku(productId)?.id}
        family={family.id}
        variant={option.variant}
        size={option.size}
        alt=""
        className="b-co-thumb"
        sizes="72px"
      />
    );
  return image ? (
    <img
      className="b-co-thumb"
      src={image.src!}
      alt=""
      width={72}
      height={72}
      loading="lazy"
      decoding="async"
    />
  ) : (
    <span className="b-co-thumb b-co-thumb-empty" aria-hidden>
      {name.slice(0, 1)}
    </span>
  );
}

const STEPS = ["Cart", "Fulfillment", "Details", "Payment", "Confirmation"];
function Progress({ step }: { step: number }) {
  const { text: localize } = useCustomerLanguage();

  return (
    <nav className="b-co-progress" aria-label={localize("Checkout progress")}>
      <p className="b-co-progress-count" aria-hidden>
        <CustomerCopy>Step</CustomerCopy> {step + 1}{" "}
        <CustomerCopy>of</CustomerCopy> {STEPS.length} ·{" "}
        <strong>
          <CustomerCopy>{STEPS[step]!}</CustomerCopy>
        </strong>
      </p>
      <ol>
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={i < step ? "done" : i === step ? "current" : undefined}
            aria-current={i === step ? "step" : undefined}
          >
            <span className="b-co-dot" aria-hidden>
              {i < step ? <Check weight="bold" /> : i + 1}
            </span>
            <span className="b-co-step-label">
              <CustomerCopy>{label}</CustomerCopy>
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
/** Checkout keeps its own compact header: logo, a secure-checkout cue, no menu. */
function CheckoutHeader() {
  const { text: localize } = useCustomerLanguage();

  return (
    <header className="b-co-header">
      <a
        href="/"
        className="b-co-logo"
        aria-label={localize("Pastelerías 3L · Home")}
      >
        <Logo />
      </a>
      <LanguageSwitcher />
      <p className="b-co-secure">
        <LockSimple aria-hidden weight="bold" />{" "}
        <CustomerCopy>Secure checkout</CustomerCopy>
      </p>
    </header>
  );
}
function ShopShell({
  step,
  title,
  children,
  bare,
}: {
  step: number;
  title: string;
  children: ReactNode;
  /** Confirmation and status pages render their own heading. */
  bare?: boolean;
}) {
  const toContact = () => {
    location.href = "/contact";
  };
  return (
    <div className="brand-experience b-entered b-shop">
      <a className="b-skip" href="#main-content">
        <CustomerCopy>Skip to content</CustomerCopy>
      </a>
      <CheckoutHeader />
      <main id="main-content" className="b-shop-main">
        <Progress step={step} />
        {!bare && (
          <h1>
            <CustomerCopy>{title}</CustomerCopy>
          </h1>
        )}
        {children}
      </main>
      <SiteFooter onContactUnavailable={toContact} />
      <FloatingShopping />
    </div>
  );
}
function Totals({
  subtotal,
  total,
}: {
  subtotal: number;
  fee: number | null;
  total: number | null;
  feePending?: boolean;
  fulfillmentMethod?: "delivery" | "pickup";
}) {
  return (
    <dl className="b-shop-totals">
      <div>
        <dt>
          <CustomerCopy>Subtotal</CustomerCopy>
        </dt>
        <dd>
          <CustomerCopy>{formatAed(subtotal)}</CustomerCopy>
        </dd>
      </div>
      {total != null && (
        <div className="b-shop-grand">
          <dt>
            <CustomerCopy>Total</CustomerCopy>
          </dt>
          <dd>
            <CustomerCopy>{formatAed(total)}</CustomerCopy>
          </dd>
        </div>
      )}
    </dl>
  );
}
function Card({
  title,
  headingRef,
  action,
  children,
  className = "",
}: {
  title: string;
  headingRef?: React.Ref<HTMLHeadingElement>;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`b-co-card ${className}`}>
      <header>
        <h2 ref={headingRef} tabIndex={headingRef ? -1 : undefined}>
          <CustomerCopy>{title}</CustomerCopy>
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}
/**
 * Order summary. A sticky side column on desktop; on mobile a collapsed bar
 * showing the total that expands to the full breakdown.
 */
function OrderSummary({
  lines,
  config,
  subtotal,
  fee,
  total,
  feePending,
  fulfillmentMethod = "delivery",
  children,
}: {
  lines: CartLine[];
  config: CheckoutConfig;
  subtotal: number;
  fee: number | null;
  total: number | null;
  feePending?: boolean;
  children?: ReactNode;
  fulfillmentMethod?: "delivery" | "pickup";
}) {
  const { text: localize } = useCustomerLanguage();

  const [open, setOpen] = useState(false);
  const count = lines.reduce((n, l) => n + l.quantity, 0);
  return (
    <aside className="b-co-summary" aria-label={localize("Order summary")}>
      <button
        type="button"
        className="b-co-summary-toggle"
        aria-expanded={open}
        aria-controls="b-co-summary-body"
        onClick={() => setOpen((o) => !o)}
      >
        <span>
          <CustomerCopy>{open ? "Hide" : "Show"}</CustomerCopy>{" "}
          <CustomerCopy>order summary</CustomerCopy>{" "}
          <CaretDown aria-hidden weight="bold" />
        </span>
        <strong>
          <CustomerCopy>{formatAed(total ?? subtotal)}</CustomerCopy>
        </strong>
      </button>
      <div
        id="b-co-summary-body"
        className="b-co-summary-body"
        data-open={open}
      >
        <h2>
          <CustomerCopy>Your order</CustomerCopy>{" "}
          <span className="b-caption">
            <CustomerCopy>{`${count} items`}</CustomerCopy>
          </span>
        </h2>
        <ul className="b-co-summary-items">
          {lines.map((l) => {
            const p = config.products.find((p) => p.id === l.productId);
            if (!p) return null;
            return (
              <li key={l.productId}>
                <span className="b-co-thumb-wrap">
                  <Thumb productId={p.id} name={p.name} />
                  <span className="b-co-thumb-qty" aria-hidden>
                    {l.quantity}
                  </span>
                </span>
                <span>
                  <strong>
                    <CustomerCopy>{p.name}</CustomerCopy>
                  </strong>
                  <span className="b-caption">
                    <CustomerCopy>{formatAed(p.priceFils)}</CustomerCopy> ×{" "}
                    {l.quantity}
                  </span>
                </span>
                <span className="b-co-money">
                  <CustomerCopy>
                    {formatAed(p.priceFils * l.quantity)}
                  </CustomerCopy>
                </span>
              </li>
            );
          })}
        </ul>
        <Totals
          subtotal={subtotal}
          fee={fee}
          total={total}
          fulfillmentMethod={fulfillmentMethod}
          feePending={feePending}
        />
        {children}
      </div>
    </aside>
  );
}
function Unavailable({ retry }: { retry?: () => void }) {
  return (
    <div className="b-shop-panel">
      <p>
        <CustomerCopy>
          Online ordering is not available right now. Our team is happy to take
          your order on WhatsApp.
        </CustomerCopy>
      </p>
      <WhatsAppCTA
        unavailable={() => (location.href = "/contact")}
        message="Hello 3L, I'd like to place an order."
      >
        <CustomerCopy>ASK ABOUT COVERAGE</CustomerCopy>
      </WhatsAppCTA>
      {retry && (
        <button className="b-link" onClick={retry}>
          <CustomerCopy>Try again</CustomerCopy>
        </button>
      )}
    </div>
  );
}
function EmptyCart() {
  return (
    <div className="b-shop-panel b-co-empty">
      <p>
        <CustomerCopy>Your cart is empty.</CustomerCopy>
      </p>
      <a className="b-button" href="/menu">
        <CustomerCopy>BROWSE THE COLLECTION</CustomerCopy>
      </a>
    </div>
  );
}

// ── Product card and header ──────────────────────────────────────────────

/**
 * Add-to-cart for a product card. Renders only when online ordering is live
 * for this product; otherwise the card keeps its existing WhatsApp ordering.
 */
export function AddToCart({
  productId,
  fallback,
}: {
  productId: string;
  fallback: ReactNode;
}) {
  const { text: localize } = useCustomerLanguage();

  const { config, loading } = useCheckoutConfig();
  const lines = useCart();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const product = config?.products.find((p) => p.id === productId);
  if (loading) return <>{fallback}</>;
  if (!product) return <>{fallback}</>;
  const inCart = lines.find((l) => l.productId === productId)?.quantity ?? 0;
  return (
    <div className="b-add-to-cart">
      <div className="b-qty" role="group" aria-label={localize("Quantity")}>
        <button
          type="button"
          aria-label={localize("Decrease quantity")}
          disabled={quantity <= 1}
          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
        >
          <Minus aria-hidden />
        </button>
        <QuantityInput
          value={quantity}
          max={Math.max(1, MAX_QTY - inCart)}
          label="Quantity"
          onChange={setQuantity}
        />
        <button
          type="button"
          aria-label={localize("Increase quantity")}
          disabled={quantity + inCart >= MAX_QTY}
          onClick={() => setQuantity((q) => Math.min(MAX_QTY - inCart, q + 1))}
        >
          <Plus aria-hidden />
        </button>
      </div>
      <Button
        type="button"
        disabled={inCart >= MAX_QTY}
        onClick={() => {
          cart.add(productId, quantity);
          setAdded(true);
          setQuantity(1);
        }}
      >
        <CustomerCopy>ADD TO CART ·</CustomerCopy>{" "}
        <CustomerCopy>{formatAed(product.priceFils * quantity)}</CustomerCopy>
      </Button>
      {(added || inCart > 0) && (
        <a className="b-link" href="/cart" aria-live="polite">
          {inCart} <CustomerCopy>in your cart · View cart</CustomerCopy>
        </a>
      )}
    </div>
  );
}

// ── Cart page ────────────────────────────────────────────────────────────

function CartItems({
  lines,
  config,
}: {
  lines: CartLine[];
  config: CheckoutConfig;
}) {
  const { text: localize } = useCustomerLanguage();

  return (
    <ul className="b-co-items">
      {lines.map((l) => {
        const p = config.products.find((p) => p.id === l.productId);
        if (!p)
          return (
            <li key={l.productId} className="b-cart-unavailable">
              <span>
                <CustomerCopy>This item is no longer available.</CustomerCopy>
              </span>
              <button
                className="b-link"
                onClick={() => cart.remove(l.productId)}
              >
                <CustomerCopy>Remove</CustomerCopy>
              </button>
            </li>
          );
        return (
          <li key={l.productId} className="b-co-item">
            <Thumb productId={p.id} name={p.name} />
            <div className="b-co-item-copy">
              <strong>
                <CustomerCopy>{p.name}</CustomerCopy>
              </strong>
              {p.description && (
                <span className="b-caption">
                  <CustomerCopy>{p.description}</CustomerCopy>
                </span>
              )}
              <span className="b-caption">
                <CustomerCopy>{formatAed(p.priceFils)}</CustomerCopy>{" "}
                <CustomerCopy>each</CustomerCopy>
              </span>
            </div>
            <div
              className="b-qty"
              role="group"
              aria-label={localize(`${p.name} quantity`)}
            >
              <button
                type="button"
                aria-label={localize(`Decrease ${p.name}`)}
                onClick={() => cart.set(l.productId, l.quantity - 1)}
              >
                <Minus aria-hidden />
              </button>
              <QuantityInput
                value={l.quantity}
                max={MAX_QTY}
                label={`${p.name} quantity`}
                onChange={(n) => cart.set(l.productId, n)}
              />
              <button
                type="button"
                aria-label={localize(`Increase ${p.name}`)}
                disabled={l.quantity >= MAX_QTY}
                onClick={() => cart.set(l.productId, l.quantity + 1)}
              >
                <Plus aria-hidden />
              </button>
            </div>
            <span className="b-co-money b-co-item-total">
              <CustomerCopy>{formatAed(p.priceFils * l.quantity)}</CustomerCopy>
            </span>
            <button
              type="button"
              className="b-cart-remove"
              aria-label={localize(`Remove ${p.name}`)}
              onClick={() => cart.remove(l.productId)}
            >
              <Trash aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function CartPage() {
  const { text: localize } = useCustomerLanguage();

  const lines = useCart();
  const { config, loading, retry } = useCheckoutConfig();
  if (loading)
    return (
      <ShopShell step={0} title={localize("Your cart")}>
        <p role="status">
          <CustomerCopy>Loading your cart…</CustomerCopy>
        </p>
      </ShopShell>
    );
  if (!config || !config.products.length)
    return (
      <ShopShell step={0} title={localize("Your cart")}>
        <Unavailable retry={retry} />
      </ShopShell>
    );
  const known = lines.filter((l) =>
    config.products.some((p) => p.id === l.productId),
  );
  const subtotal = cartSubtotalFils(lines, config.products);
  return (
    <ShopShell step={0} title={localize("Your cart")}>
      {lines.length === 0 ? (
        <EmptyCart />
      ) : (
        <div className="b-co-layout">
          <div className="b-co-main">
            <CartItems lines={lines} config={config} />
            <div className="b-co-inline-links">
              <a className="b-link" href="/menu">
                <ArrowLeft className="b-directional" aria-hidden />{" "}
                <CustomerCopy>Continue shopping</CustomerCopy>
              </a>
              <button
                className="b-link"
                onClick={() => {
                  if (window.confirm("Remove all items from your cart?"))
                    cart.clear();
                }}
              >
                <CustomerCopy>Clear cart</CustomerCopy>
              </button>
            </div>
          </div>
          <aside className="b-co-summary b-co-summary-static">
            <div className="b-co-summary-body" data-open>
              <h2>
                <CustomerCopy>Order total</CustomerCopy>
              </h2>
              <Totals subtotal={subtotal} fee={null} total={null} feePending />
              <p className="b-caption">
                <CustomerCopy>
                  Delivery is included once your area’s minimum order is
                  reached. Your area and address are confirmed in the next step.
                </CustomerCopy>
              </p>
              <a
                className={`b-button b-co-cta ${known.length ? "" : "b-disabled"}`}
                aria-disabled={!known.length}
                href={known.length ? "/checkout" : undefined}
              >
                <CustomerCopy>CONTINUE TO FULFILLMENT</CustomerCopy>
              </a>
              <p className="b-co-assurance">
                <ShieldCheck aria-hidden />{" "}
                <CustomerCopy>
                  Secure card payment · Visa and Mastercard
                </CustomerCopy>
              </p>
            </div>
          </aside>
        </div>
      )}
    </ShopShell>
  );
}

// ── Checkout ─────────────────────────────────────────────────────────────

export function CheckoutPage() {
  const { text: localize, language } = useCustomerLanguage();

  const lines = useCart();
  const { config, loading, retry } = useCheckoutConfig();
  const now = useCheckoutNow(config);
  const draft = useMemo(loadDraft, []);
  const [step, setStep] = useState(1);
  const [fulfillmentMethod, setFulfillmentMethod] = useState<
    "delivery" | "pickup"
  >(draft.fulfillmentMethod ?? "delivery");
  const pickup = fulfillmentMethod === "pickup";
  const [delivery, setDelivery] = useState<Partial<Delivery>>(
    draft.delivery ?? {},
  );
  const [customer, setCustomer] = useState<Partial<Customer>>(
    draft.customer ?? {},
  );
  // Default: billing address is the same as the delivery address.
  const [billing, setBilling] = useState<Billing>(
    draft.billing ?? { sameAsDelivery: true },
  );
  const [areaMissing, setAreaMissing] = useState(false);
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressNotice, setAddressNotice] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const cartLines = useMemo(
    () =>
      config
        ? lines.filter((l) => config.products.some((p) => p.id === l.productId))
        : [],
    [lines, config],
  );

  useEffect(
    () => saveDraft({ fulfillmentMethod, delivery, customer, billing }),
    [fulfillmentMethod, delivery, customer, billing],
  );
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo({ top: 0 });
  }, [step]);
  // Live server quote for the chosen area. Display only; re-checked on payment.
  useEffect(() => {
    let active = true;
    setQuote(null);
    if (!config?.enabled || (!pickup && !delivery.zoneId) || !cartLines.length)
      return;
    post<Quote>("/api/checkout/quote", {
      lines: cartLines,
      ...(pickup
        ? { fulfillmentMethod: "pickup" }
        : { zoneId: delivery.zoneId }),
    })
      .then((q) => active && setQuote(q))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [delivery.zoneId, cartLines, config, pickup]);

  if (loading)
    return (
      <ShopShell step={1} title={localize("Checkout")}>
        <p role="status">
          <CustomerCopy>Preparing checkout…</CustomerCopy>
        </p>
      </ShopShell>
    );
  if (!config?.enabled)
    return (
      <ShopShell step={1} title={localize("Checkout")}>
        <Unavailable retry={retry} />
      </ShopShell>
    );
  if (!cartLines.length)
    return (
      <ShopShell step={1} title={localize("Checkout")}>
        <EmptyCart />
      </ShopShell>
    );

  const subtotal = cartSubtotalFils(cartLines, config.products);
  const minFils = (quote?.minOrderAed ?? 0) * 100;
  const set = <K extends keyof Delivery>(k: K, v: Delivery[K]) => {
    setError("");
    if (["address", "building", "zoneId"].includes(k)) setAddressNotice("");
    setDelivery((d) => ({
      ...d,
      ...(config?.addressVerificationRequired &&
      ["address", "building"].includes(k)
        ? { addressRef: undefined, zoneId: "" }
        : {}),
      [k]: v,
    }));
  };
  const setB = <K extends keyof Billing>(k: K, v: Billing[K]) => {
    setError("");
    setBilling((b) => ({ ...b, [k]: v }));
  };
  const setC = <K extends keyof Customer>(k: K, v: Customer[K]) => {
    setError("");
    setCustomer((c) => ({ ...c, [k]: v }));
  };
  const summary = (
    <OrderSummary
      key={step}
      fulfillmentMethod={fulfillmentMethod}
      lines={cartLines}
      config={config}
      subtotal={quote?.subtotalFils ?? subtotal}
      fee={quote?.feeFils ?? null}
      total={quote?.eligible ? quote.totalFils : null}
      feePending={!quote}
    />
  );

  if (step === 1)
    return (
      <ShopShell step={1} title={localize("Delivery or pickup")}>
        <div className="b-co-layout">
          {summary}
          <form
            className="b-shop-form b-co-main"
            onSubmit={(e) => {
              e.preventDefault();
              if (!quote?.eligible || addressBusy) return;
              if (
                !validWindow(
                  delivery.date ?? "",
                  delivery.slot ?? "",
                  now,
                  leadHours(cartLines.map((l) => l.productId)),
                )
              ) {
                setError(
                  "Choose a date from tomorrow and a window with enough advance notice.",
                );
                return;
              }
              if (pickup) {
                setStep(2);
                return;
              }
              setAddressBusy(true);
              setError("");
              void post<{ zoneId: string; name: string; corrected: boolean }>(
                "/api/checkout/address",
                {
                  zoneId: delivery.zoneId,
                  address: delivery.address,
                  building: delivery.building,
                  addressRef: delivery.addressRef,
                },
              )
                .then((result) => {
                  if (result.corrected) {
                    setDelivery((d) => ({ ...d, zoneId: result.zoneId }));
                    setAddressNotice(
                      `We verified your address in ${result.name} and updated the area. Please review its minimum order.`,
                    );
                  } else setStep(2);
                })
                .catch((error: Error) => setError(error.message))
                .finally(() => setAddressBusy(false));
            }}
          >
            <Card
              title={localize(pickup ? "Pickup details" : "Delivery details")}
              headingRef={heading}
            >
              <fieldset className="b-fulfillment-choice">
                <legend>
                  <CustomerCopy>How would you like your order?</CustomerCopy>
                </legend>
                {(["delivery", "pickup"] as const).map((method) => (
                  <label key={method}>
                    <input
                      type="radio"
                      name="fulfillment"
                      checked={fulfillmentMethod === method}
                      onChange={() => {
                        setFulfillmentMethod(method);
                        setAreaMissing(false);
                        setError("");
                        setQuote(null);
                        if (method === "pickup")
                          setBilling((b) => ({ ...b, sameAsDelivery: false }));
                      }}
                    />
                    <CustomerCopy>
                      {method === "pickup" ? "PICKUP" : "DELIVERY"}
                    </CustomerCopy>
                  </label>
                ))}
              </fieldset>
              {pickup ? (
                <div className="b-co-billing-preview">
                  <strong>
                    <CustomerCopy>Pickup ·</CustomerCopy>{" "}
                    <CustomerCopy>{business.tradingName}</CustomerCopy>
                  </strong>
                  <p>{business.address}</p>
                  <p>
                    <CustomerCopy>
                      Your order will be ready for pickup at the selected date
                      and time.
                    </CustomerCopy>
                  </p>
                </div>
              ) : (
                <p className="b-caption">
                  <CustomerCopy>
                    Delivery — Included once minimum order is reached
                  </CustomerCopy>
                </p>
              )}
              {!pickup && (
                <>
                  <label>
                    <CustomerCopy>Delivery area</CustomerCopy>{" "}
                    <Select
                      required
                      disabled={config.addressVerificationRequired}
                      value={
                        areaMissing ? "__missing" : (delivery.zoneId ?? "")
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        setAreaMissing(v === "__missing");
                        set("zoneId", v === "__missing" ? "" : v);
                      }}
                    >
                      <option value="">
                        <CustomerCopy>Choose your area</CustomerCopy>
                      </option>
                      {config.zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name} <CustomerCopy>— Minimum AED</CustomerCopy>{" "}
                          {z.minOrderAed}
                        </option>
                      ))}
                      <option value="__missing">
                        <CustomerCopy>My area isn't listed</CustomerCopy>
                      </option>
                    </Select>
                  </label>
                  {areaMissing && (
                    <div className="b-shop-notice" role="status">
                      <p>
                        <CustomerCopy>
                          Online delivery isn't available for your area yet. Our
                          team can still help you on WhatsApp.
                        </CustomerCopy>
                      </p>
                      <WhatsAppCTA
                        unavailable={() => (location.href = "/contact")}
                        message="Hello 3L, could you help me check delivery coverage for my area?"
                      >
                        <CustomerCopy>ASK ABOUT COVERAGE</CustomerCopy>
                      </WhatsAppCTA>
                    </div>
                  )}
                  {quote && (
                    <div aria-live="polite">
                      {quote.eligible ? (
                        <>
                          <p className="b-caption">
                            <CustomerCopy>{`Minimum order for ${quote.zoneName} is ${formatAed(minFils)}.`}</CustomerCopy>
                          </p>
                        </>
                      ) : (
                        <p className="b-shop-notice" role="status">
                          <CustomerCopy>
                            {quote.minimumMet === false &&
                            quote.minOrderAed != null
                              ? `The minimum order for ${quote.zoneName ?? "this area"} is ${formatAed(minFils)}. Add ${formatAed(Math.max(0, minFils - quote.subtotalFils))} more to continue.`
                              : "Online delivery isn't available for this area yet."}
                          </CustomerCopy>{" "}
                          {quote.minimumMet === false && (
                            <a className="b-link" href="/cart">
                              <CustomerCopy>Edit cart</CustomerCopy>
                            </a>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
              <fieldset disabled={!pickup && areaMissing}>
                {!pickup && (
                  <>
                    <label>
                      <CustomerCopy>Street address and community</CustomerCopy>{" "}
                      {config.addressVerificationRequired ? (
                        <AddressAutocomplete
                          value={delivery.address ?? ""}
                          verified={!!delivery.addressRef}
                          onChange={(value) => set("address", value)}
                          onSelected={(result) => {
                            setError("");
                            setAddressNotice(
                              result.status === "VERIFIED"
                                ? `Verified address. Delivery area: ${result.name}. Minimum order: AED ${result.minOrderAed}.`
                                : "Coverage verified. We could not determine your delivery area. Contact 3L or choose pickup.",
                            );
                            setDelivery((d) => ({
                              ...d,
                              address: result.address,
                              building: result.building,
                              addressRef: result.addressRef,
                              zoneId: result.zoneId ?? "",
                            }));
                          }}
                        />
                      ) : (
                        <Input
                          required
                          minLength={5}
                          maxLength={300}
                          autoComplete="street-address"
                          value={delivery.address ?? ""}
                          onChange={(e) => set("address", e.target.value)}
                        />
                      )}
                    </label>
                    <div className="b-shop-row">
                      <label>
                        <CustomerCopy>Building or villa</CustomerCopy>{" "}
                        <Input
                          required
                          maxLength={120}
                          value={delivery.building ?? ""}
                          onChange={(e) => set("building", e.target.value)}
                        />
                      </label>
                      <label>
                        <CustomerCopy>Apartment or unit</CustomerCopy>{" "}
                        <span className="b-optional">
                          <CustomerCopy>(optional)</CustomerCopy>
                        </span>
                        <Input
                          maxLength={40}
                          value={delivery.unit ?? ""}
                          onChange={(e) => set("unit", e.target.value)}
                        />
                      </label>
                    </div>
                  </>
                )}
                <p className="b-shop-notice" role="status">
                  <CustomerCopy>
                    Orders for next-day production close at 9:00 PM Dubai time.
                  </CustomerCopy>
                  {nextDayClosed(now) && (
                    <>
                      <br />
                      <CustomerCopy>{`Next-day ordering is closed. Your earliest available date is ${new Date(`${earliestFulfillmentDate(now, leadHours(cartLines.map((l) => l.productId)))}T12:00:00+04:00`).toLocaleDateString(language, { timeZone: "Asia/Dubai", day: "numeric", month: "long", year: "numeric" })}.`}</CustomerCopy>
                    </>
                  )}
                </p>
                <div className="b-shop-row">
                  <label>
                    <CustomerCopy>
                      {pickup ? "Pickup date" : "Delivery date"}
                    </CustomerCopy>
                    <Input
                      required
                      type="date"
                      min={earliestFulfillmentDate(
                        now,
                        leadHours(cartLines.map((l) => l.productId)),
                      )}
                      max={config.dates.max}
                      value={delivery.date ?? ""}
                      onChange={(e) => {
                        set("date", e.target.value);
                        set("slot", "");
                      }}
                    />
                  </label>
                  {config.slots.length ? (
                    <label>
                      <CustomerCopy>
                        {pickup ? "Pickup time" : "Delivery time"}
                      </CustomerCopy>
                      <Select
                        required
                        value={delivery.slot ?? ""}
                        onChange={(e) => set("slot", e.target.value)}
                      >
                        <option value="">
                          <CustomerCopy>Choose a time</CustomerCopy>
                        </option>
                        {config.slots.map((s) => (
                          <option
                            key={s}
                            value={s}
                            disabled={
                              !validWindow(
                                delivery.date ?? "",
                                s,
                                now,
                                leadHours(cartLines.map((l) => l.productId)),
                              )
                            }
                          >
                            <CustomerCopy>{s}</CustomerCopy>
                          </option>
                        ))}
                      </Select>
                    </label>
                  ) : (
                    <label>
                      <CustomerCopy>
                        {pickup
                          ? "Preferred pickup time"
                          : "Preferred delivery time"}
                      </CustomerCopy>
                      <Input
                        required
                        maxLength={60}
                        placeholder={localize("e.g. afternoon, after 4 pm")}
                        value={delivery.slot ?? ""}
                        onChange={(e) => set("slot", e.target.value)}
                      />
                    </label>
                  )}
                </div>
                {!config.slots.length && (
                  <p className="b-caption">
                    <CustomerCopy>
                      Our team confirms the preferred time with you.
                    </CustomerCopy>
                  </p>
                )}
                {!pickup && (
                  <label>
                    <CustomerCopy>Delivery notes</CustomerCopy>{" "}
                    <span className="b-optional">
                      <CustomerCopy>(optional)</CustomerCopy>
                    </span>
                    <Textarea
                      rows={3}
                      maxLength={500}
                      placeholder={localize(
                        "Gate code, landmark, who will receive it",
                      )}
                      value={delivery.notes ?? ""}
                      onChange={(e) => set("notes", e.target.value)}
                    />
                  </label>
                )}
              </fieldset>
            </Card>
            {error && (
              <p role="alert">
                <CustomerCopy>{error}</CustomerCopy>
              </p>
            )}
            {addressNotice && (
              <p role="status">
                <CustomerCopy>{addressNotice}</CustomerCopy>
              </p>
            )}
            <div className="b-shop-actions">
              <Button
                type="submit"
                className="b-co-cta"
                disabled={
                  !quote?.eligible ||
                  (!pickup &&
                    (areaMissing ||
                      (config.addressVerificationRequired &&
                        !delivery.addressRef)))
                }
              >
                <CustomerCopy>
                  {addressBusy
                    ? config.addressVerificationRequired
                      ? "VERIFYING ADDRESS…"
                      : "CHECKING DELIVERY AREA…"
                    : "CONTINUE TO DETAILS"}
                </CustomerCopy>
              </Button>
              <a className="b-link" href="/cart">
                <ArrowLeft className="b-directional" aria-hidden />{" "}
                <CustomerCopy>Back to cart</CustomerCopy>
              </a>
            </div>
          </form>
        </div>
      </ShopShell>
    );

  if (step === 2) {
    const phoneOk = !!normalizeUaeMobile(customer.phone ?? "");
    return (
      <ShopShell step={2} title={localize("Your details")}>
        <div className="b-co-layout">
          {summary}
          <form
            className="b-shop-form b-co-main"
            onSubmit={(e) => {
              e.preventDefault();
              if (!phoneOk) {
                setError("Please enter a valid UAE mobile number.");
                return;
              }
              if (
                customer.whatsappNumber?.trim() &&
                !normalizeWhatsAppNumber(customer.whatsappNumber)
              ) {
                setError(
                  "Please include the country code in your WhatsApp number, for example +52.",
                );
                return;
              }
              if (!billingComplete(billing)) {
                setError("Please complete your billing address.");
                return;
              }
              setStep(3);
            }}
          >
            <Card title={localize("Contact details")} headingRef={heading}>
              <label>
                <CustomerCopy>Full name</CustomerCopy>{" "}
                <Input
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                  value={customer.name ?? ""}
                  onChange={(e) => setC("name", e.target.value)}
                />
              </label>
              <div className="b-shop-row">
                <label>
                  <CustomerCopy>Mobile number</CustomerCopy>{" "}
                  <Input
                    required
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="05X XXX XXXX"
                    aria-invalid={!!customer.phone && !phoneOk}
                    aria-describedby="b-phone-help"
                    value={customer.phone ?? ""}
                    onChange={(e) => setC("phone", e.target.value)}
                  />
                </label>
                <label>
                  <CustomerCopy>Email for payment receipt</CustomerCopy>{" "}
                  <Input
                    required
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    value={customer.email ?? ""}
                    onChange={(e) => setC("email", e.target.value)}
                  />
                </label>
              </div>
              <p id="b-phone-help" className="b-caption">
                <CustomerCopy>
                  A UAE mobile number, so our team can reach you.
                </CustomerCopy>
              </p>
              <label>
                <CustomerCopy>WhatsApp number (optional)</CustomerCopy>
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  maxLength={40}
                  placeholder="+52 55 1234 5678"
                  aria-describedby="b-whatsapp-help"
                  value={customer.whatsappNumber ?? ""}
                  onChange={(e) => setC("whatsappNumber", e.target.value)}
                />
              </label>
              <p id="b-whatsapp-help" className="b-caption">
                <CustomerCopy>
                  Add the WhatsApp number where we can contact you.
                  International numbers are welcome.
                </CustomerCopy>
              </p>
              <label>
                <CustomerCopy>Special instructions</CustomerCopy>{" "}
                <span className="b-optional">
                  <CustomerCopy>(optional)</CustomerCopy>
                </span>
                <Textarea
                  rows={3}
                  maxLength={500}
                  placeholder={localize(
                    "A message for the cake, allergies to mention, anything we should know",
                  )}
                  value={customer.instructions ?? ""}
                  onChange={(e) => setC("instructions", e.target.value)}
                />
              </label>
            </Card>
            <Card title={localize("Billing address")}>
              {!pickup && (
                <label className="b-check b-co-toggle">
                  <input
                    type="checkbox"
                    checked={!pickup && billing.sameAsDelivery}
                    disabled={pickup}
                    onChange={(e) => setB("sameAsDelivery", e.target.checked)}
                  />
                  <span>
                    <CustomerCopy>
                      Billing address is the same as delivery address
                    </CustomerCopy>
                  </span>
                </label>
              )}
              {pickup && (
                <p className="b-caption">
                  <CustomerCopy>
                    Your billing address is required for payment. No delivery
                    address is needed.
                  </CustomerCopy>
                </p>
              )}
              {billing.sameAsDelivery ? (
                <p className="b-caption b-co-address-preview">
                  <bdi>
                    {billingLines(
                      billing,
                      delivery as Delivery,
                      customer.name ?? "",
                    )
                      .filter(Boolean)
                      .join(", ")}
                  </bdi>
                </p>
              ) : (
                <fieldset className="b-shop-billing">
                  <legend className="b-visually-hidden">
                    <CustomerCopy>Billing address</CustomerCopy>
                  </legend>
                  <label>
                    <CustomerCopy>Name on billing address</CustomerCopy>{" "}
                    <Input
                      required
                      maxLength={100}
                      autoComplete="billing name"
                      value={billing.name ?? ""}
                      onChange={(e) => setB("name", e.target.value)}
                    />
                  </label>
                  <label>
                    <CustomerCopy>Address line 1</CustomerCopy>{" "}
                    <Input
                      required
                      maxLength={200}
                      autoComplete="billing address-line1"
                      value={billing.address1 ?? ""}
                      onChange={(e) => setB("address1", e.target.value)}
                    />
                  </label>
                  <label>
                    <CustomerCopy>Address line 2</CustomerCopy>{" "}
                    <span className="b-optional">
                      <CustomerCopy>(optional)</CustomerCopy>
                    </span>
                    <Input
                      maxLength={300}
                      autoComplete="billing address-line2"
                      value={billing.address2 ?? ""}
                      onChange={(e) => setB("address2", e.target.value)}
                    />
                  </label>
                  <div className="b-shop-row">
                    <label>
                      <CustomerCopy>City</CustomerCopy>{" "}
                      <Input
                        required
                        maxLength={100}
                        autoComplete="billing address-level2"
                        value={billing.city ?? ""}
                        onChange={(e) => setB("city", e.target.value)}
                      />
                    </label>
                    <label>
                      <CustomerCopy>Postal code</CustomerCopy>{" "}
                      <span className="b-optional">
                        <CustomerCopy>(optional)</CustomerCopy>
                      </span>
                      <Input
                        maxLength={20}
                        autoComplete="billing postal-code"
                        value={billing.zip ?? ""}
                        onChange={(e) => setB("zip", e.target.value)}
                      />
                    </label>
                  </div>
                  <label>
                    <CustomerCopy>Country</CustomerCopy>{" "}
                    <Select
                      required
                      autoComplete="billing country"
                      value={billing.country ?? ""}
                      onChange={(e) => setB("country", e.target.value)}
                    >
                      <option value="">
                        <CustomerCopy>Choose a country</CustomerCopy>
                      </option>
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {countryName(c.code)}
                        </option>
                      ))}
                    </Select>
                  </label>
                </fieldset>
              )}
            </Card>
            {error && (
              <p role="alert">
                <CustomerCopy>{error}</CustomerCopy>
              </p>
            )}
            <div className="b-shop-actions">
              <Button type="submit" className="b-co-cta">
                <CustomerCopy>REVIEW ORDER</CustomerCopy>
              </Button>
              <button
                type="button"
                className="b-link"
                onClick={() => setStep(1)}
              >
                <ArrowLeft className="b-directional" aria-hidden />{" "}
                <CustomerCopy>Back to delivery</CustomerCopy>
              </button>
            </div>
          </form>
        </div>
      </ShopShell>
    );
  }

  return (
    <PaymentStep
      config={config}
      lines={cartLines}
      fulfillmentMethod={fulfillmentMethod}
      delivery={delivery as Delivery}
      customer={customer as Customer}
      billing={billing}
      quote={quote}
      subtotal={subtotal}
      back={() => setStep(2)}
      backToDelivery={() => setStep(1)}
    />
  );
}

/** Resolve this cart on the server before reusing a session checkout. */
async function heldCheckout(checkout: unknown): Promise<Status | null> {
  let saved: { key?: string } | null = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(CAPABILITY) ?? "null");
  } catch {
    return null;
  }
  if (!saved?.key) return null;
  const result = await post<{
    key: string;
    cartHash: string;
    changed: boolean;
    status?: Status;
  }>("/api/checkout/resume", { key: saved.key, checkout });
  if (!result.status) {
    sessionStorage.setItem(
      CAPABILITY,
      JSON.stringify({ key: result.key, cartHash: result.cartHash }),
    );
    return null;
  }
  const status = result.status;
  return status.actionRequired === "review_payment" ||
    [
      "creating",
      "pending",
      "authorized",
      "pending_confirmation",
      "paid",
    ].includes(status.paymentStatus)
    ? status
    : null;
}

/** Accepted card marks: the official, unmodified files on white tiles. */
function CardMarks() {
  const { text: localize } = useCustomerLanguage();

  return (
    <ul className="b-co-marks" aria-label={localize("Accepted cards")}>
      <li>
        <img
          src="/payments/visa.svg"
          alt={localize("Visa")}
          width="40"
          height="24"
        />
      </li>
      <li>
        <img
          src="/payments/mastercard.svg"
          alt={localize("Mastercard")}
          width="34"
          height="24"
        />
      </li>
    </ul>
  );
}
/** A customer payment state as a calm, self-contained panel. */
function StateNotice({
  state,
  title,
  message,
  detail,
  children,
}: {
  state: CustomerPaymentState;
  title?: string;
  message: string;
  detail?: string;
  children?: ReactNode;
}) {
  const Icon =
    state === "PAID"
      ? CheckCircle
      : state === "DECLINED" || state === "FAILED"
        ? WarningCircle
        : state === "HELD_FOR_REVIEW"
          ? HourglassMedium
          : ShieldCheck;
  return (
    <div className={`b-co-state b-co-state-${state.toLowerCase()}`}>
      <span className="b-co-state-icon" aria-hidden>
        {state === "PROCESSING" || state === "3DS_REDIRECT" ? (
          <span className="b-co-spinner" />
        ) : (
          <Icon weight="duotone" />
        )}
      </span>
      <div>
        {title && (
          <p className="b-co-state-title">
            <CustomerCopy>{title}</CustomerCopy>
          </p>
        )}
        <p>
          <CustomerCopy>{message}</CustomerCopy>
        </p>
        {detail && (
          <p className="b-co-state-detail">
            <CustomerCopy>{detail}</CustomerCopy>
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

function PaymentStep({
  fulfillmentMethod,
  config,
  lines,
  delivery,
  customer,
  billing,
  quote,
  back,
  backToDelivery,
}: {
  fulfillmentMethod: "delivery" | "pickup";
  config: CheckoutConfig;
  lines: CartLine[];
  delivery: Delivery;
  customer: Customer;
  billing: Billing;
  quote: Quote | null;
  subtotal: number;
  back: () => void;
  backToDelivery: () => void;
}) {
  const { text: localize } = useCustomerLanguage();

  const [reviewed, setReviewed] = useState(false);
  const [held, setHeld] = useState<Status | null>(null);
  const [checkingPrevious, setCheckingPrevious] = useState(true);
  const [busy, setBusy] = useState(false);
  /** Set just before the page navigates away, so the button stays locked. */
  const [leaving, setLeaving] = useState<CustomerPaymentState | null>(null);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const pickup = fulfillmentMethod === "pickup";
  const zone = pickup
    ? undefined
    : config.zones.find((z) => z.id === delivery.zoneId);
  const body = {
    lines,
    fulfillmentMethod,
    ...(pickup
      ? { pickup: { pickupDate: delivery.date, preferredTime: delivery.slot } }
      : {
          delivery: {
            ...delivery,
            unit: delivery.unit || undefined,
            notes: delivery.notes || undefined,
          },
        }),
    customer: {
      ...customer,
      whatsappNumber: customer.whatsappNumber?.trim()
        ? (normalizeWhatsAppNumber(customer.whatsappNumber) ?? undefined)
        : undefined,
      instructions: customer.instructions || undefined,
    },
    billing: billing.sameAsDelivery
      ? { sameAsDelivery: true }
      : {
          sameAsDelivery: false,
          name: billing.name,
          address1: billing.address1,
          address2: billing.address2 || undefined,
          city: billing.city,
          zip: billing.zip || undefined,
          country: billing.country,
        },
  };

  const cartContext = JSON.stringify(body);
  useEffect(() => {
    let active = true;
    setCheckingPrevious(true);
    setHeld(null);
    void heldCheckout(JSON.parse(cartContext))
      .then((previous) => {
        if (active) setHeld(previous);
      })
      .catch((err: unknown) => {
        if (active)
          setError(
            err instanceof Error ? err.message : "Unable to verify checkout.",
          );
      })
      .finally(() => {
        if (active) setCheckingPrevious(false);
      });
    return () => {
      active = false;
    };
  }, [cartContext]);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewed || inFlight.current || checkingPrevious) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      // Same details → same idempotency key → the same order and payment.
      const fingerprint = JSON.stringify(body);
      const previous = await heldCheckout(body);
      if (previous) {
        setHeld(previous);
        inFlight.current = false;
        setBusy(false);
        return;
      }
      const saved = JSON.parse(sessionStorage.getItem(CAPABILITY) ?? "null");
      const key =
        saved?.key && (!saved.fingerprint || saved.fingerprint === fingerprint)
          ? saved.key
          : crypto.randomUUID();
      sessionStorage.setItem(CAPABILITY, JSON.stringify({ key, fingerprint }));
      const result = await post<Status>("/api/checkout/web", body, key);
      if (result.paymentStatus === "paid") {
        cart.clear();
        setLeaving("PAID");
        location.assign("/checkout/return");
        return;
      }
      if (result.actionRequired === "review_payment") {
        setLeaving("HELD_FOR_REVIEW");
        location.assign("/checkout/return");
        return;
      }
      setLeaving("PROCESSING");
      location.assign(result.url ?? "/checkout/return");
    } catch (err) {
      inFlight.current = false;
      setBusy(false);
      setError(err instanceof Error ? err.message : "Please try again.");
    }
  }
  const total = quote?.eligible ? quote.totalFils : null;
  const locked = busy || !!leaving || checkingPrevious;
  const issue = error ? paymentStateOfError(error) : null;
  const edit = (onClick: () => void, label: string) => (
    <button
      type="button"
      className="b-co-edit"
      onClick={onClick}
      aria-label={localize(label)}
    >
      <CustomerCopy>Edit</CustomerCopy>
    </button>
  );
  return (
    <ShopShell step={3} title={localize("Review and pay")}>
      <div className="b-co-layout">
        <OrderSummary
          lines={lines}
          config={config}
          fulfillmentMethod={fulfillmentMethod}
          subtotal={quote?.subtotalFils ?? 0}
          fee={quote?.feeFils ?? null}
          total={total}
        />
        <div className="b-co-main">
          <section
            className="b-co-card b-co-review"
            aria-label={localize("Order review")}
          >
            <div className="b-co-review-row">
              <h2>
                <CustomerCopy>Your order</CustomerCopy>
              </h2>
              <ul className="b-co-review-items">
                {lines.map((l) => {
                  const p = config.products.find((p) => p.id === l.productId);
                  return p ? (
                    <li key={l.productId}>
                      <CustomerCopy>{p.name}</CustomerCopy>{" "}
                      <span className="b-caption">× {l.quantity}</span>
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
            <div className="b-co-review-row">
              <h2>
                <CustomerCopy>{pickup ? "Pickup" : "Delivery"}</CustomerCopy>
              </h2>
              <p>
                <bdi>{longDate(delivery.date)}</bdi> ·{" "}
                <CustomerCopy>{delivery.slot}</CustomerCopy>
                <br />
                <bdi>
                  {pickup
                    ? `${business.tradingName} · ${business.address}`
                    : [
                        delivery.unit && `Unit ${delivery.unit}`,
                        delivery.building,
                        delivery.address,
                        zone?.name,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                </bdi>
                {!pickup && delivery.notes && (
                  <>
                    <br />
                    <span className="b-caption">
                      <bdi>{delivery.notes}</bdi>
                    </span>
                  </>
                )}
              </p>
              {edit(backToDelivery, pickup ? "Edit pickup" : "Edit delivery")}
            </div>
            <div className="b-co-review-row">
              <h2>
                <CustomerCopy>Contact</CustomerCopy>
              </h2>
              <p>
                <bdi>{customer.name}</bdi> ·{" "}
                <bdi dir="ltr">
                  {normalizeUaeMobile(customer.phone) ?? customer.phone}
                </bdi>
                {customer.whatsappNumber && (
                  <>
                    <br /> <CustomerCopy>WhatsApp:</CustomerCopy>{" "}
                    <bdi dir="ltr">
                      {normalizeWhatsAppNumber(customer.whatsappNumber)}
                    </bdi>
                  </>
                )}
                {customer.email && (
                  <>
                    <br />
                    <bdi dir="ltr">{customer.email}</bdi>
                  </>
                )}
              </p>
              {edit(back, "Edit contact details")}
            </div>
            <div className="b-co-review-row">
              <h2>
                <CustomerCopy>Billing address</CustomerCopy>
              </h2>
              <p>
                {billing.sameAsDelivery && (
                  <>
                    <span className="b-caption">
                      <CustomerCopy>Same as delivery address</CustomerCopy>
                    </span>
                    <br />
                  </>
                )}
                <bdi>
                  {billingLines(billing, delivery, customer.name)
                    .filter(Boolean)
                    .join(", ")}
                </bdi>
              </p>
              {edit(back, "Edit billing address")}
            </div>
          </section>
          {held ? (
            <div className="b-co-card" role="alert">
              {held.paymentStatus === "paid" ? (
                <StateNotice
                  state="PAID"
                  title={localize("This order is already paid")}
                  message={`Order ${held.orderId} from this visit is already paid.`}
                />
              ) : (
                <StateNotice
                  state="HELD_FOR_REVIEW"
                  {...stateCopy("HELD_FOR_REVIEW")}
                  detail={`Order ${held.orderId}. We'll confirm it, or contact us with your order number.`}
                />
              )}
              <a className="b-button b-co-cta" href="/checkout/return">
                <CustomerCopy>
                  {held.paymentStatus === "paid"
                    ? "VIEW CONFIRMATION"
                    : "CHECK PAYMENT STATUS"}
                </CustomerCopy>
              </a>
            </div>
          ) : total == null ? (
            <p className="b-shop-notice" role="alert">
              <CustomerCopy>
                Your order can no longer be delivered as chosen. Please go back
                and review your delivery area.
              </CustomerCopy>
            </p>
          ) : (
            <form
              className="b-shop-form b-co-card b-co-payment"
              onSubmit={pay}
              aria-busy={locked}
            >
              <header>
                <h2>
                  <CustomerCopy>Payment</CustomerCopy>
                </h2>
                <CardMarks />
              </header>
              <p className="b-caption">
                <CustomerCopy>
                  Continue to Paymennt’s secure payment page to complete your
                  order.
                </CustomerCopy>
              </p>
              <label className="b-check">
                <input
                  type="checkbox"
                  checked={reviewed}
                  disabled={locked}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                <span>
                  <CustomerCopy>
                    I've reviewed my order, fulfillment details and total, and I
                    accept the
                  </CustomerCopy>{" "}
                  <a href="/terms">
                    <CustomerCopy>terms</CustomerCopy>
                  </a>
                  ,{" "}
                  <a href="/refund-policy">
                    <CustomerCopy>refund policy</CustomerCopy>
                  </a>{" "}
                  <CustomerCopy>and</CustomerCopy>{" "}
                  <a href="/privacy">
                    <CustomerCopy>privacy policy</CustomerCopy>
                  </a>
                  .
                </span>
              </label>
              {locked && (
                <div role="status" aria-live="polite">
                  <StateNotice
                    state={leaving ?? "PROCESSING"}
                    {...(leaving === "3DS_REDIRECT"
                      ? stateCopy("3DS_REDIRECT")
                      : leaving === "HELD_FOR_REVIEW"
                        ? stateCopy("HELD_FOR_REVIEW")
                        : {
                            title: "Processing your payment…",
                            message:
                              "Please don't close or refresh this page, or pay again.",
                          })}
                  />
                </div>
              )}
              {error && (
                <div role="alert">
                  {issue ? (
                    <StateNotice
                      state={issue}
                      {...stateCopy(issue)}
                      detail={issue === "DECLINED" ? error : undefined}
                    >
                      {issue === "HELD_FOR_REVIEW" && (
                        <a className="b-link" href="/checkout/return">
                          <CustomerCopy>Check payment status</CustomerCopy>
                        </a>
                      )}
                    </StateNotice>
                  ) : (
                    <p className="b-co-error">
                      <CustomerCopy>{error}</CustomerCopy>{" "}
                      <a className="b-link" href="/checkout/return">
                        <CustomerCopy>Check payment status</CustomerCopy>
                      </a>
                    </p>
                  )}
                </div>
              )}
              {issue !== "HELD_FOR_REVIEW" && (
                <Button
                  type="submit"
                  className="b-co-cta b-co-pay"
                  disabled={locked || !reviewed}
                >
                  {locked ? (
                    <>
                      <span className="b-co-spinner" aria-hidden />{" "}
                      <CustomerCopy>PROCESSING…</CustomerCopy>
                    </>
                  ) : (
                    <CustomerCopy>{`PAY ${formatAed(total)}`}</CustomerCopy>
                  )}
                </Button>
              )}
              <p className="b-co-assurance">
                <LockSimple aria-hidden weight="bold" />{" "}
                <CustomerCopy>
                  Your card details are entered on Paymennt and are never seen
                  or stored by 3L.
                </CustomerCopy>
              </p>
            </form>
          )}
        </div>
      </div>
    </ShopShell>
  );
}

// ── Confirmation ─────────────────────────────────────────────────────────

/**
 * Confirmation and 3DS return. The URL carries no authority: status always
 * comes from the server's reconciled record, which asks the provider directly.
 */
export function CheckoutReturn() {
  const { text: localize } = useCustomerLanguage();

  const [result, setResult] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function poll() {
      try {
        const saved = JSON.parse(sessionStorage.getItem(CAPABILITY) ?? "null");
        if (!saved?.key)
          throw Error(
            "We can't find a checkout in this browser. If you placed an order, please contact us.",
          );
        const data = await post<Status>("/api/checkout/reconcile", {
          key: saved.key,
        });
        if (!active) return;
        setResult(data);
        setError("");
        if (
          data.paymentStatus === "paid" &&
          PAID_STATES.includes(data.status)
        ) {
          cart.clear();
          try {
            sessionStorage.removeItem(DRAFT);
          } catch {
            /* ignore */
          }
          return;
        }
        if (
          [
            "creating",
            "pending",
            "authorized",
            "pending_confirmation",
          ].includes(data.paymentStatus) &&
          !data.actionRequired &&
          attempts++ < 30
        )
          timer = setTimeout(poll, 4000);
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Unable to check your payment.",
          );
      }
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [revision]);

  const state = result ? paymentStateOf(result) : null;
  if (result && state === "PAID") return <Confirmation result={result} />;
  const copy = state
    ? stateCopy(state, result?.paymentStatus)
    : error
      ? {
          title: "We couldn't load your payment",
          message: "Please check again in a moment, or contact us.",
        }
      : stateCopy("PROCESSING");
  return (
    <ShopShell step={3} title={localize(copy.title)} bare>
      <div className="b-co-status">
        <h1>
          <CustomerCopy>{copy.title}</CustomerCopy>
        </h1>
        <div role="status" aria-live="polite">
          <StateNotice
            state={state ?? (error ? "FAILED" : "PROCESSING")}
            message={copy.message}
            detail={copy.detail}
          />
        </div>
        {result && (
          <dl className="b-shop-receipt">
            <div>
              <dt>
                <CustomerCopy>Order number</CustomerCopy>
              </dt>
              <dd>
                <bdi>{result.orderId}</bdi>
              </dd>
            </div>
            <div>
              <dt>
                <CustomerCopy>Amount</CustomerCopy>
              </dt>
              <dd>
                <CustomerCopy>{formatAed(result.amountFils)}</CustomerCopy>
              </dd>
            </div>
          </dl>
        )}
        {error && (
          <p role="alert">
            <CustomerCopy>{error}</CustomerCopy>
          </p>
        )}
        <div className="b-shop-actions">
          {(state === "3DS_REDIRECT" || state === "HOSTED_REDIRECT") &&
            result?.url && (
              <a className="b-button b-co-cta" href={result.url}>
                <CustomerCopy>CONTINUE PAYMENT</CustomerCopy>
              </a>
            )}
          {(state === "DECLINED" || state === "FAILED") && (
            <a className="b-button b-co-cta" href="/checkout">
              <CustomerCopy>TRY AGAIN</CustomerCopy>
            </a>
          )}
          {state === "READY" && (
            <a className="b-button b-co-cta" href="/checkout">
              <CustomerCopy>RETURN TO CHECKOUT</CustomerCopy>
            </a>
          )}
          {(state === "PROCESSING" ||
            state === "HELD_FOR_REVIEW" ||
            (!state && error)) && (
            <Button
              className="b-co-cta"
              onClick={() => setRevision((n) => n + 1)}
            >
              <CustomerCopy>CHECK AGAIN</CustomerCopy>
            </Button>
          )}
          <SupportLink orderId={result?.orderId} />
        </div>
      </div>
    </ShopShell>
  );
}

/** Secondary help route: Liza's support WhatsApp. Never required to order. */
function SupportLink({ orderId }: { orderId?: string }) {
  return (
    <WhatsAppCTA
      className="b-co-support"
      unavailable={() => (location.href = "/contact")}
      message={
        orderId
          ? `Hello 3L, I have a question about my order ${orderId}.`
          : "Hello 3L, I have a question about my order."
      }
    >
      <CustomerCopy>Contact Pastelerías 3L</CustomerCopy>
    </WhatsAppCTA>
  );
}

/** Shown only for an authoritative, reconciled PAID order (see paymentStateOf). */
function Confirmation({ result }: { result: Status }) {
  const { text: localize, language } = useCustomerLanguage();

  const s = result.summary;
  const name = firstName(s?.customerName);
  const progress =
    result.summary?.fulfillmentMethod === "pickup" && result.status === "Ready"
      ? 2
      : fulfilmentStep(result.status);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <ShopShell step={4} title={localize("Thank you")} bare>
      <div className="b-co-confirm">
        <header className="b-co-confirm-hero">
          <span className="b-co-confirm-mark" aria-hidden>
            <Check weight="bold" />
          </span>
          <h1 ref={heading} tabIndex={-1}>
            <CustomerCopy>Thank you</CustomerCopy>
            {name && (
              <>
                {language === "ar" ? "، " : ", "}
                <bdi>{name}</bdi>
              </>
            )}
          </h1>
          <p className="b-co-confirm-lede" role="status">
            <CustomerCopy>Your order is confirmed</CustomerCopy>
          </p>
          <dl className="b-co-confirm-keys">
            <div>
              <dt>
                <CustomerCopy>Order</CustomerCopy>
              </dt>
              <dd>
                <bdi>{result.orderId}</bdi>
              </dd>
            </div>
            <div>
              <dt>
                <CustomerCopy>Paid</CustomerCopy>
              </dt>
              <dd>
                <CustomerCopy>{formatAed(result.amountFils)}</CustomerCopy>
              </dd>
            </div>
          </dl>
        </header>

        <div className="b-co-confirm-grid">
          {s && (
            <section className="b-co-card" aria-labelledby="b-conf-order">
              <header>
                <h2 id="b-conf-order">
                  <CustomerCopy>Order</CustomerCopy>
                </h2>
              </header>
              <ul className="b-co-summary-items">
                {s.items.map((i) => (
                  <li key={i.productId}>
                    <span className="b-co-thumb-wrap">
                      <Thumb productId={i.productId} name={i.name} />
                      <span className="b-co-thumb-qty" aria-hidden>
                        {i.quantity}
                      </span>
                    </span>
                    <span>
                      <strong>
                        <CustomerCopy>{i.name}</CustomerCopy>
                      </strong>
                      <span className="b-caption">
                        <CustomerCopy>Quantity</CustomerCopy> {i.quantity}
                      </span>
                    </span>
                    <span className="b-co-money">
                      <CustomerCopy>{formatAed(i.lineFils)}</CustomerCopy>
                    </span>
                  </li>
                ))}
              </ul>
              <Totals
                subtotal={s.subtotalFils}
                fulfillmentMethod={s.fulfillmentMethod}
                fee={s.feeFils}
                total={result.amountFils}
              />
            </section>
          )}
          {s?.pickup && (
            <section className="b-co-card">
              <h2>
                <CustomerCopy>Pickup</CustomerCopy>
              </h2>
              <p>
                <CustomerCopy>{business.tradingName}</CustomerCopy>
                <br />
                {business.address}
              </p>
              <p>
                <bdi>{longDate(s.pickup.pickupDate)}</bdi> ·{" "}
                <CustomerCopy>{s.pickup.preferredTime}</CustomerCopy>
              </p>
              <p>
                <CustomerCopy>
                  Your order will be ready for pickup at the selected date and
                  time.
                </CustomerCopy>
              </p>
            </section>
          )}
          {s?.delivery && (
            <section className="b-co-card" aria-labelledby="b-conf-delivery">
              <header>
                <h2 id="b-conf-delivery">
                  <CustomerCopy>Delivery</CustomerCopy>
                </h2>
              </header>
              <dl className="b-shop-receipt b-co-facts">
                {s.delivery.zoneName && (
                  <div>
                    <dt>
                      <CustomerCopy>Zone</CustomerCopy>
                    </dt>
                    <dd>
                      <bdi>{s.delivery.zoneName}</bdi>
                    </dd>
                  </div>
                )}
                <div>
                  <dt>
                    <CustomerCopy>Address</CustomerCopy>
                  </dt>
                  <dd>
                    <bdi>
                      {[
                        s.delivery.unit,
                        s.delivery.building,
                        s.delivery.address,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </bdi>
                  </dd>
                </div>
                <div>
                  <dt>
                    <CustomerCopy>Date</CustomerCopy>
                  </dt>
                  <dd>
                    <bdi>{longDate(s.delivery.date)}</bdi>
                  </dd>
                </div>
                <div>
                  <dt>
                    <CustomerCopy>Preferred time</CustomerCopy>
                  </dt>
                  <dd>
                    <CustomerCopy>{s.delivery.slot}</CustomerCopy>
                  </dd>
                </div>
              </dl>
            </section>
          )}
          <section className="b-co-card" aria-labelledby="b-conf-payment">
            <header>
              <h2 id="b-conf-payment">
                <CustomerCopy>Payment</CustomerCopy>
              </h2>
            </header>
            <dl className="b-shop-receipt b-co-facts">
              <div>
                <dt>
                  <CustomerCopy>Status</CustomerCopy>
                </dt>
                <dd className="b-co-paid">
                  <CustomerCopy>Paid</CustomerCopy>{" "}
                  <Check aria-label={localize("confirmed")} weight="bold" />
                </dd>
              </div>
              <div>
                <dt>
                  <CustomerCopy>Amount</CustomerCopy>
                </dt>
                <dd>
                  <CustomerCopy>{formatAed(result.amountFils)}</CustomerCopy>
                </dd>
              </div>
              <div>
                <dt>
                  <CustomerCopy>Method</CustomerCopy>
                </dt>
                <dd>
                  <CustomerCopy>Card</CustomerCopy>
                </dd>
              </div>
              <div>
                <dt>
                  <CustomerCopy>Reference</CustomerCopy>
                </dt>
                <dd>
                  <bdi>{result.orderId}</bdi>
                </dd>
              </div>
            </dl>
          </section>
          <section
            className="b-co-card b-co-next"
            aria-labelledby="b-conf-next"
          >
            <header>
              <h2 id="b-conf-next">
                <CustomerCopy>What happens next</CustomerCopy>
              </h2>
            </header>
            <ol className="b-co-timeline">
              {(s?.fulfillmentMethod === "pickup"
                ? ["Confirmed", "Preparing", "Ready for pickup", "Collected"]
                : FULFILMENT_STEPS
              ).map((label, i) => (
                <li
                  key={label}
                  className={
                    i < progress ? "done" : i === progress ? "current" : ""
                  }
                  aria-current={i === progress ? "step" : undefined}
                >
                  <span className="b-co-dot" aria-hidden>
                    {i <= progress ? <Check weight="bold" /> : i + 1}
                  </span>
                  <CustomerCopy>{label}</CustomerCopy>
                </li>
              ))}
            </ol>
            <p className="b-caption">
              <CustomerCopy>
                You don't need to message us — our team is preparing your order
                and will contact you if anything about the fulfillment needs
                confirming.
              </CustomerCopy>
            </p>
          </section>
        </div>
        <div className="b-shop-actions b-co-confirm-actions">
          <a className="b-button b-co-cta" href="/">
            <CustomerCopy>BACK TO 3L</CustomerCopy>
          </a>
          <SupportLink orderId={result.orderId} />
        </div>
      </div>
    </ShopShell>
  );
}
