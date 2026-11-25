import { availableSku } from "../../shared/commerce-policy";
import { applyHead, headTags, SITE_ORIGIN } from "../../shared/seo";
import { hiddenConcha } from "../../shared/storefront-visibility";
import bundledMenu from "../../src/brand/menu-data.json";
import bundledProducts from "../../shared/storefront-products.json";
import { breadcrumbJsonLd, siteName, socialImage } from "../../src/seo/pages";
import { DomainError, type State } from "../domain/model";
import { storefrontCatalog, type StorefrontMode } from "./storefront-api";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!,
  );

function publishedProduct(state: State, slug: string, now: Date) {
  try {
    return storefrontCatalog(state, now).products.find(
      (product) => product.slug === slug,
    );
  } catch {
    throw new DomainError(503, "Catalog revision unavailable");
  }
}

export function renderProductPage(
  shell: string,
  path: string,
  state: State,
  mode: StorefrontMode,
) {
  const slug = path.slice("/menu/".length);
  const now = new Date();
  const published = mode === "on" ? publishedProduct(state, slug, now) : null;
  const bundled =
    mode === "off"
      ? bundledProducts.find((product) => product.slug === slug)
      : null;
  const productId = published?.id ?? bundled?.id;
  const family = bundledMenu.families.find(
    (item) => item.id === bundled?.familyId,
  );
  const skuIds =
    published?.options.map((option) => option.id) ?? bundled?.optionIds ?? [];
  const category = published?.categoryId ?? family?.category;
  const name = published?.content.en.name ?? bundled?.title;
  const description = published?.content.en.description ?? "";

  if (!productId || !name || category === "panettone" || hiddenConcha(productId, skuIds))
    throw new DomainError(404, "Product not found");
  if (category === "pan") {
    const current = state.catalog ?? [];
    const hasAvailableOption = published
      ? published.options.some((option) => option.available && option.orderable)
      : family?.options.some(
          (option) =>
            skuIds.includes(option.id) &&
            availableSku(option.id, now) &&
            current.some(
              (row) =>
                row.id === option.id &&
                row.active !== false &&
                row.availability !== "unavailable" &&
                row.priceFils === option.priceFils,
            ),
        );
    if (!hasAvailableOption) throw new DomainError(404, "Product not found");
  }

  const head = headTags(
    {
      path,
      title: `${name} — ${siteName}`,
      description: description || `${name} · ${siteName}`,
      jsonLd: [breadcrumbJsonLd(SITE_ORIGIN, path, name)],
    },
    { origin: SITE_ORIGIN, name: siteName, image: socialImage },
  );
  // Product discovery works without JS. Offers are resolved by the runtime
  // storefront and checkout rather than written into page metadata.
  return applyHead(shell, head).replace(
    '<main id="main" data-product-slot="true"></main>',
    () =>
      `<main class="v32-new-page v32-product-page" id="main"><a href="/bakery">Menu</a><h1>${escapeHtml(name)}</h1>${description ? `<p>${escapeHtml(description)}</p>` : ""}<noscript><p>Enable JavaScript to view available options and order online.</p></noscript></main>`,
  );
}

export const isProductPagePath = (path: string) =>
  /^\/menu\/[a-z0-9][a-z0-9-]*$/.test(path);
