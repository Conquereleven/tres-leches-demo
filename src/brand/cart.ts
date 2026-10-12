/**
 * Shopping cart. Holds product ids and quantities only — never prices. Every
 * amount shown to the customer comes from the server's checkout config and
 * quote, and the server re-prices the cart again before any payment.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { onRevisionChange } from "./live-catalog";

export type CartLine = { productId: string; quantity: number };
import { MAX_ITEM_QUANTITY } from "../../shared/commerce-policy";
export const MAX_QTY = MAX_ITEM_QUANTITY;
const KEY = "3l-cart";

let lines: CartLine[] = read();
const listeners = new Set<() => void>();

function read(): CartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw
          .filter(
            (l) =>
              typeof l?.productId === "string" &&
              Number.isInteger(l?.quantity) &&
              l.quantity >= 1,
          )
          .map((l) => ({
            productId: l.productId,
            quantity: Math.min(MAX_QTY, l.quantity),
          }))
      : [];
  } catch {
    return [];
  }
}
function commit(next: CartLine[]) {
  lines = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Private mode: the cart still works for this page view. */
  }
  listeners.forEach((l) => l());
}
if (typeof window !== "undefined")
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      lines = read();
      listeners.forEach((l) => l());
    }
  });

export const cart = {
  add(productId: string, quantity = 1) {
    if (!productId || !Number.isInteger(quantity) || quantity < 1) return;
    const current = lines.find((l) => l.productId === productId);
    commit(
      current
        ? lines.map((l) =>
            l.productId === productId
              ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + quantity) }
              : l,
          )
        : [...lines, { productId, quantity: Math.min(MAX_QTY, quantity) }],
    );
  },
  set(productId: string, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 0) return;
    commit(
      quantity < 1
        ? lines.filter((l) => l.productId !== productId)
        : lines.map((l) =>
            l.productId === productId
              ? { ...l, quantity: Math.min(MAX_QTY, quantity) }
              : l,
          ),
    );
  },
  remove(productId: string) {
    commit(lines.filter((l) => l.productId !== productId));
  },
  clear() {
    commit([]);
    try {
      sessionStorage.removeItem("3l-checkout-draft");
    } catch {
      /* Storage optional. Paid order capability remains available. */
    }
  },
};

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export function useCart() {
  return useSyncExternalStore(
    subscribe,
    () => lines,
    () => [] as CartLine[],
  );
}
export const cartCount = (ls: CartLine[]) =>
  ls.reduce((n, l) => n + l.quantity, 0);

export type CatalogEntry = {
  id: string;
  name: string;
  priceFils: number;
  description: string | null;
};
/** Display subtotal from server-provided prices; lines for unknown products are ignored. */
export function cartSubtotalFils(ls: CartLine[], products: CatalogEntry[]) {
  return ls.reduce((sum, l) => {
    const p = products.find((p) => p.id === l.productId);
    return p ? sum + p.priceFils * l.quantity : sum;
  }, 0);
}

export type CheckoutConfig = {
  enabled: boolean;
  catalogAvailable?: boolean;
  addressVerificationRequired?: boolean;
  paymentFlow?: "web";
  publicKey?: string | null;
  mode: string;
  /** Payment frame environment, decided server-side. Null when unavailable. */
  frame?: { mode: "TEST" | "LIVE"; origin: string } | null;
  products: CatalogEntry[];
  slots: string[];
  dates: { min: string; max: string };
  serverNow?: string;
  zones: {
    id: string;
    name: string;
    /** Search labels only; the id is the authority. */
    aliases?: string[];
    minOrderAed: number;
    deliveryFeeAed: number;
  }[];
};
let configPromise: Promise<CheckoutConfig | null> | null = null;
const receivedAt = new WeakMap<CheckoutConfig, number>();
function loadConfig(force = false) {
  if (!configPromise || force)
    configPromise = fetch("/api/checkout/config")
      .then(async (r) => {
        if (!r.ok) return null;
        const config = (await r.json()) as CheckoutConfig;
        receivedAt.set(config, Date.now());
        return config;
      })
      .catch(() => null);
  return configPromise;
}
let configGeneration = 0;
const configListeners = new Set<() => void>();
const subscribeConfig = (fn: () => void) => {
  configListeners.add(fn);
  return () => configListeners.delete(fn);
};
/** Fetches the checkout configuration again for every component using it. */
export function refreshCheckoutConfig() {
  void loadConfig(true);
  configGeneration++;
  configListeners.forEach((l) => l());
}
onRevisionChange(refreshCheckoutConfig);
/** Checkout availability, shared by every component on the page. */
export function useCheckoutConfig() {
  const [state, setState] = useState<{
    config: CheckoutConfig | null;
    loading: boolean;
  }>({ config: null, loading: true });
  const [attempt, setAttempt] = useState(0);
  // A newly published catalog revision re-prices every component at once.
  const generation = useSyncExternalStore(
    subscribeConfig,
    () => configGeneration,
    () => 0,
  );
  useEffect(() => {
    let active = true;
    void loadConfig(attempt > 0).then((config) => {
      if (active) setState({ config, loading: false });
    });
    return () => {
      active = false;
    };
  }, [attempt, generation]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

/** Advance the server clock snapshot by elapsed local time; backend revalidates. */
export function checkoutNow(config: CheckoutConfig | null) {
  const timestamp = config?.serverNow
    ? Date.parse(config.serverNow)
    : Date.now();
  return new Date(
    timestamp +
      Math.max(
        0,
        Date.now() -
          (config ? (receivedAt.get(config) ?? Date.now()) : Date.now()),
      ),
  );
}
export function useCheckoutNow(config: CheckoutConfig | null) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30000);
    const refresh = () => setTick((n) => n + 1);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  void tick;
  return checkoutNow(config);
}
