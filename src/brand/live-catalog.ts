import type { PackEligibility } from "../../shared/pack-composition";
/**
 * Published catalog, read at runtime.
 *
 * The server marks the page (`<html data-catalog="dynamic">`) when dynamic adoption
 * is active. Without the mark this module does nothing and the storefront uses the
 * catalog shipped with the build, exactly as before. With it, the build's catalog is
 * never shown: the menu waits for the published revision and, if none can be
 * obtained, offers nothing for sale.
 *
 * Prices here are for display. The server prices every cart and checkout itself.
 */
import { useSyncExternalStore } from "react";

type Locale = "en" | "es" | "ar";
type Content = {
  name: string | null;
  description: string | null;
  variantLabel: string | null;
  sizeLabel?: string | null;
};
type Translations = Record<Locale, Content>;
type MediaLink = {
  assetId: string;
  role: "primary" | "gallery";
  order: number;
};
export type LiveAsset = {
  id: string;
  version: string;
  alt: Translations;
  derivatives: {
    src: string;
    format: "avif" | "webp" | "legacy";
    width: number | null;
    height: number | null;
  }[];
};
export type LiveOption = {
  id: string;
  /** The SKU's catalog name: what the cart shows. */
  name: string;
  flavor: string | null;
  size: string | null;
  packQuantity: number | null;
  content: Translations;
  media: MediaLink[];
  priceFils: number;
  available: boolean;
  orderable: boolean;
};
export type LiveProduct = {
  id: string;
  slug: string;
  familyId: string;
  categoryId: string;
  content: Translations;
  media: MediaLink[];
  options: LiveOption[];
};
export type LiveCatalog = {
  personalizedPacks?: {
    enabled: boolean;
    conchasEnabled?: boolean;
    rules: PackEligibility;
  };
  schemaVersion: 1;
  revision: string;
  publishedAt: string | null;
  currency: "AED";
  categories: {
    id: string;
    name: string;
    image: string | null;
    media: MediaLink[];
    content: Translations;
  }[];
  families: {
    id: string;
    categoryId: string;
    name: string;
    pack: boolean;
    advanceOrder: boolean;
  }[];
  products: LiveProduct[];
  assets: LiveAsset[];
};
export type LiveState =
  | { status: "bundled" }
  | { status: "loading" }
  | { status: "live"; catalog: LiveCatalog }
  | { status: "unavailable" };

const BUNDLED: LiveState = { status: "bundled" };
const ENDPOINT = "/api/storefront/catalog";
const REFRESH_MS = 60_000;
const RETRY_MS = 5_000;

export const dynamicCatalog = () =>
  typeof document !== "undefined" &&
  document.documentElement.dataset.catalog === "dynamic";

let state: LiveState = dynamicCatalog()
  ? { status: "loading" }
  : { status: "bundled" };
let etag: string | null = null;
let inFlight: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

/** Structural check: a malformed answer is treated as no answer. */
function valid(value: unknown): value is LiveCatalog {
  const c = value as LiveCatalog;
  const text = (v: unknown) => typeof v === "string" && v.length > 0;
  return (
    !!c &&
    c.schemaVersion === 1 &&
    text(c.revision) &&
    Array.isArray(c.categories) &&
    Array.isArray(c.families) &&
    Array.isArray(c.assets) &&
    Array.isArray(c.products) &&
    c.products.every(
      (p) =>
        text(p.id) &&
        text(p.slug) &&
        text(p.familyId) &&
        text(p.categoryId) &&
        !!p.content?.en &&
        Array.isArray(p.media) &&
        Array.isArray(p.options) &&
        p.options.every(
          (o) =>
            text(o.id) &&
            Number.isSafeInteger(o.priceFils) &&
            o.priceFils > 0 &&
            typeof o.available === "boolean",
        ),
    )
  );
}
function set(next: LiveState) {
  state = next;
  overlay = null;
  listeners.forEach((l) => l());
}
function schedule(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void refreshLiveCatalog(), ms);
}
/** Revalidates against the server. Concurrent callers share one request. */
export function refreshLiveCatalog(): Promise<void> {
  if (!dynamicCatalog()) return Promise.resolve();
  inFlight ??= (async () => {
    try {
      const res = await fetch(ENDPOINT, {
        headers: etag ? { "If-None-Match": etag } : {},
        cache: "no-store",
      });
      if (res.status === 304) return schedule(REFRESH_MS);
      if (res.status === 200) {
        const body: unknown = await res.json();
        if (valid(body)) {
          etag = res.headers.get("ETag");
          set({ status: "live", catalog: body });
          return schedule(REFRESH_MS);
        }
      }
      // No valid published revision: stop offering what was shown before.
      etag = null;
      set({ status: "unavailable" });
      schedule(RETRY_MS);
    } catch {
      // Offline: keep what is on screen (nothing can be bought offline) and retry.
      if (state.status !== "live") set({ status: "unavailable" });
      schedule(RETRY_MS);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
if (dynamicCatalog()) {
  void refreshLiveCatalog();
  const wake = () => {
    if (document.visibilityState === "visible") void refreshLiveCatalog();
  };
  window.addEventListener("focus", wake);
  document.addEventListener("visibilitychange", wake);
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const liveState = () => state;
export function useLiveCatalog(): LiveState {
  return useSyncExternalStore(subscribe, liveState, () => BUNDLED);
}
/** Whether the published catalog offers this SKU now; null when it is not in use. */
export function liveOrderable(sku: string): boolean | null {
  if (state.status !== "live") return null;
  for (const p of state.catalog.products)
    for (const o of p.options) if (o.id === sku) return o.orderable;
  return false;
}

// Published translations for names the build's resources do not know (new or renamed).
let overlay: Map<string, Partial<Record<Locale, string>>> | null = null;
function translations() {
  if (overlay) return overlay;
  overlay = new Map();
  if (state.status !== "live") return overlay;
  const add = (
    source: string | null | undefined,
    pick: (c: Content) => string | null | undefined,
    t: Translations,
  ) => {
    if (!source) return;
    const entry = overlay!.get(source) ?? {};
    for (const locale of ["es", "ar"] as const) {
      const value = pick(t[locale]);
      if (value) entry[locale] = value;
    }
    overlay!.set(source, entry);
  };
  const { catalog } = state;
  for (const c of catalog.categories) add(c.name, (x) => x.name, c.content);
  for (const a of catalog.assets) add(a.alt.en.name, (x) => x.name, a.alt);
  for (const p of catalog.products) {
    add(p.content.en.name, (x) => x.name, p.content);
    add(p.content.en.description, (x) => x.description, p.content);
    // Keyed by the English wording customers see: flavour, size and cart name.
    for (const o of p.options) {
      add(o.flavor, (x) => x.variantLabel, o.content);
      add(o.size, (x) => x.sizeLabel, o.content);
      add(o.name, (x) => x.name, o.content);
    }
  }
  return overlay;
}
/** The published translation of a catalog string, when the catalog provides one. */
export function liveCopy(source: string, locale: string): string | null {
  if (state.status !== "live" || locale === "en") return null;
  return translations().get(source)?.[locale as Locale] ?? null;
}
