/** Same-browser recovery only. No card data; durable drafts expire after 24 hours. */
const TTL = 24 * 60 * 60 * 1000;
const CAP = "3l-checkout";
const DRAFT = "3l-checkout-draft";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type SavedCheckout = {
  key: string;
  retryReady?: boolean;
  fingerprint?: string;
  cartHash?: string;
};
function stored(key: string): unknown {
  try {
    const raw = localStorage.getItem(`${key}-recovery`);
    if (raw && raw.length <= 65536) {
      const saved = JSON.parse(raw);
      if (
        Number.isFinite(saved.expiresAt) &&
        saved.expiresAt > Date.now() &&
        saved.expiresAt <= Date.now() + TTL
      )
        return saved.value;
      localStorage.removeItem(`${key}-recovery`);
    }
  } catch {
    /* Storage is optional, except before creating a payment. */
  }
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}
function persist(key: string, value: unknown) {
  let saved = false;
  try {
    localStorage.setItem(
      `${key}-recovery`,
      JSON.stringify({ expiresAt: Date.now() + TTL, value }),
    );
    saved = true;
  } catch {
    /* Session fallback below. */
  }
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
    saved = true;
  } catch {
    /* Durable fallback above. */
  }
  return saved;
}
export function savedCheckout(): SavedCheckout | null {
  const value = stored(CAP);
  return value &&
    typeof value === "object" &&
    "key" in value &&
    typeof value.key === "string" &&
    uuid.test(value.key)
    ? (value as SavedCheckout)
    : null;
}
export function rememberCheckout(value: SavedCheckout) {
  if (!persist(CAP, value))
    throw new Error(
      "This browser cannot save your checkout securely. Please enable browser storage or contact 3L before paying.",
    );
}
export function savedDraft(): unknown {
  return stored(DRAFT);
}
export function rememberDraft(value: unknown) {
  persist(DRAFT, value);
}
export function clearCheckoutDraft() {
  try {
    sessionStorage.removeItem(DRAFT);
  } catch {
    /* Optional storage. */
  }
  try {
    localStorage.removeItem(`${DRAFT}-recovery`);
  } catch {
    /* Optional storage. */
  }
}
