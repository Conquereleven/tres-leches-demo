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
  hero: pending("hero", "Approved Tres Leches soaking film"),
  poster: pending("hero-poster", "Tres Leches soaking film poster"),
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
};
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
  }));
export const collections = {
  featured: slots("Featured cake", 3),
  bakery: slots("Bakery item", 3),
  jars: slots("Cake jar", 3),
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
} = { whatsapp: null, instagram: null, tiktok: null, privacy: null };
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
  return product.name && product.status === "available"
    ? `Hello 3L, I’d like to order ${product.name}.`
    : null;
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
