import { useEffect, useState } from "react";
import { Button, Input, Select, WhatsAppCTA } from "./primitives";
import { formatAed, productInquiry, type Product } from "./content";
type Config = {
  enabled: boolean;
  mode: string;
  product: { id: string; name: string; priceFils: number } | null;
  zones: {
    id: string;
    name: string;
    minOrderAed: number;
    deliveryFeeAed: number;
  }[];
};
type Quote = {
  eligible: boolean;
  minimumMet: boolean;
  reason: string;
  subtotalFils: number;
  feeFils: number | null;
  totalFils: number | null;
  minOrderAed: number | null;
};
type Status = {
  orderId: string;
  status: string;
  paymentStatus: string;
  amountFils: number;
  currency: string;
  url: string | null;
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
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error ?? "Unable to continue. Please try again.");
  return data;
}
const sessionKey = "3l-checkout";
export function ProductCheckout({
  product,
  unavailable,
}: {
  product: Product;
  unavailable: () => void;
}) {
  const [config, setConfig] = useState<Config | null>(null),
    [quantity, setQuantity] = useState(1),
    [zoneId, setZoneId] = useState(""),
    [quote, setQuote] = useState<Quote | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  const [customer, setCustomer] = useState(""),
    [phone, setPhone] = useState(""),
    [address, setAddress] = useState("");
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch("/api/checkout/config")
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((c: Config) => {
        if (active) {
          setConfig(c);
          setError("");
        }
      })
      .catch(() => {
        if (active)
          setError(
            "Online payment is unavailable right now. You can still order via WhatsApp.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  useEffect(() => {
    let active = true;
    setQuote(null);
    if (config?.enabled && zoneId)
      post<Quote>("/api/checkout/quote", {
        productId: product.id,
        quantity,
        zoneId,
      })
        .then((q) => {
          if (active) setQuote(q);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [quantity, zoneId, config, product.id]);
  const price =
    config?.product?.id === product.id
      ? config.product.priceFils
      : product.priceFils;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!quote?.eligible || busy) return;
    setBusy(true);
    setError("");
    // The existing /checkout/link API has no documented returnUrl. Keep 3L's
    // status page in this tab and use a separate hosted checkout tab.
    const hostedTab = window.open("about:blank", "_blank");
    if (hostedTab) hostedTab.opener = null;
    const input = {
      productId: product.id,
      quantity,
      zoneId,
      customer,
      phone,
      address,
    };
    try {
      const prior = sessionStorage.getItem(sessionKey);
      const saved = prior ? JSON.parse(prior) : null;
      const fingerprint = JSON.stringify(input);
      const key =
        saved?.fingerprint === fingerprint ? saved.key : crypto.randomUUID();
      sessionStorage.setItem(sessionKey, JSON.stringify({ key, fingerprint }));
      setSubmitted(true);
      const result = await post<Status>("/api/checkout", input, key);
      if (result.url && hostedTab) hostedTab.location.replace(result.url);
      else hostedTab?.close();
      window.location.assign("/checkout/return");
    } catch (e) {
      hostedTab?.close();
      setError(
        e instanceof Error
          ? e.message
          : "Unable to create checkout. Retry the same request safely.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="b-direct-checkout">
      <label>
        Quantity
        <Input
          aria-label="Quantity"
          type="number"
          min={1}
          max={20}
          value={quantity}
          disabled={busy || submitted}
          onChange={(e) =>
            setQuantity(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
          }
        />
      </label>
      {price != null && (
        <p>
          Subtotal: <strong>{formatAed(price * quantity)}</strong>
        </p>
      )}
      {loading ? (
        <p role="status">Checking payment availability…</p>
      ) : config?.enabled ? (
        <form onSubmit={submit}>
          <p className="b-caption">
            TEST CHECKOUT — use only Paymennt’s approved test card.
          </p>
          <label>
            Delivery zone
            <Select
              aria-label="Delivery zone"
              required
              value={zoneId}
              disabled={busy || submitted}
              onChange={(e) => {
                setError("");
                setZoneId(e.target.value);
              }}
            >
              <option value="">Choose your delivery zone</option>
              {config.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </Select>
          </label>
          <p className="b-caption">
            Select the zone of your actual delivery address. Other zones are
            currently unavailable for online payment.
          </p>
          {quote && (
            <div aria-live="polite">
              <p>Minimum order: {formatAed((quote.minOrderAed ?? 0) * 100)}</p>
              <p>
                Delivery:{" "}
                {quote.feeFils === 0
                  ? "FREE"
                  : quote.feeFils != null
                    ? formatAed(quote.feeFils)
                    : "Unavailable"}
              </p>
              {quote.totalFils != null && (
                <p>
                  Total: <strong>{formatAed(quote.totalFils)}</strong>
                </p>
              )}
              {!quote.eligible && (
                <p role="status">
                  {quote.minimumMet === false
                    ? "Your order is below the delivery minimum. Increase the quantity to continue."
                    : quote.reason}
                </p>
              )}
            </div>
          )}
          <label>
            Name
            <Input
              required
              autoComplete="name"
              maxLength={100}
              minLength={2}
              value={customer}
              disabled={busy || submitted}
              onChange={(e) => setCustomer(e.target.value)}
            />
          </label>
          <label>
            Phone including country code
            <Input
              required
              type="tel"
              autoComplete="tel"
              pattern="\+?[0-9]{7,16}"
              value={phone}
              disabled={busy || submitted}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label>
            Building, apartment and delivery address
            <Input
              required
              autoComplete="street-address"
              minLength={5}
              maxLength={500}
              value={address}
              disabled={busy || submitted}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={busy || !quote?.eligible}>
            {busy
              ? "PREPARING SECURE PAYMENT…"
              : submitted
                ? "RETRY SAME CHECKOUT"
                : "PAY SECURELY"}
          </Button>
          {submitted && (
            <a className="b-link" href="/checkout/return">
              Check existing payment
            </a>
          )}
          <p className="b-caption">
            Paymennt opens in a new tab. Return here to check your payment. Card
            details are entered only on Paymennt. By continuing you accept our{" "}
            <a href="/terms">terms</a> and <a href="/privacy">privacy policy</a>
            .
          </p>
        </form>
      ) : (
        <p>Online payment is not available yet. Please order via WhatsApp.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {!config && !loading && (
        <Button onClick={() => setRetry((n) => n + 1)}>
          Retry availability
        </Button>
      )}
      <WhatsAppCTA
        unavailable={unavailable}
        message={`${productInquiry(product) ?? "Hello 3L, I would like to order."} Quantity: ${quantity}.`}
      >
        ORDER VIA WHATSAPP
      </WhatsAppCTA>
    </div>
  );
}
export function CheckoutReturn() {
  const [result, setResult] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function poll() {
      try {
        const saved = JSON.parse(sessionStorage.getItem(sessionKey) ?? "null");
        if (!saved?.key)
          throw Error(
            "This browser has no checkout session. Please contact 3L if you need help with your order.",
          );
        const data = await post<Status>("/api/checkout/status", {
          key: saved.key,
        });
        if (!active) return;
        setResult(data);
        setError("");
        if (
          [
            "creating",
            "pending",
            "authorized",
            "pending_confirmation",
          ].includes(data.paymentStatus) &&
          attempts++ < 30
        )
          timer = setTimeout(poll, 4000);
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Unable to check payment.");
      }
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [revision]);
  const paid =
    result?.paymentStatus === "paid" &&
    [
      "Confirmed",
      "Production",
      "Ready",
      "Out for Delivery",
      "Delivered",
    ].includes(result.status);
  return (
    <main className="b-checkout-return">
      <a href="/">Pastelerías 3L</a>
      <h1>
        {paid
          ? "PAYMENT CONFIRMED"
          : result &&
              ["failed", "cancelled", "expired"].includes(result.paymentStatus)
            ? "PAYMENT NOT COMPLETED"
            : "Checking payment status…"}
      </h1>
      <p role="status">
        {paid
          ? "Your payment has been verified. Thank you."
          : "Returning from the payment page does not confirm payment. We are waiting for verified confirmation."}
      </p>
      {result && (
        <p>
          Order {result.orderId} · {formatAed(result.amountFils)} ·{" "}
          {result.paymentStatus}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {result?.url && (
        <a
          className="b-button"
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          CONTINUE EXISTING PAYMENT
        </a>
      )}
      {!paid && (
        <Button onClick={() => setRevision((n) => n + 1)}>
          CHECK STATUS AGAIN
        </Button>
      )}
      <p>
        <a href="/contact">Contact 3L</a>
      </p>
    </main>
  );
}
