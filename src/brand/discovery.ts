import { packSpec } from "../../shared/pack-composition";
import { availableSku } from "../../shared/commerce-policy";
import type { LiveCatalog, LiveProduct, LiveOption } from "./live-catalog";
import type { CheckoutConfig, CartLine } from "./cart";
import curated from "./recommendation-rules.json";

export type DiscoveryProduct = {
  product: LiveProduct;
  options: LiveOption[];
  priceFils: number;
};
export type RecommendationRule = {
  id: string;
  whenCategories: string[];
  targetFamilies: string[];
  priority: number;
};
/** UI eligibility is an intersection, not a new price/availability authority. */
export function discoveryProducts(
  catalog: LiveCatalog,
  config: CheckoutConfig | null,
  now: Date,
): DiscoveryProduct[] {
  if (!config?.enabled || config.catalogAvailable === false) return [];
  const server = new Map(config.products.map((p) => [p.id, p]));
  const seen = new Set<string>();
  return catalog.products.flatMap((product) => {
    if (seen.has(product.id)) return [];
    seen.add(product.id);
    const options = product.options.filter(
      (o) =>
        o.available &&
        o.orderable &&
        availableSku(o.id, now) &&
        (!config.personalizedPacks?.enabled ||
          !packSpec(o.id) ||
          !!config.personalizedPacks.rules.find(
            (rule) =>
              rule.packSkuId === o.id && rule.componentSkuIds.length > 0,
          )) &&
        server.get(o.id)?.priceFils === o.priceFils,
    );
    return options.length
      ? [
          {
            product,
            options,
            priceFils: Math.min(
              ...options.map((o) => server.get(o.id)!.priceFils),
            ),
          },
        ]
      : [];
  });
}
export const normalizeSearch = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
// Semantic vocabulary only: never a product list or pricing source.
const synonyms = [
  ["milk", "leche", "حليب"],
  ["cake", "cakes", "pastel", "pasteles", "tarta", "كيك", "كعكة"],
  ["concha", "conchas", "كونشا", "كونشاس"],
  ["chocolate", "cacao", "شوكولاتة"],
  ["vanilla", "vainilla", "فانيليا"],
  ["strawberry", "strawberries", "fresa", "fresas", "فراولة"],
  ["pistachio", "pistacchio", "pistacho", "pistache", "فستق"],
  ["candles", "candle", "velas", "vela", "شموع", "شمعة"],
].map((group) => group.map(normalizeSearch));
function near(a: string, b: string) {
  if (
    a.length < 4 ||
    b.length < 4 ||
    a[0] !== b[0] ||
    Math.abs(a.length - b.length) > 1
  )
    return false;
  if (a.length === b.length) {
    const different = [...a].flatMap((c, i) => (c !== b[i] ? [i] : []));
    return (
      different.length === 1 ||
      (different.length === 2 &&
        different[1] === different[0]! + 1 &&
        a[different[0]!] === b[different[1]!] &&
        a[different[1]!] === b[different[0]!])
    );
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  let i = 0,
    j = 0,
    skips = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
    } else {
      j++;
      if (++skips > 1) return false;
    }
  }
  return true;
}
export function searchProducts(
  catalog: LiveCatalog,
  config: CheckoutConfig | null,
  query: string,
  now: Date,
): DiscoveryProduct[] {
  const q = normalizeSearch(query.slice(0, 120));
  if (!q) return [];
  const terms = q.split(" ").slice(0, 12);
  return discoveryProducts(catalog, config, now)
    .map((hit) => {
      const p = hit.product,
        category = catalog.categories.find((c) => c.id === p.categoryId),
        family = catalog.families.find((f) => f.id === p.familyId);
      const names = Object.values(p.content)
        .flatMap((t) => [t.name, t.variantLabel])
        .filter((s): s is string => !!s)
        .map(normalizeSearch);
      const fields = [
        ...names,
        ...hit.options.flatMap((o) => [
          o.flavor,
          ...Object.values(o.content).flatMap((t) => [t.name, t.variantLabel]),
        ]),
        family?.name,
        category?.name,
        ...Object.values(category?.content ?? {}).map((t) => t.name),
        ...Object.values(p.content).map((t) => t.description),
      ]
        .filter((s): s is string => !!s)
        .map(normalizeSearch);
      const words = fields.flatMap((s) => s.split(" "));
      let score = names.includes(q) ? 100 : 0;
      for (const term of terms) {
        const aliases = synonyms.find((g) => g.includes(term)) ?? [term];
        const rank = Math.max(
          0,
          ...aliases.map((alias) =>
            words.includes(alias)
              ? names.some((n) => n.split(" ").includes(alias))
                ? 20
                : 10
              : words.some((w) => alias.length >= 3 && w.startsWith(alias))
                ? 5
                : words.some((w) => near(alias, w))
                  ? 2
                  : 0,
          ),
        );
        if (!rank) return { hit, score: 0 };
        score += rank;
      }
      return { hit, score };
    })
    .filter((r) => r.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.hit.product.id.localeCompare(b.hit.product.id),
    )
    .map((r) => r.hit);
}
export function recommendations(
  catalog: LiveCatalog,
  config: CheckoutConfig | null,
  lines: CartLine[],
  contextProductId: string | undefined,
  now: Date,
  rules: RecommendationRule[] = curated.rules,
): DiscoveryProduct[] {
  const inCart = new Set(lines.map((l) => l.productId));
  const contexts = catalog.products.filter(
    (p) => p.id === contextProductId || p.options.some((o) => inCart.has(o.id)),
  );
  const categories = new Set(contexts.map((p) => p.categoryId));
  const ranked = discoveryProducts(catalog, config, now)
    .filter(
      (h) =>
        h.product.id !== contextProductId &&
        !h.product.options.some((o) => inCart.has(o.id)),
    )
    .map((hit) => ({
      hit,
      priority: Math.max(
        0,
        ...rules
          .filter(
            (r) =>
              r.whenCategories.some((c) => categories.has(c)) &&
              r.targetFamilies.includes(hit.product.familyId),
          )
          .map((r) => r.priority),
      ),
    }))
    .filter((h) => h.priority > 0)
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        a.hit.product.id.localeCompare(b.hit.product.id),
    );
  const families = new Set<string>();
  return ranked
    .flatMap(({ hit }) => {
      if (families.has(hit.product.familyId)) return [];
      families.add(hit.product.familyId);
      return [hit];
    })
    .slice(0, 3);
}
