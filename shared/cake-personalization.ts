/**
 * 3L cake-size & inscription contract, shared by storefront and checkout.
 * Source: approved Founder vocabulary (Mini / Small / Medium, 15/20/30).
 * Canonical SKUs, prices and historical population ranges remain unchanged.
 * Only explicit, recognized cake SKUs accept inscriptions.
 */
export type CakeSizeKey = "mini" | "small" | "medium";
export type CakeSizeSpec = {
  key: CakeSizeKey;
  maxCharacters: 15 | 20 | 30;
  people: string | null;
};
const SIZE: Record<CakeSizeKey, Pick<CakeSizeSpec, "key" | "maxCharacters">> = {
  mini: { key: "mini", maxCharacters: 15 },
  small: { key: "small", maxCharacters: 20 },
  medium: { key: "medium", maxCharacters: 30 },
};
/** Exact trusted 3L cake SKU conventions only; no blanket bakery eligibility. */
export function cakeSizeForSku(sku: string): CakeSizeSpec | null {
  if (sku.startsWith("tres-leches-")) {
    const suffix = sku.match(/-(13|68|1416)-personas$/);
    if (!suffix) return null;
    const key: CakeSizeKey =
      suffix[1] === "13" ? "mini" : suffix[1] === "68" ? "small" : "medium";
    const people = suffix[1] === "13" ? "1–3" : suffix[1] === "68" ? "6–8" : "14–16";
    return { ...SIZE[key], people };
  }
  if (sku.startsWith("special-flavours-cake-")) {
    const suffix = sku.match(/-(mini|small|big)$/);
    if (!suffix) return null;
    const key: CakeSizeKey = suffix[1] === "big" ? "medium" : suffix[1] as CakeSizeKey;
    return { ...SIZE[key], people: null };
  }
  return null;
}
export const cakeSizeName=(size:CakeSizeSpec)=>({
  mini:"Mini",small:"Small",medium:"Medium",
})[size.key];
export function cakeServingCopy(size:CakeSizeSpec,lang:"en"|"es"|"ar"):string|null {
  if (!size.people) return null;
  return lang==="es" ? `Para ${size.people} personas` :
    lang==="ar" ? `تكفي ${size.people} أشخاص` : `Serves ${size.people} people`;
}
export function validCakeMessage(sku:string,message:string):boolean {
  const policy=cakeSizeForSku(sku);
  return !!policy && !!message.trim() && message===message.trim() &&
    message.length<=policy.maxCharacters &&
    !/[\x00-\x1F\x7F]/.test(message);
}
