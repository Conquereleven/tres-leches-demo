/**
 * Indexable product pages at `/menu/<slug>` and the live sitemap
 * (3L-SEO-AEO-002, Track B).
 *
 * Everything a crawler reads here comes from `storefrontCatalog(state)`: the
 * published Catalog Foundation revision, its prices from `State.catalog`, and
 * the same retired-SKU and seasonal rules as the storefront API and checkout.
 * No Product Hub draft, build-time catalog or client value is ever used, so a
 * new publication changes these pages on the next request, without a build.
 *
 * The page is the prerendered `/menu` document (approved header and footer)
 * with its own head and a server-rendered product section in `<main>`. The
 * browser then renders the interactive product view on top, as on `/menu`.
 */
import type { State } from "../domain/model";
import {
  storefrontCatalog,
  type StorefrontCatalog,
} from "../catalog/storefront-api";
import { validateFoundation } from "../catalog/contract";
import {
  absoluteUrl,
  applyHead,
  headTags,
  jsonLdScript,
} from "../../shared/seo";

/** Published slugs: lower-case words joined by hyphens, `--` between family and flavour. */
export const SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
export const PRODUCT_PATH = /^\/menu\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/;
export const productPath = (slug: string) => `/menu/${slug}`;
export const SITE_NAME = "Pastelerías 3L Dubai";
const BRAND = "Pastelerías 3L";

type Product = StorefrontCatalog["products"][number];
type Option = Product["options"][number];
type Asset = StorefrontCatalog["assets"][number];

export type ProductPageResult =
  | { status: 200; html: string; revision: string; product: Product }
  | { status: 404 | 410 | 503; reason: string };

const esc = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
export const aed = (fils: number) => `AED ${(fils / 100).toFixed(2)}`;
const amount = (fils: number) => (fils / 100).toFixed(2);

/** English name of a product, as published. */
export const productName = (p: Product) => p.content.en?.name?.trim() || p.slug;
/** Published English description, or null: never generated. */
const productDescription = (p: Product) =>
  p.content.en?.description?.trim() || null;
const optionLabel = (o: Option) =>
  o.size?.trim() ||
  (o.packQuantity ? `Pack of ${o.packQuantity}` : null) ||
  o.content.en?.variantLabel?.trim() ||
  o.content.en?.name?.trim() ||
  o.name;

/** schema.org availability, from the same rules checkout applies. */
export const availability = (o: Option) =>
  o.orderable && o.available
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";
const availabilityText = (o: Option) =>
  o.orderable && o.available ? "Available to order" : "Not available now";

/** Same published assignment policy as selectedProductMedia: product links only.
 * Removing a product photo must not revive a variant or bundled photograph.
 * Largest WebP up to 960 px, with intrinsic dimensions and srcset.
 */
function primaryImage(catalog: StorefrontCatalog, p: Product) {
  const link = [...p.media]
    .sort(
      (a, b) =>
        Number(b.role === "primary") - Number(a.role === "primary") ||
        a.order - b.order ||
        a.assetId.localeCompare(b.assetId),
    )
    .find((link) =>
      catalog.assets.some(
        (asset) => asset.id === link.assetId && asset.derivatives.length,
      ),
    );
  const asset: Asset | undefined = link
    ? catalog.assets.find((a) => a.id === link.assetId)
    : undefined;
  if (!asset) return null;
  const webp = asset.derivatives
    .filter((d) => d.format === "webp" && d.width)
    .sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  const usable = webp.length ? webp : asset.derivatives;
  const best =
    [...usable].reverse().find((d) => (d.width ?? 0) <= 960) ?? usable.at(-1);
  if (!best) return null;
  return {
    src: best.src,
    width: best.width ?? null,
    height: best.height ?? null,
    srcset: usable
      .filter((d) => d.width)
      .map((d) => `${d.src} ${d.width}w`)
      .join(", "),
    alt: asset.alt.en?.name?.trim() || productName(p),
  };
}

export function categoryName(catalog: StorefrontCatalog, p: Product) {
  return catalog.categories.find((c) => c.id === p.categoryId)?.name ?? "Menu";
}

/** Factual description: name, category, option count and published prices. */
export function metaDescription(catalog: StorefrontCatalog, p: Product) {
  const prices = p.options.map((o) => o.priceFils);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const price = low === high ? aed(low) : `from ${aed(low)} to ${aed(high)}`;
  const options = p.options.length > 1 ? `${p.options.length} options, ` : "";
  const own = productDescription(p);
  return [
    own ??
      `${productName(p)} by ${BRAND}, ${categoryName(catalog, p)} in Dubai.`,
    `${options}${price}.`,
    "Order online for delivery or pickup in Dubai.",
  ].join(" ");
}

/**
 * Product + Offer, or a ProductGroup with one variant per published SKU when a
 * product has several sizes/packs. Prices and availability are the published
 * ones; no GTIN, rating or review is emitted because none exists.
 */
export function productJsonLd(
  catalog: StorefrontCatalog,
  p: Product,
  origin: string,
) {
  const url = absoluteUrl(origin, productPath(p.slug));
  const image = primaryImage(catalog, p);
  const brand = { "@type": "Brand", name: BRAND };
  const variantUrl = (o: Option) =>
    p.options.length > 1 ? `${url}?sku=${encodeURIComponent(o.id)}` : url;
  const offer = (o: Option) => ({
    "@type": "Offer",
    url: variantUrl(o),
    priceCurrency: catalog.currency,
    price: amount(o.priceFils),
    availability: availability(o),
    seller: { "@id": `${absoluteUrl(origin, "/")}#business` },
  });
  const base = {
    "@context": "https://schema.org",
    name: productName(p),
    url,
    brand,
    category: categoryName(catalog, p),
    ...(image ? { image: [absoluteUrl(origin, image.src)] } : {}),
    ...(productDescription(p) ? { description: productDescription(p) } : {}),
  };
  if (p.options.length === 1) {
    const [o] = p.options;
    return { ...base, "@type": "Product", sku: o!.id, offers: offer(o!) };
  }
  return {
    ...base,
    "@type": "ProductGroup",
    productGroupID: p.id,
    variesBy: ["https://schema.org/size"],
    hasVariant: p.options.map((o) => ({
      "@type": "Product",
      name: o.content.en?.name?.trim() || o.name,
      sku: o.id,
      url: variantUrl(o),
      inProductGroupWithID: p.id,
      size: optionLabel(o),
      ...(image ? { image: absoluteUrl(origin, image.src) } : {}),
      offers: offer(o),
    })),
  };
}

const breadcrumb = (
  catalog: StorefrontCatalog,
  p: Product,
  origin: string,
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
      name: "Menu",
      item: absoluteUrl(origin, "/menu"),
    },
    {
      "@type": "ListItem",
      position: 3,
      name: productName(p),
      item: absoluteUrl(origin, productPath(p.slug)),
    },
  ],
});

/** Visible product section: what the structured data describes, and nothing more. */
export function productSection(catalog: StorefrontCatalog, p: Product) {
  const image = primaryImage(catalog, p);
  const category = categoryName(catalog, p);
  const siblings = catalog.products
    .filter((x) => x.familyId === p.familyId && x.id !== p.id)
    .slice(0, 12);
  const description = productDescription(p);
  const rows = p.options
    .map(
      (o) =>
        `<li data-sku="${esc(o.id)}"><span>${esc(optionLabel(o))}</span> <strong>${esc(aed(o.priceFils))}</strong> <small>${esc(availabilityText(o))}</small></li>`,
    )
    .join("");
  return [
    `<section class="b-product-page b-section" aria-label="Product detail" data-seo-product="${esc(p.id)}">`,
    `<nav aria-label="Breadcrumb"><a class="b-link" href="/menu?category=${esc(encodeURIComponent(p.categoryId))}">← ${esc(category)}</a></nav>`,
    `<article class="b-menu-card">`,
    image
      ? `<img style="max-width:100%;height:auto" src="${esc(image.src)}"${image.srcset ? ` srcset="${esc(image.srcset)}" sizes="(min-width: 900px) 480px, 100vw"` : ""} alt="${esc(image.alt)}"${image.width ? ` width="${image.width}"` : ""}${image.height ? ` height="${image.height}"` : ""} />`
      : "",
    `<h1>${esc(productName(p))}</h1>`,
    `<p class="b-label">${esc(category)} · ${esc(BRAND)} Dubai</p>`,
    description ? `<p>${esc(description)}</p>` : "",
    `<h2>Options and prices</h2>`,
    `<ul class="b-seo-options">${rows}</ul>`,
    `<p>Order online for delivery or pickup in Dubai. Prices in AED.</p>`,
    `<p><a class="b-link" href="/how-to-order">How to order</a> · <a class="b-link" href="/delivery-policy">Delivery</a> · <a class="b-link" href="/menu">Full menu</a></p>`,
    `</article>`,
    siblings.length
      ? `<nav aria-label="More from this range"><h2>More in ${esc(category)}</h2><ul>${siblings
          .map(
            (s) =>
              `<li><a href="${esc(productPath(s.slug))}">${esc(productName(s))}</a></li>`,
          )
          .join("")}</ul></nav>`
      : "",
    `</section>`,
  ].join("");
}

/** Slugs that were published at some point in this revision's catalog, but are not sold now. */
function knownSlugs(state: State) {
  try {
    const f = validateFoundation(state.catalogFoundation!, state.catalog ?? []);
    return new Set(f.products.flatMap((p) => (p.slug ? [p.slug] : [])));
  } catch {
    return new Set<string>();
  }
}

/**
 * The whole document for `/menu/<slug>`, or why there is none:
 * 404 unknown, 410 known but no longer sold, 503 no valid published revision.
 */
export function productPage(
  state: State,
  slug: string,
  options: {
    origin: string;
    menuTemplate: string;
    socialImage: { path: string; width: number; height: number; alt: string };
  },
  now = new Date(),
): ProductPageResult {
  let catalog: StorefrontCatalog;
  try {
    catalog = storefrontCatalog(state, now);
  } catch {
    return { status: 503, reason: "Catalog revision unavailable" };
  }
  const p = catalog.products.find((x) => x.slug === slug);
  if (!p)
    return knownSlugs(state).has(slug)
      ? { status: 410, reason: "Product no longer offered" }
      : { status: 404, reason: "Product not found" };
  const image = primaryImage(catalog, p);
  const head = headTags(
    {
      path: productPath(p.slug),
      title: `${productName(p)} — ${SITE_NAME}`,
      description: metaDescription(catalog, p),
    },
    {
      origin: options.origin,
      name: SITE_NAME,
      image:
        image?.width && image.height
          ? {
              path: image.src,
              width: image.width,
              height: image.height,
              alt: image.alt,
            }
          : options.socialImage,
    },
  );
  const structured = [
    productJsonLd(catalog, p, options.origin),
    breadcrumb(catalog, p, options.origin),
  ]
    .map(jsonLdScript)
    .join("\n    ");
  // The menu template's own structured data describes /menu, not this product.
  const template = options.menuTemplate.replace(
    /\s*<script type="application\/ld\+json">[^<]*<\/script>/g,
    "",
  );
  const withHead = applyHead(template, `${head}\n    ${structured}`);
  const main = /<main id="main-content">[\s\S]*?<\/main>/;
  if (!main.test(withHead))
    throw new Error("Menu template has no main element");
  const html = withHead.replace(
    main,
    () => `<main id="main-content">${productSection(catalog, p)}</main>`,
  );
  return { status: 200, html, revision: catalog.revision, product: p };
}

/** Product URLs for the sitemap: published, sold products only. */
export function productSitemapEntries(
  state: State,
  origin: string,
  now = new Date(),
) {
  let catalog: StorefrontCatalog;
  try {
    catalog = storefrontCatalog(state, now);
  } catch {
    return null;
  }
  const lastmod = catalog.publishedAt ? catalog.publishedAt.slice(0, 10) : null;
  return catalog.products.map((p) =>
    [
      "  <url>",
      `    <loc>${esc(absoluteUrl(origin, productPath(p.slug)))}</loc>`,
      ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
      "  </url>",
    ].join("\n"),
  );
}

/** The built sitemap (public pages) plus the live product URLs. */
export function sitemapWithProducts(staticSitemap: string, entries: string[]) {
  if (!staticSitemap.includes("</urlset>")) throw new Error("Invalid sitemap");
  return staticSitemap.replace(
    "</urlset>",
    () => (entries.length ? entries.join("\n") + "\n" : "") + "</urlset>",
  );
}
