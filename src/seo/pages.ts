/**
 * Search metadata for the public pages, built only from verified business
 * facts (`src/brand/business.ts`, `src/brand/content.ts`). A fact the owner has
 * not supplied is omitted, never guessed: no opening hours, coordinates, price
 * range, ratings or reviews. Nothing here reads a catalog: products, prices and
 * availability belong to the published catalog revision (Product Hub) and get
 * no structured data until pages are rendered from it.
 */
import { business, contactChannels, policyRoutes, type PolicyPath } from "../brand/business";
import { destinations } from "../brand/content";
import { localizedSource, type Locale } from "../brand/locales/engine";
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
  "/bakery": {
    name: "Bakery",
    title: `Bakery — ${siteName}`,
    description: `Explore the traditional Mexican bakery and signature cakes from ${business.tradingName} in Dubai.`,
  },
  "/journal": {
    name: "The 3L Journal",
    title: `Rosca de Reyes · The 3L Journal — ${siteName}`,
    description: `From ${business.tradingName}: discover why families in Mexico share Rosca de Reyes on January 6 and celebrate Día de la Candelaria.`,
  },
  "/how-to-order": {
    name: "How to order",
    title: `How to order — ${siteName}`,
    description: `How to order from ${business.tradingName} in Dubai: choose your products, delivery or pickup, a date and time window, then pay securely online.`,
  },
} as const;

const homeCopy = {
  title: "Pastelerías 3L Dubai — Tres Leches, Mexico City since 1982",
  description: "Discover the world of Pastelerías 3L: Tres Leches cakes, cake jars and a Mexican family tradition in Dubai. Mexico City since 1982.",
};

const publicCopy = {
  en: {
    "/cart": ["Your basket", "Review the products and quantities in your 3L basket."],
    "/checkout": ["Secure checkout", "Review your order and choose delivery or pickup before payment."],
    "/checkout/return": ["Check your order", "Check the status of your 3L order."],
  },
  es: {
    "/": ["Pastelerías 3L Dubái — Tres leches, Ciudad de México desde 1982", "Descubre Pastelerías 3L en Dubái: pasteles de tres leches, postres en frasco y una tradición familiar mexicana que comenzó en 1982."],
    "/menu": ["Menú", "Pasteles de tres leches, postres en frasco, conchas y pan de muerto en Dubái. Haz tu pedido en línea para entrega o recogida."],
    "/bakery": ["Panadería", "Descubre la panadería mexicana tradicional y los pasteles de Pastelerías 3L en Dubái."],
    "/journal": ["Rosca de Reyes · Diario de 3L", "Descubre por qué las familias mexicanas comparten la rosca de Reyes el 6 de enero y celebran el Día de la Candelaria."],
    "/how-to-order": ["Cómo hacer un pedido", "Elige tus productos, selecciona entrega o recogida, elige una fecha y un horario y paga en línea de forma segura."],
    "/cart": ["Tu carrito", "Revisa los productos y las cantidades en tu carrito de 3L."],
    "/checkout": ["Pago seguro", "Revisa tu pedido y elige entrega o recogida antes de pagar."],
    "/checkout/return": ["Consulta tu pedido", "Consulta el estado de tu pedido de 3L."],
  },
  ar: {
    "/": ["Pastelerías 3L دبي — تريس ليتشيس، من مدينة مكسيكو منذ ١٩٨٢", "تعرّفوا على Pastelerías 3L في دبي: كعكات تريس ليتشيس وحلويات في مرطبانات وتقليد عائلي مكسيكي بدأ عام ١٩٨٢."],
    "/menu": ["القائمة", "كعكات تريس ليتشيس وحلويات في مرطبانات وكونتشاس وبان دي مويرتو في دبي. اطلبوا عبر الإنترنت للتوصيل أو الاستلام."],
    "/bakery": ["المخبوزات", "تعرّفوا على المخبوزات المكسيكية التقليدية وكعكات Pastelerías 3L المميّزة في دبي."],
    "/journal": ["روسكا دي رييس · مجلة 3L", "تعرّفوا على سبب تقاسم العائلات المكسيكية خبز روسكا دي رييس في ٦ يناير واحتفالها بعيد الشموع."],
    "/how-to-order": ["كيفية الطلب", "اختاروا المنتجات والتوصيل أو الاستلام، ثم حدّدوا التاريخ والفترة وادفعوا عبر الإنترنت بأمان."],
    "/cart": ["سلة التسوق", "راجعوا المنتجات والكميات في سلة تسوق 3L."],
    "/checkout": ["إتمام الطلب بأمان", "راجعوا طلبكم واختاروا التوصيل أو الاستلام قبل الدفع."],
    "/checkout/return": ["تحقق من طلبك", "تحققوا من حالة طلبكم لدى 3L."],
  },
} satisfies Record<Locale, Record<string, [string, string]>>;

export const storefrontLabels = {
  en: { menu: "Menu", home: "Home", notFound: "Page not found", productOptions: "Enable JavaScript to view available options and order online.", javascript: "Enable JavaScript for interactive selections. Online checkout requires JavaScript. For help, contact us on WhatsApp at +971 58 594 3319.", wordmark: "3L pastelerías, Mexico City since 1982" },
  es: { menu: "Menú", home: "Inicio", notFound: "Página no encontrada", productOptions: "Activa JavaScript para ver las opciones disponibles y hacer tu pedido en línea.", javascript: "Activa JavaScript para seleccionar productos y hacer tu pedido en línea. Si necesitas ayuda, contáctanos por WhatsApp al +971 58 594 3319.", wordmark: "3L pastelerías, Ciudad de México desde 1982" },
  ar: { menu: "القائمة", home: "الرئيسية", notFound: "الصفحة غير موجودة", productOptions: "فعّل JavaScript للاطّلاع على الخيارات المتاحة والطلب عبر الإنترنت.", javascript: "فعّل JavaScript لاختيار المنتجات وإتمام الطلب عبر الإنترنت. للمساعدة، تواصل معنا عبر واتساب على الرقم ‎+971 58 594 3319‎.", wordmark: "3L pastelerías، من مدينة مكسيكو منذ ١٩٨٢" },
} as const;

export function storefrontMetadata(
  path: string, locale: Locale, policies: PolicyMeta, home = homeCopy,
) {
  const copy: Record<string, [string, string]> = publicCopy[locale];
  const entry = copy[path];
  if (entry) return { title: path === "/" ? entry[0] : `${entry[0]} — ${siteName}`, description: entry[1] };
  if (path === "/") return home;
  if (Object.hasOwn(storePages, path)) return storePages[path as keyof typeof storePages];
  const policy = Object.hasOwn(policies, path) ? policies[path as PolicyPath] : undefined;
  if (policy) return {
    title: `${localizedSource(policy.metaTitle, locale)} — ${siteName}`,
    description: localizedSource(policy.description, locale),
  };
  return undefined;
}

export function productMetadata(name: string, description?: string | null) {
  return { title: `${name} — ${siteName}`, description: description || `${name} · ${siteName}` };
}

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
    contactPoint: contactChannels().map((contact) => ({
      "@type": "ContactPoint",
      contactType: contact.kind === "whatsapp" ? "orders" : "customer support",
      name: contact.label,
      ...(contact.kind === "email" ? { email: contact.value } : { telephone: dial(contact.value) }),
      ...(contact.kind === "whatsapp" ? { url: contact.href } : {}),
      areaServed: "AE",
    })),
    ...(destinations.instagram ? { sameAs: [destinations.instagram] } : {}),
  };
}

export const websiteJsonLd = (origin: string, locale: Locale = "en") => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${absoluteUrl(origin, "/")}#website`,
  url: absoluteUrl(origin, "/"),
  name: siteName,
  inLanguage: locale,
  publisher: { "@id": `${absoluteUrl(origin, "/")}#business` },
});

export const breadcrumbJsonLd = (
  origin: string,
  path: string,
  name: string,
  locale: Locale = "en",
) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: storefrontLabels[locale].home,
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
  locale: Locale = "en",
): SeoPage[] {
  const lastmod = isoDate(business.policiesUpdated);
  const homeMeta = storefrontMetadata("/", locale, policies, home)!;
  return [
    {
      path: "/",
      ...homeMeta,
      jsonLd: [businessJsonLd(origin, homeMeta.description), websiteJsonLd(origin, locale)],
    },
    ...Object.entries(storePages).map(([path, page]) => ({
      path,
      ...storefrontMetadata(path, locale, policies, home)!,
      jsonLd: [breadcrumbJsonLd(origin, path, locale === "en" ? page.name : publicCopy[locale][path as keyof typeof publicCopy.ar][0], locale)],
    })),
    ...policyRoutes.map(({ path, label }) => ({
      path,
      ...storefrontMetadata(path, locale, policies, home)!,
      ...(lastmod ? { lastmod } : {}),
      jsonLd: [breadcrumbJsonLd(origin, path, localizedSource(label, locale), locale)],
    })),
  ];
}
