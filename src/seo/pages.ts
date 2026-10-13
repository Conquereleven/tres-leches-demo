/**
 * Search metadata for the public pages, built only from verified business
 * facts (`src/brand/business.ts`, `src/brand/content.ts`). A fact the owner has
 * not supplied is omitted, never guessed: no opening hours, coordinates, price
 * range, ratings or reviews. Nothing here reads a catalog: products, prices and
 * availability belong to the published catalog revision (Product Hub) and get
 * no structured data until pages are rendered from it.
 */
import { business, policyRoutes, type PolicyPath } from "../brand/business";
import { destinations } from "../brand/content";
import { absoluteUrl, type SeoPage, type SocialImage } from "../../shared/seo";

export const siteName = `${business.tradingName} Dubai`;

/** The official square mark. A 1200×630 social image is an owner input. */
export const socialImage: SocialImage = {
  path: "/brand/icon.png",
  width: 410,
  height: 410,
  alt: `${business.tradingName} logo`,
};

/** Public pages rendered in the browser that have no policy record. */
export const storePages = {
  "/menu": {
    name: "Menu",
    title: `Menu — ${siteName}`,
    description: `Tres Leches cakes, cake jars, conchas, Pan de Muerto and Mexican bakery from ${business.tradingName} in Dubai. Order online for delivery or pickup.`,
  },
  "/how-to-order": {
    name: "How to order",
    title: `How to order — ${siteName}`,
    description: `How to order from ${business.tradingName} in Dubai: choose your products, delivery or pickup, a date and time window, then pay securely online.`,
  },
} as const;

const months = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
/** "22 September 2026" → "2026-09-22"; undefined when it is not a real date. */
export function isoDate(display: string): string | undefined {
  const m = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(display.trim());
  if (!m) return undefined;
  const month = months.indexOf(m[2]!.toLowerCase());
  const day = Number(m[1]);
  if (month < 0 || day < 1 || day > 31) return undefined;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Street part of the confirmed address; the whole line if it cannot be split. */
function streetAddress(address: string) {
  const tail = `, ${business.city}, ${business.country}`;
  return address.endsWith(tail) ? address.slice(0, -tail.length) : address;
}

const dial = (phone: string) => phone.replace(/\s+/g, "");

export function businessJsonLd(origin: string, description: string) {
  const logo = absoluteUrl(origin, socialImage.path);
  return {
    "@context": "https://schema.org",
    "@type": "Bakery",
    "@id": `${absoluteUrl(origin, "/")}#business`,
    name: business.tradingName,
    ...(business.legalName ? { legalName: business.legalName } : {}),
    description,
    url: absoluteUrl(origin, "/"),
    logo,
    image: logo,
    ...(business.address
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: streetAddress(business.address),
            addressLocality: business.city,
            addressCountry: "AE",
          },
        }
      : {}),
    areaServed: { "@type": "City", name: business.city },
    currenciesAccepted: business.currency,
    paymentAccepted: "Visa, Mastercard",
    ...(business.email ? { email: business.email } : {}),
    ...(business.supportContacts.length
      ? {
          contactPoint: business.supportContacts.map((contact) => ({
            "@type": "ContactPoint",
            contactType: "customer support",
            name: contact.name,
            telephone: dial(contact.phone),
            areaServed: "AE",
          })),
        }
      : {}),
    ...(destinations.instagram ? { sameAs: [destinations.instagram] } : {}),
  };
}

export const websiteJsonLd = (origin: string) => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${absoluteUrl(origin, "/")}#website`,
  url: absoluteUrl(origin, "/"),
  name: siteName,
  inLanguage: "en",
  publisher: { "@id": `${absoluteUrl(origin, "/")}#business` },
});

export const breadcrumbJsonLd = (
  origin: string,
  path: string,
  name: string,
) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: absoluteUrl(origin, "/"),
    },
    {
      "@type": "ListItem",
      position: 2,
      name,
      item: absoluteUrl(origin, path),
    },
  ],
});

export type PolicyMeta = Record<
  PolicyPath,
  { metaTitle: string; description: string }
>;

/**
 * Every indexable page, in sitemap order. `home` is the approved wording of
 * `index.html`; `policies` comes from the policy pages themselves.
 */
export function seoPages(
  origin: string,
  home: { title: string; description: string },
  policies: PolicyMeta,
): SeoPage[] {
  const lastmod = isoDate(business.policiesUpdated);
  return [
    {
      path: "/",
      ...home,
      jsonLd: [businessJsonLd(origin, home.description), websiteJsonLd(origin)],
    },
    ...Object.entries(storePages).map(([path, page]) => ({
      path,
      title: page.title,
      description: page.description,
      jsonLd: [breadcrumbJsonLd(origin, path, page.name)],
    })),
    ...policyRoutes.map(({ path, label }) => ({
      path,
      title: `${policies[path].metaTitle} — ${siteName}`,
      description: policies[path].description,
      ...(lastmod ? { lastmod } : {}),
      jsonLd: [breadcrumbJsonLd(origin, path, label)],
    })),
  ];
}
