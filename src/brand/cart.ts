import {
  calculatePackPrice,
  type PackPricingPolicy,
} from "../../shared/pack-pricing";
import { useLiveCatalog } from "./live-catalog";
import {
  commerceLineSchema,
  packSpec,
  lineKey,
  normalizeComposition,
  type CommerceLine,
  type Composition,
  type PackEligibility,
} from "../../shared/pack-composition";
/**
 * Shopping cart. Holds product ids, quantities and preparation choices — never prices. Every
 * amount shown to the customer comes from the server's checkout config and
 * quote, and the server re-prices the cart again before any payment.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

export type CartLine = CommerceLine;
import { MAX_ITEM_QUANTITY } from "../../shared/commerce-policy";
import {
  isTricolorColor,
  tricolorSpec,
  type TricolorColor,
} from "../../shared/tricolor";
export const MAX_QTY = MAX_ITEM_QUANTITY;
const KEY = "3l-cart";

let lines: CartLine[] = read();
const listeners = new Set<() => void>();

function read(): CartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.flatMap((l) => {
          const parsed = commerceLineSchema.safeParse(l);
          return parsed.success ? [parsed.data] : [];
        })
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
  add(
    productId: string,
    quantity = 1,
    composition?: Composition,
    color?: TricolorColor,
  ) {
    if (!productId || !Number.isInteger(quantity) || quantity < 1) return;
    const entry = {
      productId,
      quantity,
      ...(color ? { color } : {}),
      ...(composition
        ? { composition: normalizeComposition(composition) }
        : {}),
    };
    const key = lineKey(entry);
    const total = lines
      .filter((l) => l.productId === productId)
      .reduce((n, l) => n + l.quantity, 0);
    if (total + quantity > MAX_QTY) return;
    const current = lines.find((l) => lineKey(l) === key);
    commit(
      current
        ? lines.map((l) =>
            lineKey(l) === key
              ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + quantity) }
              : l,
          )
        : [...lines, entry],
    );
  },
  set(key: string, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 0) return;
    const target = lines.find((l) => lineKey(l) === key);
    if (
      !target ||
      lines
        .filter((l) => l.productId === target.productId && lineKey(l) !== key)
        .reduce((n, l) => n + l.quantity, 0) +
        quantity >
        MAX_QTY
    )
      return;
    commit(
      quantity < 1
        ? lines.filter((l) => lineKey(l) !== key)
        : lines.map((l) =>
            lineKey(l) === key
              ? { ...l, quantity: Math.min(MAX_QTY, quantity) }
              : l,
          ),
    );
  },
  edit(key: string, composition: Composition) {
    const target = lines.find((l) => lineKey(l) === key);
    if (!target) return;
    const entry = { ...target, composition: normalizeComposition(composition) };
    const existing = lines.find(
      (l) => lineKey(l) !== key && lineKey(l) === lineKey(entry),
    );
    commit(
      existing
        ? lines
            .filter((l) => lineKey(l) !== key)
            .map((l) =>
              lineKey(l) === lineKey(entry)
                ? { ...l, quantity: l.quantity + target.quantity }
                : l,
            )
        : lines.map((l) => (lineKey(l) === key ? entry : l)),
    );
  },
  editColor(key: string, color: TricolorColor) {
    if (!isTricolorColor(color)) return;
    const target = lines.find((l) => lineKey(l) === key);
    if (!target || tricolorSpec(target.productId)?.kind !== "single") return;
    const entry = { ...target, color };
    const existing = lines.find(
      (l) => lineKey(l) !== key && lineKey(l) === lineKey(entry),
    );
    commit(
      existing
        ? lines
            .filter((l) => lineKey(l) !== key)
            .map((l) =>
              lineKey(l) === lineKey(entry)
                ? { ...l, quantity: l.quantity + target.quantity }
                : l,
            )
        : lines.map((l) => (lineKey(l) === key ? entry : l)),
    );
  },
  remove(key: string) {
    commit(lines.filter((l) => lineKey(l) !== key));
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
export function cartSubtotalFils(
  ls: CartLine[],
  products: CatalogEntry[],
  policy?: PackPricingPolicy | null,
) {
  return ls.reduce((sum, l) => {
    const p = products.find((p) => p.id === l.productId);
    return p
      ? sum + displayLinePrice(l, p.priceFils, policy) * l.quantity
      : sum;
  }, 0);
}

export function displayLinePrice(
  line: CartLine,
  base: number,
  policy?: PackPricingPolicy | null,
) {
  if (
    !policy ||
    !line.productId.startsWith("pan-de-muerto-") ||
    !line.composition ||
    !packSpec(line.productId)
  )
    return base;
  try {
    return calculatePackPrice(line, base, policy).unitPriceFils;
  } catch {
    return Number.NaN;
  }
}
export type CheckoutConfig = {
  packPricing?: PackPricingPolicy | null;
  personalizedPacks?: { enabled: boolean; rules: PackEligibility };
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
    deliveryPolicy?: {
      mode: "flexible";
      freeDeliveryThresholdFils: number;
      belowThresholdFeeFils: number;
    };
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
/** Checkout availability, shared by every component on the page. */
export function useCheckoutConfig() {
  const published = useLiveCatalog();
  const [state, setState] = useState<{
    config: CheckoutConfig | null;
    loading: boolean;
  }>({ config: null, loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void loadConfig(attempt > 0).then((config) => {
      if (active) setState({ config, loading: false });
    });
    return () => {
      active = false;
    };
  }, [attempt]);
  const packSettings =
    published.status === "live"
      ? published.catalog.personalizedPacks
      : undefined;
  const publishedPricing =
    published.status === "live" ? published.catalog.packPricing : undefined;
  const config = useMemo(() => {
    if (!state.config || !packSettings) return state.config;
    const merged = {
      ...state.config,
      personalizedPacks: packSettings,
      ...(publishedPricing !== undefined
        ? { packPricing: publishedPricing }
        : {}),
    };
    receivedAt.set(merged, receivedAt.get(state.config) ?? Date.now());
    return merged;
  }, [state.config, packSettings, publishedPricing]);
  return { ...state, config, retry: () => setAttempt((n) => n + 1) };
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
