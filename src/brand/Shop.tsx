import { business } from "./business";
import { menuFamilyForSku } from "./menu";
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
  zoneId: string;
  address: string;
  building: string;
  unit?: string;
  date: string;
  slot: string;
  notes?: string;
};
type Customer = {
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
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
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
  if (/mínimo/i.test(message))
    return "Your order is below the minimum for this delivery area.";
  if (/pendiente de revisión|Regla pendiente/i.test(message))
    return "Online delivery isn't available for this area yet.";
  if (/catálogo/i.test(message))
    return "An item in your cart is no longer available.";
  if (/[áéíóúñ¿]/i.test(message))
    return "Something went wrong. Please try again.";
  return message;
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
    ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      })
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
  return (
    <nav className="b-co-progress" aria-label="Checkout progress">
      <p className="b-co-progress-count" aria-hidden>
        Step {step + 1} of {STEPS.length} · <strong>{STEPS[step]}</strong>
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
            <span className="b-co-step-label">{label}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
/** Checkout keeps its own compact header: logo, a secure-checkout cue, no menu. */
function CheckoutHeader() {
  return (
    <header className="b-co-header">
      <a href="/" className="b-co-logo" aria-label="Pastelerías 3L · Home">
        <Logo />
      </a>
      <p className="b-co-secure">
        <LockSimple aria-hidden weight="bold" />
        Secure checkout
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
        Skip to content
      </a>
      <CheckoutHeader />
      <main id="main-content" className="b-shop-main">
        <Progress step={step} />
        {!bare && <h1>{title}</h1>}
        {children}
      </main>
      <SiteFooter onContactUnavailable={toContact} />
    </div>
  );
}
function Totals({
  subtotal,
  fee,
  total,
  feePending,
  fulfillmentMethod = "delivery",
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
        <dt>Subtotal</dt>
        <dd>{formatAed(subtotal)}</dd>
      </div>
      <div>
        <dt>{fulfillmentMethod === "pickup" ? "Pickup" : "Delivery"}</dt>
        <dd>
          {fee === 0
            ? "Free"
            : fee != null
              ? formatAed(fee)
              : feePending
                ? "Calculated at delivery"
                : "—"}
        </dd>
      </div>
      {total != null && (
        <div className="b-shop-grand">
          <dt>Total</dt>
          <dd>{formatAed(total)}</dd>
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
          {title}
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
  const [open, setOpen] = useState(false);
  const count = lines.reduce((n, l) => n + l.quantity, 0);
  return (
    <aside className="b-co-summary" aria-label="Order summary">
      <button
        type="button"
        className="b-co-summary-toggle"
        aria-expanded={open}
        aria-controls="b-co-summary-body"
        onClick={() => setOpen((o) => !o)}
      >
        <span>
          {open ? "Hide" : "Show"} order summary
          <CaretDown aria-hidden weight="bold" />
        </span>
        <strong>{formatAed(total ?? subtotal)}</strong>
      </button>
      <div
        id="b-co-summary-body"
        className="b-co-summary-body"
        data-open={open}
      >
        <h2>
          Your order{" "}
          <span className="b-caption">
            {count} item{count === 1 ? "" : "s"}
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
                  <strong>{p.name}</strong>
                  <span className="b-caption">
                    {formatAed(p.priceFils)} × {l.quantity}
                  </span>
                </span>
                <span className="b-co-money">
                  {formatAed(p.priceFils * l.quantity)}
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
        Online ordering is not available right now. Our team is happy to take
        your order on WhatsApp.
      </p>
      <WhatsAppCTA
        unavailable={() => (location.href = "/contact")}
        message="Hello 3L, I'd like to place an order."
      >
        ORDER VIA WHATSAPP
      </WhatsAppCTA>
      {retry && (
        <button className="b-link" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
function EmptyCart() {
  return (
    <div className="b-shop-panel b-co-empty">
      <p>Your cart is empty.</p>
      <a className="b-button" href="/#bakery">
        BROWSE THE COLLECTION
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
      <div className="b-qty" role="group" aria-label="Quantity">
        <button
          type="button"
          aria-label="Decrease quantity"
          disabled={quantity <= 1}
          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
        >
          <Minus aria-hidden />
        </button>
        <output aria-live="polite">{quantity}</output>
        <button
          type="button"
          aria-label="Increase quantity"
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
        ADD TO CART · {formatAed(product.priceFils * quantity)}
      </Button>
      {(added || inCart > 0) && (
        <a className="b-link" href="/cart" aria-live="polite">
          {inCart} in your cart · View cart
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
  return (
    <ul className="b-co-items">
      {lines.map((l) => {
        const p = config.products.find((p) => p.id === l.productId);
        if (!p)
          return (
            <li key={l.productId} className="b-cart-unavailable">
              <span>This item is no longer available.</span>
              <button
                className="b-link"
                onClick={() => cart.remove(l.productId)}
              >
                Remove
              </button>
            </li>
          );
        return (
          <li key={l.productId} className="b-co-item">
            <Thumb productId={p.id} name={p.name} />
            <div className="b-co-item-copy">
              <strong>{p.name}</strong>
              {p.description && (
                <span className="b-caption">{p.description}</span>
              )}
              <span className="b-caption">{formatAed(p.priceFils)} each</span>
            </div>
            <div
              className="b-qty"
              role="group"
              aria-label={`${p.name} quantity`}
            >
              <button
                type="button"
                aria-label={`Decrease ${p.name}`}
                onClick={() => cart.set(l.productId, l.quantity - 1)}
              >
                <Minus aria-hidden />
              </button>
              <output>{l.quantity}</output>
              <button
                type="button"
                aria-label={`Increase ${p.name}`}
                disabled={l.quantity >= MAX_QTY}
                onClick={() => cart.set(l.productId, l.quantity + 1)}
              >
                <Plus aria-hidden />
              </button>
            </div>
            <span className="b-co-money b-co-item-total">
              {formatAed(p.priceFils * l.quantity)}
            </span>
            <button
              type="button"
              className="b-cart-remove"
              aria-label={`Remove ${p.name}`}
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
  const lines = useCart();
  const { config, loading, retry } = useCheckoutConfig();
  if (loading)
    return (
      <ShopShell step={0} title="Your cart">
        <p role="status">Loading your cart…</p>
      </ShopShell>
    );
  if (!config || !config.products.length)
    return (
      <ShopShell step={0} title="Your cart">
        <Unavailable retry={retry} />
      </ShopShell>
    );
  const known = lines.filter((l) =>
    config.products.some((p) => p.id === l.productId),
  );
  const subtotal = cartSubtotalFils(lines, config.products);
  return (
    <ShopShell step={0} title="Your cart">
      {lines.length === 0 ? (
        <EmptyCart />
      ) : (
        <div className="b-co-layout">
          <div className="b-co-main">
            <CartItems lines={lines} config={config} />
            <div className="b-co-inline-links">
              <a className="b-link" href="/#bakery">
                <ArrowLeft aria-hidden /> Continue shopping
              </a>
              <button className="b-link" onClick={() => cart.clear()}>
                Clear cart
              </button>
            </div>
          </div>
          <aside className="b-co-summary b-co-summary-static">
            <div className="b-co-summary-body" data-open>
              <h2>Order total</h2>
              <Totals subtotal={subtotal} fee={null} total={null} feePending />
              <p className="b-caption">
                Delivery is included once your area’s minimum order is reached
                and are confirmed in the next step.
              </p>
              <a
                className={`b-button b-co-cta ${known.length ? "" : "b-disabled"}`}
                aria-disabled={!known.length}
                href={known.length ? "/checkout" : undefined}
              >
                CONTINUE TO DELIVERY
              </a>
              <p className="b-co-assurance">
                <ShieldCheck aria-hidden /> Secure card payment · Visa and
                Mastercard
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
  const lines = useCart();
  const { config, loading, retry } = useCheckoutConfig();
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
      <ShopShell step={1} title="Checkout">
        <p role="status">Preparing checkout…</p>
      </ShopShell>
    );
  if (!config?.enabled)
    return (
      <ShopShell step={1} title="Checkout">
        <Unavailable retry={retry} />
      </ShopShell>
    );
  if (!cartLines.length)
    return (
      <ShopShell step={1} title="Checkout">
        <EmptyCart />
      </ShopShell>
    );

  const subtotal = cartSubtotalFils(cartLines, config.products);
  const minFils = (quote?.minOrderAed ?? 0) * 100;
  const set = <K extends keyof Delivery>(k: K, v: Delivery[K]) => {
    setError("");
    setDelivery((d) => ({ ...d, [k]: v }));
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
      <ShopShell step={1} title="Delivery or pickup">
        <div className="b-co-layout">
          {summary}
          <form
            className="b-shop-form b-co-main"
            onSubmit={(e) => {
              e.preventDefault();
              if (!quote?.eligible) return;
              setStep(2);
            }}
          >
            <Card
              title={pickup ? "Pickup details" : "Delivery details"}
              headingRef={heading}
            >
              <fieldset className="b-fulfillment-choice">
                <legend>How would you like your order?</legend>
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
                    {method === "pickup" ? "PICKUP" : "DELIVERY"}
                  </label>
                ))}
              </fieldset>
              {pickup ? (
                <div className="b-co-billing-preview">
                  <strong>Pickup · {business.tradingName}</strong>
                  <p>{business.address}</p>
                  <p>
                    Your order will be ready for pickup at the selected date and
                    time.
                  </p>
                </div>
              ) : (
                <p className="b-caption">
                  Delivery — Included once minimum order is reached
                </p>
              )}
              {!pickup && (
                <>
                  <label>
                    Delivery area
                    <Select
                      required
                      value={
                        areaMissing ? "__missing" : (delivery.zoneId ?? "")
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        setAreaMissing(v === "__missing");
                        set("zoneId", v === "__missing" ? "" : v);
                      }}
                    >
                      <option value="">Choose your area</option>
                      {config.zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                          {z.deliveryFeeAed === 0 ? " — free delivery" : ""}
                        </option>
                      ))}
                      <option value="__missing">My area isn't listed</option>
                    </Select>
                  </label>
                  {areaMissing && (
                    <div className="b-shop-notice" role="status">
                      <p>
                        Online delivery isn't available for your area yet. Our
                        team can still help you on WhatsApp.
                      </p>
                      <WhatsAppCTA
                        unavailable={() => (location.href = "/contact")}
                        message="Hello 3L, I'd like to order for delivery to my area."
                      >
                        ORDER VIA WHATSAPP
                      </WhatsAppCTA>
                    </div>
                  )}
                  {quote && (
                    <div aria-live="polite">
                      {quote.eligible ? (
                        <p className="b-co-fee">
                          <span>
                            Delivery to {quote.zoneName ?? "your area"}
                          </span>
                          <strong>
                            {quote.feeFils === 0
                              ? "Free"
                              : formatAed(quote.feeFils ?? 0)}
                          </strong>
                        </p>
                      ) : (
                        <p className="b-shop-notice" role="status">
                          {quote.minimumMet === false &&
                          quote.minOrderAed != null
                            ? `The minimum order for ${quote.zoneName ?? "this area"} is ${formatAed(minFils)}. Add ${formatAed(Math.max(0, minFils - quote.subtotalFils))} more to continue.`
                            : "Online delivery isn't available for this area yet."}{" "}
                          {quote.minimumMet === false && (
                            <a className="b-link" href="/cart">
                              Edit cart
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
                      Street address and community
                      <Input
                        required
                        minLength={5}
                        maxLength={300}
                        autoComplete="street-address"
                        value={delivery.address ?? ""}
                        onChange={(e) => set("address", e.target.value)}
                      />
                    </label>
                    <div className="b-shop-row">
                      <label>
                        Building or villa
                        <Input
                          required
                          maxLength={120}
                          value={delivery.building ?? ""}
                          onChange={(e) => set("building", e.target.value)}
                        />
                      </label>
                      <label>
                        Apartment or unit{" "}
                        <span className="b-optional">(optional)</span>
                        <Input
                          maxLength={40}
                          value={delivery.unit ?? ""}
                          onChange={(e) => set("unit", e.target.value)}
                        />
                      </label>
                    </div>
                  </>
                )}
                <div className="b-shop-row">
                  <label>
                    {pickup ? "Pickup date" : "Delivery date"}
                    <Input
                      required
                      type="date"
                      min={config.dates.min}
                      max={config.dates.max}
                      value={delivery.date ?? ""}
                      onChange={(e) => set("date", e.target.value)}
                    />
                  </label>
                  {config.slots.length ? (
                    <label>
                      {pickup ? "Pickup time" : "Delivery time"}
                      <Select
                        required
                        value={delivery.slot ?? ""}
                        onChange={(e) => set("slot", e.target.value)}
                      >
                        <option value="">Choose a time</option>
                        {config.slots.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </Select>
                    </label>
                  ) : (
                    <label>
                      {pickup
                        ? "Preferred pickup time"
                        : "Preferred delivery time"}
                      <Input
                        required
                        maxLength={60}
                        placeholder="e.g. afternoon, after 4 pm"
                        value={delivery.slot ?? ""}
                        onChange={(e) => set("slot", e.target.value)}
                      />
                    </label>
                  )}
                </div>
                {!config.slots.length && (
                  <p className="b-caption">
                    Our team confirms the preferred time with you.
                  </p>
                )}
                {!pickup && (
                  <label>
                    Delivery notes{" "}
                    <span className="b-optional">(optional)</span>
                    <Textarea
                      rows={3}
                      maxLength={500}
                      placeholder="Gate code, landmark, who will receive it"
                      value={delivery.notes ?? ""}
                      onChange={(e) => set("notes", e.target.value)}
                    />
                  </label>
                )}
              </fieldset>
            </Card>
            {error && <p role="alert">{error}</p>}
            <div className="b-shop-actions">
              <Button
                type="submit"
                className="b-co-cta"
                disabled={!quote?.eligible || (!pickup && areaMissing)}
              >
                CONTINUE TO DETAILS
              </Button>
              <a className="b-link" href="/cart">
                <ArrowLeft aria-hidden /> Back to cart
              </a>
            </div>
          </form>
        </div>
      </ShopShell>
    );

  if (step === 2) {
    const phoneOk = !!normalizeUaeMobile(customer.phone ?? "");
    return (
      <ShopShell step={2} title="Your details">
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
              if (!billingComplete(billing)) {
                setError("Please complete your billing address.");
                return;
              }
              setStep(3);
            }}
          >
            <Card title="Contact details" headingRef={heading}>
              <label>
                Full name
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
                  Mobile number
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
                  Email for payment receipt
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
                A UAE mobile number, so our team can reach you.
              </p>
              <label>
                Special instructions{" "}
                <span className="b-optional">(optional)</span>
                <Textarea
                  rows={3}
                  maxLength={500}
                  placeholder="A message for the cake, allergies to mention, anything we should know"
                  value={customer.instructions ?? ""}
                  onChange={(e) => setC("instructions", e.target.value)}
                />
              </label>
            </Card>
            <Card title="Billing address">
              {!pickup && (
                <label className="b-check b-co-toggle">
                  <input
                    type="checkbox"
                    checked={!pickup && billing.sameAsDelivery}
                    disabled={pickup}
                    onChange={(e) => setB("sameAsDelivery", e.target.checked)}
                  />
                  <span>Billing address is the same as delivery address</span>
                </label>
              )}
              {pickup && (
                <p className="b-caption">
                  Your billing address is required for payment. No delivery
                  address is needed.
                </p>
              )}
              {billing.sameAsDelivery ? (
                <p className="b-caption b-co-address-preview">
                  {billingLines(
                    billing,
                    delivery as Delivery,
                    customer.name ?? "",
                  )
                    .filter(Boolean)
                    .join(", ")}
                </p>
              ) : (
                <fieldset className="b-shop-billing">
                  <legend className="b-visually-hidden">Billing address</legend>
                  <label>
                    Name on billing address
                    <Input
                      required
                      maxLength={100}
                      autoComplete="billing name"
                      value={billing.name ?? ""}
                      onChange={(e) => setB("name", e.target.value)}
                    />
                  </label>
                  <label>
                    Address line 1
                    <Input
                      required
                      maxLength={200}
                      autoComplete="billing address-line1"
                      value={billing.address1 ?? ""}
                      onChange={(e) => setB("address1", e.target.value)}
                    />
                  </label>
                  <label>
                    Address line 2{" "}
                    <span className="b-optional">(optional)</span>
                    <Input
                      maxLength={300}
                      autoComplete="billing address-line2"
                      value={billing.address2 ?? ""}
                      onChange={(e) => setB("address2", e.target.value)}
                    />
                  </label>
                  <div className="b-shop-row">
                    <label>
                      City
                      <Input
                        required
                        maxLength={100}
                        autoComplete="billing address-level2"
                        value={billing.city ?? ""}
                        onChange={(e) => setB("city", e.target.value)}
                      />
                    </label>
                    <label>
                      Postal code <span className="b-optional">(optional)</span>
                      <Input
                        maxLength={20}
                        autoComplete="billing postal-code"
                        value={billing.zip ?? ""}
                        onChange={(e) => setB("zip", e.target.value)}
                      />
                    </label>
                  </div>
                  <label>
                    Country
                    <Select
                      required
                      autoComplete="billing country"
                      value={billing.country ?? ""}
                      onChange={(e) => setB("country", e.target.value)}
                    >
                      <option value="">Choose a country</option>
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                </fieldset>
              )}
            </Card>
            {error && <p role="alert">{error}</p>}
            <div className="b-shop-actions">
              <Button type="submit" className="b-co-cta">
                REVIEW ORDER
              </Button>
              <button
                type="button"
                className="b-link"
                onClick={() => setStep(1)}
              >
                <ArrowLeft aria-hidden /> Back to delivery
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

/**
 * A checkout from this browser session that is paid, or whose payment is held
 * for review, must never lead to a second charge: the customer is sent to its
 * status instead of starting a new order.
 */
async function heldCheckout(): Promise<Status | null> {
  let saved: { key?: string } | null = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(CAPABILITY) ?? "null");
  } catch {
    return null;
  }
  if (!saved?.key) return null;
  const res = await fetch("/api/checkout/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: saved.key }),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Unable to check your previous payment.");
  const status = (await res.json()) as Status;
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
  return (
    <ul className="b-co-marks" aria-label="Accepted cards">
      <li>
        <img src="/payments/visa.svg" alt="Visa" width="40" height="24" />
      </li>
      <li>
        <img
          src="/payments/mastercard.svg"
          alt="Mastercard"
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
        {title && <p className="b-co-state-title">{title}</p>}
        <p>{message}</p>
        {detail && <p className="b-co-state-detail">{detail}</p>}
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
  const [reviewed, setReviewed] = useState(false);
  const [held, setHeld] = useState<Status | null>(null);
  useEffect(() => {
    heldCheckout()
      .then(setHeld)
      .catch(() => undefined);
  }, []);
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

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewed || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      // Same details → same idempotency key → the same order and payment.
      const fingerprint = JSON.stringify(body);
      const saved = JSON.parse(sessionStorage.getItem(CAPABILITY) ?? "null");
      if (saved?.key && saved.fingerprint !== fingerprint) {
        // Changed details would open a new order; never while an earlier
        // payment from this session is paid or held for review.
        const previous = await heldCheckout();
        if (previous) {
          setHeld(previous);
          inFlight.current = false;
          setBusy(false);
          return;
        }
      }
      const key =
        saved?.fingerprint === fingerprint ? saved.key : crypto.randomUUID();
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
  const locked = busy || !!leaving;
  const issue = error ? paymentStateOfError(error) : null;
  const edit = (onClick: () => void, label: string) => (
    <button
      type="button"
      className="b-co-edit"
      onClick={onClick}
      aria-label={label}
    >
      Edit
    </button>
  );
  return (
    <ShopShell step={3} title="Review and pay">
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
          <section className="b-co-card b-co-review" aria-label="Order review">
            <div className="b-co-review-row">
              <h2>Your order</h2>
              <ul className="b-co-review-items">
                {lines.map((l) => {
                  const p = config.products.find((p) => p.id === l.productId);
                  return p ? (
                    <li key={l.productId}>
                      {p.name} <span className="b-caption">× {l.quantity}</span>
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
            <div className="b-co-review-row">
              <h2>{pickup ? "Pickup" : "Delivery"}</h2>
              <p>
                {longDate(delivery.date)} · {delivery.slot}
                <br />
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
                {!pickup && delivery.notes && (
                  <>
                    <br />
                    <span className="b-caption">{delivery.notes}</span>
                  </>
                )}
              </p>
              {edit(backToDelivery, pickup ? "Edit pickup" : "Edit delivery")}
            </div>
            <div className="b-co-review-row">
              <h2>Contact</h2>
              <p>
                {customer.name} ·{" "}
                {normalizeUaeMobile(customer.phone) ?? customer.phone}
                {customer.email && (
                  <>
                    <br />
                    {customer.email}
                  </>
                )}
              </p>
              {edit(back, "Edit contact details")}
            </div>
            <div className="b-co-review-row">
              <h2>Billing address</h2>
              <p>
                {billing.sameAsDelivery && (
                  <>
                    <span className="b-caption">Same as delivery address</span>
                    <br />
                  </>
                )}
                {billingLines(billing, delivery, customer.name)
                  .filter(Boolean)
                  .join(", ")}
              </p>
              {edit(back, "Edit billing address")}
            </div>
          </section>
          {held ? (
            <div className="b-co-card" role="alert">
              {held.paymentStatus === "paid" ? (
                <StateNotice
                  state="PAID"
                  title="This order is already paid"
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
                {held.paymentStatus === "paid"
                  ? "VIEW CONFIRMATION"
                  : "CHECK PAYMENT STATUS"}
              </a>
            </div>
          ) : total == null ? (
            <p className="b-shop-notice" role="alert">
              Your order can no longer be delivered as chosen. Please go back
              and review your delivery area.
            </p>
          ) : (
            <form
              className="b-shop-form b-co-card b-co-payment"
              onSubmit={pay}
              aria-busy={locked}
            >
              <header>
                <h2>Payment</h2>
                <CardMarks />
              </header>
              <p className="b-caption">
                Continue to Paymennt’s secure payment page to complete your
                order.
              </p>
              <label className="b-check">
                <input
                  type="checkbox"
                  checked={reviewed}
                  disabled={locked}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                <span>
                  I've reviewed my order, delivery details and total, and I
                  accept the <a href="/terms">terms</a>,{" "}
                  <a href="/refund-policy">refund policy</a> and{" "}
                  <a href="/privacy">privacy policy</a>.
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
                          Check payment status
                        </a>
                      )}
                    </StateNotice>
                  ) : (
                    <p className="b-co-error">
                      {error}{" "}
                      <a className="b-link" href="/checkout/return">
                        Check payment status
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
                      <span className="b-co-spinner" aria-hidden />
                      PROCESSING…
                    </>
                  ) : (
                    `PAY ${formatAed(total)}`
                  )}
                </Button>
              )}
              <p className="b-co-assurance">
                <LockSimple aria-hidden weight="bold" />
                Your card details are entered on Paymennt and are never seen or
                stored by 3L.
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
    <ShopShell step={3} title={copy.title} bare>
      <div className="b-co-status">
        <h1>{copy.title}</h1>
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
              <dt>Order number</dt>
              <dd>{result.orderId}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>{formatAed(result.amountFils)}</dd>
            </div>
          </dl>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="b-shop-actions">
          {(state === "3DS_REDIRECT" || state === "HOSTED_REDIRECT") &&
            result?.url && (
              <a className="b-button b-co-cta" href={result.url}>
                CONTINUE PAYMENT
              </a>
            )}
          {(state === "DECLINED" || state === "FAILED") && (
            <a className="b-button b-co-cta" href="/checkout">
              TRY AGAIN
            </a>
          )}
          {state === "READY" && (
            <a className="b-button b-co-cta" href="/checkout">
              RETURN TO CHECKOUT
            </a>
          )}
          {(state === "PROCESSING" ||
            state === "HELD_FOR_REVIEW" ||
            (!state && error)) && (
            <Button
              className="b-co-cta"
              onClick={() => setRevision((n) => n + 1)}
            >
              CHECK AGAIN
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
      Contact Pastelerías 3L
    </WhatsAppCTA>
  );
}

/** Shown only for an authoritative, reconciled PAID order (see paymentStateOf). */
function Confirmation({ result }: { result: Status }) {
  const s = result.summary;
  const name = firstName(s?.customerName);
  const progress =
    result.summary?.fulfillmentMethod === "pickup" && result.status === "Ready"
      ? 2
      : fulfilmentStep(result.status);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <ShopShell step={4} title="Thank you" bare>
      <div className="b-co-confirm">
        <header className="b-co-confirm-hero">
          <span className="b-co-confirm-mark" aria-hidden>
            <Check weight="bold" />
          </span>
          <h1 ref={heading} tabIndex={-1}>
            Thank you{name ? `, ${name}` : ""}
          </h1>
          <p className="b-co-confirm-lede" role="status">
            Your order is confirmed
          </p>
          <dl className="b-co-confirm-keys">
            <div>
              <dt>Order</dt>
              <dd>{result.orderId}</dd>
            </div>
            <div>
              <dt>Paid</dt>
              <dd>{formatAed(result.amountFils)}</dd>
            </div>
          </dl>
        </header>

        <div className="b-co-confirm-grid">
          {s && (
            <section className="b-co-card" aria-labelledby="b-conf-order">
              <header>
                <h2 id="b-conf-order">Order</h2>
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
                      <strong>{i.name}</strong>
                      <span className="b-caption">Quantity {i.quantity}</span>
                    </span>
                    <span className="b-co-money">{formatAed(i.lineFils)}</span>
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
              <h2>Pickup</h2>
              <p>
                {business.tradingName}
                <br />
                {business.address}
              </p>
              <p>
                {longDate(s.pickup.pickupDate)} · {s.pickup.preferredTime}
              </p>
              <p>
                Your order will be ready for pickup at the selected date and
                time.
              </p>
            </section>
          )}
          {s?.delivery && (
            <section className="b-co-card" aria-labelledby="b-conf-delivery">
              <header>
                <h2 id="b-conf-delivery">Delivery</h2>
              </header>
              <dl className="b-shop-receipt b-co-facts">
                {s.delivery.zoneName && (
                  <div>
                    <dt>Zone</dt>
                    <dd>{s.delivery.zoneName}</dd>
                  </div>
                )}
                <div>
                  <dt>Address</dt>
                  <dd>
                    {[
                      s.delivery.unit && `Unit ${s.delivery.unit}`,
                      s.delivery.building,
                      s.delivery.address,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </dd>
                </div>
                <div>
                  <dt>Date</dt>
                  <dd>{longDate(s.delivery.date)}</dd>
                </div>
                <div>
                  <dt>Preferred time</dt>
                  <dd>{s.delivery.slot}</dd>
                </div>
              </dl>
            </section>
          )}
          <section className="b-co-card" aria-labelledby="b-conf-payment">
            <header>
              <h2 id="b-conf-payment">Payment</h2>
            </header>
            <dl className="b-shop-receipt b-co-facts">
              <div>
                <dt>Status</dt>
                <dd className="b-co-paid">
                  Paid <Check aria-label="confirmed" weight="bold" />
                </dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>{formatAed(result.amountFils)}</dd>
              </div>
              <div>
                <dt>Method</dt>
                <dd>Card</dd>
              </div>
              <div>
                <dt>Reference</dt>
                <dd>{result.orderId}</dd>
              </div>
            </dl>
          </section>
          <section
            className="b-co-card b-co-next"
            aria-labelledby="b-conf-next"
          >
            <header>
              <h2 id="b-conf-next">What happens next</h2>
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
                  {label}
                </li>
              ))}
            </ol>
            <p className="b-caption">
              You don't need to message us — our team is preparing your order
              and will contact you if anything about the delivery needs
              confirming.
            </p>
          </section>
        </div>
        <div className="b-shop-actions b-co-confirm-actions">
          <a className="b-button b-co-cta" href="/">
            BACK TO 3L
          </a>
          <SupportLink orderId={result.orderId} />
        </div>
      </div>
    </ShopShell>
  );
}
