import { selectedProductMedia } from "./media";
import { menuFamilies, storefrontProductForSku } from "./menu";
/** Client-approved content only. Demo Commerce OS records never populate this manifest. */
export type AssetStatus =
  "AVAILABLE" | "MISSING" | "PLACEHOLDER-DATA-SLOT" | "NEEDS-CLIENT-ASSET";
export type Asset = {
  id: string;
  status: AssetStatus;
  src: string | null;
  alt: string;
  source: string;
};
const pending = (id: string, alt: string): Asset => ({
  id,
  alt,
  status: "NEEDS-CLIENT-ASSET",
  src: null,
  source: "Client delivery pending",
});
const mark = (id: string, alt: string): Asset => ({
  id,
  alt,
  status: "AVAILABLE",
  src: `/brand/${id}.png`,
  source: "Corporate manual, page 4; original artwork extraction",
});
export const assets = {
  wordmark: mark("wordmark", "Pastelerías 3L — Mexico City since 1982"),
  circle: mark("circle", "Pastelerías 3L"),
  circleNegative: mark("circle-negative", "Pastelerías 3L"),
  icon: mark("icon", "3L"),
  stars: mark("stars", ""),
  hero: {
    id: "hero",
    status: "AVAILABLE",
    src: "/brand/approved/packaging-720.mp4",
    alt: "Liza packaging a 3L cake",
    source:
      "Client-approved cake packaging .MP4, Drive 16SCtemsc6Q3tDhvXIk73K17p2FPk-P5x",
  } as Asset,
  poster: {
    id: "hero-poster",
    status: "AVAILABLE",
    src: "/brand/approved/packaging-poster.webp",
    alt: "3L cake in its branded box",
    source: "Frame from client-approved packaging film",
  } as Asset,
  pattern: pending("pattern", "Original 3L pattern"),
  ticker: pending("ticker", "Original 3L illustrated motifs"),
  alicia: pending("alicia", "Approved portrait of Alicia"),
  family: pending("family", "3L family baking together"),
  slices: pending("slices", "3L cake slices"),
  social: pending("social", "Approved 3L community photography"),
  dubai: pending("dubai", "Original 3L Dubai illustration"),
  promotion: pending("promotion", "Approved promotional photography"),
  og: pending("open-graph", "Approved sharing image"),
};
export type Product = {
  id: string;
  name: string | null;
  image: Asset;
  status: "pending" | "available" | "out-of-stock";
  description: string | null;
  /**
   * Price in fils, matching the Commerce OS catalog convention
   * (`CatalogItem.priceFils`): 100 fils to the dirham. `null` until the owner has
   * confirmed a price; the card then shows no price rather than guessing.
   */
  priceFils: number | null;
};

/** Formats a stored fils price for display, e.g. 2500 -> "AED 25". */
export function formatAed(priceFils: number): string {
  const aed = priceFils / 100;
  return `AED ${Number.isInteger(aed) ? aed : aed.toFixed(2)}`;
}
export const slots = (category: string, count: number): Product[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${category}-${i + 1}`,
    name: null,
    image: pending(
      `${category}-${i + 1}`,
      `${category} photograph pending approval`,
    ),
    status: "pending",
    description: null,
    priceFils: null,
  }));
/** Current Liza menu: each server-priced option has its own stable SKU. */
export const menuProducts: Product[] = menuFamilies.flatMap((family) =>
  family.options.map((option) => ({
    id: option.id,
    name: [
      family.name,
      family.id.startsWith("conchas-") ? "" : option.variant,
      option.size,
    ]
      .filter(Boolean)
      .join(" · "),
    image: {
      id: family.id,
      alt: `${family.name} family photography`,
      status:
        selectedProductMedia(
          storefrontProductForSku(option.id)?.id,
          family.id,
          option.variant,
          option.size,
        ) || family.image
          ? ("AVAILABLE" as const)
          : ("NEEDS-CLIENT-ASSET" as const),
      src:
        selectedProductMedia(
          storefrontProductForSku(option.id)?.id,
          family.id,
          option.variant,
          option.size,
        )?.derivatives.find((d) => d.format === "webp" && d.width === 640)
          ?.src ?? family.image,
      source: family.source,
    },
    status: "available" as const,
    description: family.advanceOrder
      ? "Order at least 24 hours in advance"
      : null,
    priceFils: option.priceFils,
  })),
);
export const collections = {
  featured: slots("Featured cake", 3),
  bakery: menuProducts.filter(
    (product) =>
      menuFamilies.find((family) =>
        family.options.some((option) => option.id === product.id),
      )?.category === "pan",
  ),
  jars: menuProducts.filter(
    (product) =>
      menuFamilies.find((family) =>
        family.options.some((option) => option.id === product.id),
      )?.category === "jars",
  ),
  custom: slots("Custom cake category", 3),
};
export const occasions = [
  "Birthdays",
  "Weddings",
  "Baby Showers",
  "Anniversaries",
  "Corporate",
  "Other Moments",
];
export const occasionAssets = occasions.map((name) =>
  pending(`occasion-${name}`, `${name} gallery pending approval`),
);
export const approved = {
  heritage: "MEXICO CITY SINCE 1982",
  micro: "Exquisite Taste of 3L's Tres Leches Cakes!",
  hero: "Handcrafted Tres Leches, born in Mexico in 1982.",
  dubai:
    "We deliver across Dubai, so your favorite cakes, jars and treats can be part of any moment, wherever you are.",
  newsletter:
    "Be the first to know about new creations, special occasions and sweet surprises.",
  consent: "Yes, I’d love to receive sweet news from 3L.",
};
export type Testimonial = {
  id: string;
  source: "Google" | "Instagram" | "WhatsApp";
  text: string;
  verified: boolean;
  permission: boolean;
};
export const testimonials: Testimonial[] = [];
export const visibleTestimonials = (items: Testimonial[]) =>
  items.filter((item) => item.verified && item.permission && item.text.trim());
export const destinations: {
  whatsapp: string | null;
  instagram: string | null;
  tiktok: string | null;
  privacy: string | null;
} = {
  /**
   * Official WhatsApp support number, confirmed by the owner 22 September
   * 2026 (Liza). Stored unspaced so `whatsappUrl` produces wa.me/971521683319.
   * Support only; customer orders are placed through the web cart and checkout.
   */
  whatsapp: "+971585943319",
  instagram: "https://www.instagram.com/3ldubai/",
  tiktok: null,
  privacy: null,
};
export const promotion: {
  enabled: boolean;
  message: string | null;
  cta: string | null;
} = { enabled: false, message: null, cta: null };
export function whatsappUrl(
  number: string | null,
  message: string,
): string | null {
  if (!number || !/^\+?[1-9]\d{7,14}$/.test(number)) return null;
  return `https://wa.me/${number.replace(/^\+/, "")}?text=${encodeURIComponent(message)}`;
}
export function productInquiry(product: Product): string | null {
  if (!product.name || product.status !== "available") return null;
  const price = product.priceFils ? ` (${formatAed(product.priceFils)})` : "";
  return `Hello 3L, I’d like to order ${product.name}${price}.`;
}
export type NewsletterProvider = {
  subscribe(
    input: { email: string; consent: boolean },
    signal: AbortSignal,
  ): Promise<void>;
};
export const newsletterProvider: NewsletterProvider = {
  async subscribe(_input, signal) {
    if (signal.aborted) throw new Error("Request cancelled.");
    throw new Error(
      "Newsletter subscriptions are not available yet. Please try again later.",
    );
  },
};
export function validateNewsletter(
  email: string,
  consent: boolean,
): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254)
    return "Enter a valid email address.";
  if (!consent) return "Please confirm your consent before subscribing.";
  return null;
}
