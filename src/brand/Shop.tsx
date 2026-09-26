/**
 * The 3L online store: cart → delivery → details → payment → confirmation.
 *
 * Prices shown here are for display only. The server re-prices the cart from
 * the approved catalog and delivery zone at quote, at checkout creation and
 * again immediately before the card is charged. Card details never touch 3L:
 * they are entered in Paymennt's secure frame and exchanged for a token.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Minus, Plus, Trash } from "@phosphor-icons/react";
import { PaymentFrame } from "./PaymentFrame";
import { Button, Input, Select, Textarea, WhatsAppCTA } from "./primitives";
import { formatAed } from "./content";
import { SiteFooter, SiteHeader } from "./SiteChrome";
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
  delivery?: Delivery & { zoneName?: string };
  customerName?: string;
};
type Status = {
  orderId: string;
  status: string;
  paymentStatus: string;
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
  delivery?: Partial<Delivery>;
  customer?: Partial<Customer>;
} {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT) ?? "{}");
  } catch {
    return {};
  }
}
function saveDraft(draft: {
  delivery?: Partial<Delivery>;
  customer?: Partial<Customer>;
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

const STEPS = ["Cart", "Delivery", "Details", "Payment", "Confirmation"];
function Progress({ step }: { step: number }) {
  return (
    <ol className="b-shop-progress" aria-label="Checkout progress">
      {STEPS.map((label, i) => (
        <li
          key={label}
          className={i < step ? "done" : i === step ? "current" : undefined}
          aria-current={i === step ? "step" : undefined}
        >
          <span aria-hidden>{i + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}
function ShopShell({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) {
  const toContact = () => {
    location.href = "/contact";
  };
  return (
    <div className="brand-experience b-entered b-shop">
      <a className="b-skip" href="#main-content">
        Skip to content
      </a>
      <SiteHeader onContactUnavailable={toContact} />
      <main id="main-content" className="b-shop-main">
        <Progress step={step} />
        <h1>{title}</h1>
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
}: {
  subtotal: number;
  fee: number | null;
  total: number | null;
  feePending?: boolean;
}) {
  return (
    <dl className="b-shop-totals">
      <div>
        <dt>Subtotal</dt>
        <dd>{formatAed(subtotal)}</dd>
      </div>
      <div>
        <dt>Delivery</dt>
        <dd>
          {fee === 0
            ? "Free"
            : fee != null
              ? formatAed(fee)
              : feePending
                ? "Choose your area"
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
  const product = config?.enabled
    ? config.products.find((p) => p.id === productId)
    : undefined;
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
  editable,
}: {
  lines: CartLine[];
  config: CheckoutConfig;
  editable: boolean;
}) {
  return (
    <ul className="b-cart-items">
      {lines.map((l) => {
        const p = config.products.find((p) => p.id === l.productId);
        if (!p)
          return (
            <li key={l.productId} className="b-cart-unavailable">
              <span>This item is no longer available.</span>
              {editable && (
                <button
                  className="b-link"
                  onClick={() => cart.remove(l.productId)}
                >
                  Remove
                </button>
              )}
            </li>
          );
        return (
          <li key={l.productId}>
            <div>
              <strong>{p.name}</strong>
              <span className="b-caption">{formatAed(p.priceFils)} each</span>
            </div>
            {editable ? (
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
            ) : (
              <span>× {l.quantity}</span>
            )}
            <span className="b-cart-line">
              {formatAed(p.priceFils * l.quantity)}
            </span>
            {editable && (
              <button
                type="button"
                className="b-cart-remove"
                aria-label={`Remove ${p.name}`}
                onClick={() => cart.remove(l.productId)}
              >
                <Trash aria-hidden />
              </button>
            )}
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
  if (!config?.enabled)
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
        <div className="b-shop-panel">
          <p>Your cart is empty.</p>
          <a className="b-button" href="/#bakery">
            BROWSE THE COLLECTION
          </a>
        </div>
      ) : (
        <>
          <CartItems lines={lines} config={config} editable />
          <Totals subtotal={subtotal} fee={null} total={null} feePending />
          <p className="b-caption">
            Delivery charges and minimum order values depend on your area and
            are confirmed in the next step.
          </p>
          <div className="b-shop-actions">
            <a
              className={`b-button ${known.length ? "" : "b-disabled"}`}
              aria-disabled={!known.length}
              href={known.length ? "/checkout" : undefined}
            >
              CONTINUE TO DELIVERY
            </a>
            <a className="b-link" href="/#bakery">
              Continue shopping
            </a>
            <button className="b-link" onClick={() => cart.clear()}>
              Clear cart
            </button>
          </div>
        </>
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
  const [delivery, setDelivery] = useState<Partial<Delivery>>(
    draft.delivery ?? {},
  );
  const [customer, setCustomer] = useState<Partial<Customer>>(
    draft.customer ?? {},
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

  useEffect(() => saveDraft({ delivery, customer }), [delivery, customer]);
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo({ top: 0 });
  }, [step]);
  // Live server quote for the chosen area. Display only; re-checked on payment.
  useEffect(() => {
    let active = true;
    setQuote(null);
    if (!config?.enabled || !delivery.zoneId || !cartLines.length) return;
    post<Quote>("/api/checkout/quote", {
      lines: cartLines,
      zoneId: delivery.zoneId,
    })
      .then((q) => active && setQuote(q))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [delivery.zoneId, cartLines, config]);

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
        <div className="b-shop-panel">
          <p>Your cart is empty.</p>
          <a className="b-button" href="/#bakery">
            BROWSE THE COLLECTION
          </a>
        </div>
      </ShopShell>
    );

  const subtotal = cartSubtotalFils(cartLines, config.products);
  const minFils = (quote?.minOrderAed ?? 0) * 100;
  const set = <K extends keyof Delivery>(k: K, v: Delivery[K]) => {
    setError("");
    setDelivery((d) => ({ ...d, [k]: v }));
  };
  const setC = <K extends keyof Customer>(k: K, v: Customer[K]) => {
    setError("");
    setCustomer((c) => ({ ...c, [k]: v }));
  };

  if (step === 1)
    return (
      <ShopShell step={1} title="Delivery">
        <form
          className="b-shop-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!quote?.eligible) return;
            setStep(2);
          }}
        >
          <h2 ref={heading} tabIndex={-1} className="b-visually-hidden">
            Delivery details
          </h2>
          <label>
            Delivery area
            <Select
              required
              value={areaMissing ? "__missing" : (delivery.zoneId ?? "")}
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
                Online delivery isn't available for your area yet. Our team can
                still help you on WhatsApp.
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
              <Totals
                subtotal={quote.subtotalFils}
                fee={quote.feeFils}
                total={quote.eligible ? quote.totalFils : null}
              />
              {!quote.eligible && (
                <p className="b-shop-notice" role="status">
                  {quote.minimumMet === false && quote.minOrderAed != null
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
          <fieldset disabled={areaMissing}>
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
                Apartment or unit <span className="b-optional">(optional)</span>
                <Input
                  maxLength={40}
                  value={delivery.unit ?? ""}
                  onChange={(e) => set("unit", e.target.value)}
                />
              </label>
            </div>
            <div className="b-shop-row">
              <label>
                Delivery date
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
                  Delivery time
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
                  Preferred delivery time
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
                Our team confirms the exact delivery time with you.
              </p>
            )}
            <label>
              Delivery notes <span className="b-optional">(optional)</span>
              <Textarea
                rows={3}
                maxLength={500}
                placeholder="Gate code, landmark, who will receive it"
                value={delivery.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
              />
            </label>
          </fieldset>
          {error && <p role="alert">{error}</p>}
          <div className="b-shop-actions">
            <Button type="submit" disabled={!quote?.eligible || areaMissing}>
              CONTINUE TO DETAILS
            </Button>
            <a className="b-link" href="/cart">
              Back to cart
            </a>
          </div>
        </form>
      </ShopShell>
    );

  if (step === 2) {
    const phoneOk = !!normalizeUaeMobile(customer.phone ?? "");
    return (
      <ShopShell step={2} title="Your details">
        <form
          className="b-shop-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!phoneOk) {
              setError("Please enter a valid UAE mobile number.");
              return;
            }
            setStep(3);
          }}
        >
          <h2 ref={heading} tabIndex={-1} className="b-visually-hidden">
            Contact details
          </h2>
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
          <p id="b-phone-help" className="b-caption">
            A UAE mobile number, so our driver can reach you.
          </p>
          <label>
            Email <span className="b-optional">(optional)</span>
            <Input
              type="email"
              autoComplete="email"
              maxLength={254}
              value={customer.email ?? ""}
              onChange={(e) => setC("email", e.target.value)}
            />
          </label>
          <label>
            Special instructions <span className="b-optional">(optional)</span>
            <Textarea
              rows={3}
              maxLength={500}
              placeholder="A message for the cake, allergies to mention, anything we should know"
              value={customer.instructions ?? ""}
              onChange={(e) => setC("instructions", e.target.value)}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="b-shop-actions">
            <Button type="submit">REVIEW ORDER</Button>
            <button type="button" className="b-link" onClick={() => setStep(1)}>
              Back to delivery
            </button>
          </div>
        </form>
      </ShopShell>
    );
  }

  return (
    <PaymentStep
      config={config}
      lines={cartLines}
      delivery={delivery as Delivery}
      customer={customer as Customer}
      quote={quote}
      subtotal={subtotal}
      back={() => setStep(2)}
    />
  );
}

function PaymentStep({
  config,
  lines,
  delivery,
  customer,
  quote,
  back,
}: {
  config: CheckoutConfig;
  lines: CartLine[];
  delivery: Delivery;
  customer: Customer;
  quote: Quote | null;
  subtotal: number;
  back: () => void;
}) {
  const [reviewed, setReviewed] = useState(false);
  const [email, setEmail] = useState(customer.email ?? "");
  const [cardValid, setCardValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitCard = useRef<(() => void) | null>(null);
  const inFlight = useRef(false);
  const pending = useRef<{ key: string; orderId: string } | null>(null);
  const zone = config.zones.find((z) => z.id === delivery.zoneId);
  const body = {
    lines,
    delivery: {
      ...delivery,
      unit: delivery.unit || undefined,
      notes: delivery.notes || undefined,
    },
    customer: {
      ...customer,
      email: customer.email || undefined,
      instructions: customer.instructions || undefined,
    },
  };

  async function tokenized(token: string) {
    const checkout = pending.current;
    if (!checkout || !inFlight.current) return;
    pending.current = null;
    try {
      const result = await post<Status>("/api/checkout/token", {
        ...checkout,
        token,
        email,
      });
      if (result.paymentStatus === "paid") {
        cart.clear();
        location.assign("/checkout/return");
      } else if (result.url) location.assign(result.url);
      else location.assign("/checkout/return");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "We couldn't confirm your payment. Please don't pay again — check its status below.",
      );
    } finally {
      token = "";
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewed || !cardValid || !submitCard.current || inFlight.current)
      return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      // Same details → same idempotency key → the same order and payment.
      const fingerprint = JSON.stringify(body);
      const saved = JSON.parse(sessionStorage.getItem(CAPABILITY) ?? "null");
      const key =
        saved?.fingerprint === fingerprint ? saved.key : crypto.randomUUID();
      sessionStorage.setItem(CAPABILITY, JSON.stringify({ key, fingerprint }));
      let result = await post<Status>("/api/checkout/prepare", body, key);
      if (["failed", "cancelled", "expired"].includes(result.paymentStatus))
        result = await post<Status>("/api/checkout/retry", { key });
      if (result.paymentStatus === "paid") {
        cart.clear();
        location.assign("/checkout/return");
        return;
      }
      if (result.actionRequired === "review_payment") {
        location.assign("/checkout/return");
        return;
      }
      pending.current = { key, orderId: result.orderId };
      submitCard.current();
    } catch (err) {
      inFlight.current = false;
      setBusy(false);
      setError(err instanceof Error ? err.message : "Please try again.");
    }
  }
  const total = quote?.eligible ? quote.totalFils : null;
  return (
    <ShopShell step={3} title="Review and pay">
      <section className="b-shop-review" aria-label="Order review">
        <h2>Your order</h2>
        <CartItems lines={lines} config={config} editable={false} />
        <Totals
          subtotal={quote?.subtotalFils ?? 0}
          fee={quote?.feeFils ?? null}
          total={total}
        />
        <h2>Delivery</h2>
        <p>
          {longDate(delivery.date)} · {delivery.slot}
          <br />
          {[
            delivery.unit && `Unit ${delivery.unit}`,
            delivery.building,
            delivery.address,
            zone?.name,
          ]
            .filter(Boolean)
            .join(", ")}
          {delivery.notes && (
            <>
              <br />
              <span className="b-caption">{delivery.notes}</span>
            </>
          )}
        </p>
        <h2>Contact</h2>
        <p>
          {customer.name} ·{" "}
          {normalizeUaeMobile(customer.phone) ?? customer.phone}
          {customer.email && <> · {customer.email}</>}
        </p>
        <button type="button" className="b-link" onClick={back}>
          Edit details
        </button>
      </section>
      {total == null ? (
        <p className="b-shop-notice" role="alert">
          Your order can no longer be delivered as chosen. Please go back and
          review your delivery area.
        </p>
      ) : (
        <form className="b-shop-form" onSubmit={pay}>
          <h2>Payment</h2>
          <label className="b-check">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            <span>
              I've reviewed my order, delivery details and total, and I accept
              the <a href="/terms">terms</a>,{" "}
              <a href="/refund-policy">refund policy</a> and{" "}
              <a href="/privacy">privacy policy</a>.
            </span>
          </label>
          <label>
            Email for your receipt
            <Input
              required
              type="email"
              autoComplete="email"
              maxLength={254}
              value={email}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {config.publicKey && config.frame ? (
            <PaymentFrame
              publicKey={config.publicKey}
              mode={config.frame.mode}
              origin={config.frame.origin}
              valid={setCardValid}
              token={(t) => void tokenized(t)}
              failure={() => {
                pending.current = null;
                inFlight.current = false;
                setBusy(false);
                setCardValid(false);
                setError(
                  "Your card details couldn't be verified. Please check them and try again.",
                );
              }}
              submitRef={submitCard}
            />
          ) : (
            <Unavailable />
          )}
          <Button type="submit" disabled={busy || !reviewed || !cardValid}>
            {busy ? "PROCESSING PAYMENT…" : `PAY ${formatAed(total)}`}
          </Button>
          <p className="b-caption">
            Your card details are entered in a secure payment form and are never
            seen or stored by 3L.
          </p>
          {error && (
            <p role="alert">
              {error}{" "}
              <a className="b-link" href="/checkout/return">
                Check payment status
              </a>
            </p>
          )}
        </form>
      )}
    </ShopShell>
  );
}

// ── Confirmation ─────────────────────────────────────────────────────────

const PAID_STATES = [
  "Confirmed",
  "Production",
  "Ready",
  "Out for Delivery",
  "Delivered",
];
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

  const paid =
    result?.paymentStatus === "paid" && PAID_STATES.includes(result.status);
  const failed =
    !!result &&
    ["failed", "cancelled", "expired"].includes(result.paymentStatus);
  const review = result?.actionRequired === "review_payment";
  const s = result?.summary;
  const title = paid
    ? "Thank you"
    : review
      ? "We're checking your payment"
      : failed
        ? "Payment not completed"
        : "Confirming your payment…";
  return (
    <ShopShell step={paid ? 4 : 3} title={title}>
      <div className="b-shop-confirmation" role="status" aria-live="polite">
        {paid ? (
          <>
            <p className="b-shop-badge">Order confirmed · Payment confirmed</p>
            <p>
              We've received your order and payment. You don't need to message
              us — our team is preparing it for you.
            </p>
          </>
        ) : review ? (
          <p>
            Your order is saved but we couldn't verify the payment yet. Please
            don't pay again. Contact us with your order number and we'll check
            it for you.
          </p>
        ) : failed ? (
          <p>
            Your payment didn't go through and you haven't been charged for this
            attempt. You can try again from your cart.
          </p>
        ) : (
          <p>This only takes a moment. Please keep this page open.</p>
        )}
      </div>
      {result && (
        <dl className="b-shop-receipt">
          <div>
            <dt>Order number</dt>
            <dd>{result.orderId}</dd>
          </div>
          <div>
            <dt>{paid ? "Paid" : "Amount"}</dt>
            <dd>{formatAed(result.amountFils)}</dd>
          </div>
          {s?.delivery && (
            <>
              <div>
                <dt>Delivery</dt>
                <dd>
                  {longDate(s.delivery.date)} · {s.delivery.slot}
                </dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>
                  {[
                    s.delivery.unit && `Unit ${s.delivery.unit}`,
                    s.delivery.building,
                    s.delivery.address,
                    s.delivery.zoneName,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </dd>
              </div>
            </>
          )}
          {s && (
            <div>
              <dt>Items</dt>
              <dd>
                <ul>
                  {s.items.map((i) => (
                    <li key={i.productId}>
                      {i.quantity} × {i.name} · {formatAed(i.lineFils)}
                    </li>
                  ))}
                  <li>
                    Delivery · {s.feeFils === 0 ? "Free" : formatAed(s.feeFils)}
                  </li>
                </ul>
              </dd>
            </div>
          )}
        </dl>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="b-shop-actions">
        {result?.url && !paid && (
          <a className="b-button" href={result.url}>
            CONTINUE PAYMENT
          </a>
        )}
        {failed && (
          <a className="b-button" href="/checkout">
            TRY AGAIN
          </a>
        )}
        {!paid && !failed && (
          <Button onClick={() => setRevision((n) => n + 1)}>CHECK AGAIN</Button>
        )}
        {paid && (
          <a className="b-button" href="/">
            BACK TO 3L
          </a>
        )}
        <a className="b-link" href="/contact">
          Contact 3L
        </a>
      </div>
    </ShopShell>
  );
}
