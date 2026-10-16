import { useLanguage as useCustomerLanguage } from "./localization";
import {
  ResponsiveMedia,
  MediaRotation,
  categoryEditorialMedia,
  selectedProductMedia,
  productGalleryMedia,
  usesMenuReferencePresentation,
} from "./media";
import { CustomerCopy } from "./localization";
import { availableSku } from "../../shared/commerce-policy";
import { useEffect, useId, useRef, useState } from "react";
import { AddToCart } from "./Shop";
import { useCheckoutConfig, useCheckoutNow } from "./cart";
import { liveOrderable, refreshLiveCatalog } from "./live-catalog";
import { formatAed } from "./content";
import {
  menuProductFamily,
  productHref,
  productSlugFromPath,
  useMenu,
  type StorefrontProduct,
} from "./menu";

export function ProductOptions({
  product,
  detail = false,
}: {
  product: StorefrontProduct;
  detail?: boolean;
}) {
  const { text: localize } = useCustomerLanguage();

  const menu = useMenu();
  const family = menuProductFamily(menu, product),
    labelId = useId();
  const [sku, setSku] = useState(() => {
    // Offer URLs identify a real size SKU, never a pack flavor composition.
    const requested =
      detail && typeof location !== "undefined"
        ? new URLSearchParams(location.search).get("sku")
        : null;
    return (
      family.options.find((o) => o.id === requested)?.id ??
      family.options[0]!.id
    );
  });
  const { config, loading, retry } = useCheckoutConfig();
  const now = useCheckoutNow(config);
  const options = family.options.filter((o) => availableSku(o.id, now));
  const option = options.find((o) => o.id === sku) ?? options[0];
  const display = option ?? family.options[0]!;
  const media = selectedProductMedia(
    product.id,
    family.id,
    product.variant,
    display.size,
  );
  // Never show the chocolate family fallback for a different Concha flavour.
  const fallback =
    family.id === "conchas-traditional" && product.variant !== "Chocolate"
      ? "/brand/icon.png"
      : family.image;
  const serverProduct = config?.products.find((p) => p.id === option?.id);
  // With the published catalog, a size it marks unavailable is never offered.
  const orderable = option ? liveOrderable(option.id) : null;
  const ready =
    !!option &&
    !!serverProduct &&
    serverProduct.priceFils === option.priceFils &&
    orderable !== false;
  // The published catalog and checkout disagree only across a publication: this
  // card reloads both, once per disagreement.
  const disagreement =
    menu.status === "live" &&
    option &&
    config &&
    !loading &&
    (orderable !== !!serverProduct ||
      (serverProduct && serverProduct.priceFils !== option.priceFils))
      ? `${option.id}:${option.priceFils}:${orderable}:${serverProduct?.priceFils}`
      : null;
  const reloaded = useRef<string | null>(null);
  useEffect(() => {
    if (!disagreement || reloaded.current === disagreement) return;
    reloaded.current = disagreement;
    void refreshLiveCatalog();
    retry();
  }, [disagreement, retry]);
  // Resolved in media.tsx: a photograph replaced in Product Hub, else the authored one.
  const gallery = productGalleryMedia(product.id, family.id, product.variant);
  return (
    <div className="b-menu-options">
      <figure
        className={`b-menu-photo ${media ? "" : "b-family-photo"} ${usesMenuReferencePresentation(media) ? "b-official-photo" : ""}`}
      >
        {media || fallback ? (
          <ResponsiveMedia
            productId={product.id}
            family={family.id}
            variant={product.variant}
            size={display.size}
            fallback={fallback}
            alt={product.title}
            rotate={!detail}
          />
        ) : (
          <div
            className="b-menu-no-photo"
            aria-label={localize("Product photograph coming soon")}
          >
            <span>
              {" "}
              <CustomerCopy>3L</CustomerCopy>{" "}
            </span>
          </div>
        )}
      </figure>
      {detail ? (
        <h1 className="b-product-title">
          <CustomerCopy>{product.title}</CustomerCopy>
        </h1>
      ) : (
        <h4>
          <a href={productHref(product)}>
            <CustomerCopy>{product.title}</CustomerCopy>
          </a>
        </h4>
      )}
      {detail && product.description && (
        <p className="b-product-description">
          <CustomerCopy>{product.description}</CustomerCopy>
        </p>
      )}
      <p className="b-menu-price" aria-live="polite">
        <CustomerCopy>{formatAed(display.priceFils)}</CustomerCopy>
      </p>
      {options.length > 1 && (
        <label className="b-menu-selectors" htmlFor={labelId}>
          <CustomerCopy>{family.pack ? "Pack" : "Size / pack"}</CustomerCopy>
          <select
            id={labelId}
            value={display.size}
            onChange={(e) =>
              setSku(options.find((o) => o.size === e.target.value)!.id)
            }
          >
            {options.map((o) => (
              <option key={o.id} value={o.size}>
                {/^(6|12) /.test(o.size)
                  ? localize(o.size.startsWith("6 ") ? "Half Dozen" : "Dozen") +
                    " · "
                  : ""}
                <CustomerCopy>{o.size}</CustomerCopy>
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="b-menu-option-summary" aria-live="polite">
        <CustomerCopy>{display.size}</CustomerCopy>
      </p>
      {family.advanceOrder && (
        <p className="b-menu-advance">
          <CustomerCopy>Order at least 24 hours in advance</CustomerCopy>
        </p>
      )}
      {!option ? (
        <p className="b-menu-advance">
          <CustomerCopy>
            Individual Pan de Muerto is available October 3–November 15. Half
            Dozen and Dozen packs remain available year-round.
          </CustomerCopy>
        </p>
      ) : ready ? (
        <AddToCart
          // Remounts on a new server price so the button never shows the old one.
          key={`${option.id}:${serverProduct.priceFils}`}
          productId={option.id}
          fallback={
            <p>
              {" "}
              <CustomerCopy>Online ordering is unavailable.</CustomerCopy>{" "}
            </p>
          }
        />
      ) : (
        <div role="status">
          <button className="b-button" disabled>
            <CustomerCopy>
              {loading ? "LOADING…" : "ADD TO CART · UNAVAILABLE"}
            </CustomerCopy>
          </button>
          {!loading && (
            <>
              <p>
                {" "}
                <CustomerCopy>
                  Online ordering is unavailable for this option.
                </CustomerCopy>{" "}
              </p>
              <button className="b-text-button" onClick={retry}>
                {" "}
                <CustomerCopy>TRY AGAIN</CustomerCopy>{" "}
              </button>
            </>
          )}
        </div>
      )}
      {detail && gallery.length > 0 && (
        <div
          className={`b-product-gallery ${usesMenuReferencePresentation(media) ? "b-official-gallery" : ""}`}
          aria-label={localize("Product gallery")}
        >
          {gallery.map((asset) => (
            <img
              key={asset.sourceId}
              src={
                (
                  asset.derivatives.find(
                    (d) => d.format === "webp" && d.width === 640,
                  ) ?? asset.derivatives[0]
                )?.src
              }
              alt={localize(asset.alt)}
              loading="lazy"
              decoding="async"
            />
          ))}
        </div>
      )}
    </div>
  );
}
export function MenuCatalog() {
  const { text: localize } = useCustomerLanguage();

  const params =
    typeof location === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(location.search);
  const menu = useMenu();
  const [chosen, setCategory] = useState(
    () => params.get("category") ?? "cakes",
  );
  const category = menu.categories.some((c) => c.id === chosen)
    ? chosen
    : (menu.categories.find((c) => c.id === "cakes") ?? menu.categories[0])?.id;
  const slug = params.get("product") ?? productSlugFromPath();
  // Dynamic catalog without a published revision yet (or at all): sell nothing.
  if (menu.status === "loading" || menu.status === "unavailable" || !category)
    return (
      <section
        id="bakery"
        className="b-section b-full-menu"
        aria-label={localize("Full menu")}
        data-catalog-status={menu.status}
      >
        <p className="b-label">
          {" "}
          <CustomerCopy>THE 3L MENU</CustomerCopy>{" "}
        </p>
        <div role="status">
          <p>
            <CustomerCopy>
              {menu.status === "loading"
                ? "LOADING…"
                : "Online ordering is unavailable."}
            </CustomerCopy>
          </p>
          {menu.status !== "loading" && (
            <button
              className="b-text-button"
              onClick={() => void refreshLiveCatalog()}
            >
              {" "}
              <CustomerCopy>TRY AGAIN</CustomerCopy>{" "}
            </button>
          )}
        </div>
      </section>
    );
  if (slug) {
    const product = menu.products.find((p) => p.slug === slug);
    return (
      <section
        className="b-product-page b-section"
        aria-label={localize("Product detail")}
      >
        <a
          className="b-link"
          href={
            product
              ? `/menu?category=${menuProductFamily(menu, product).category}`
              : "/menu"
          }
        >
          {" "}
          <CustomerCopy>← BACK TO MENU</CustomerCopy>{" "}
        </a>
        {product ? (
          <article
            className="b-menu-card"
            data-product-id={product.id}
            data-menu-family={product.familyId}
          >
            <ProductOptions product={product} detail />
          </article>
        ) : (
          <>
            <h1>
              {" "}
              <CustomerCopy>Product not found</CustomerCopy>{" "}
            </h1>
            <p>
              {" "}
              <CustomerCopy>
                Please choose a product from the current menu.
              </CustomerCopy>{" "}
            </p>
          </>
        )}
      </section>
    );
  }
  const current = menu.categories.find((c) => c.id === category)!;
  const editorial = categoryEditorialMedia(category);
  return (
    <section
      id="bakery"
      className="b-section b-full-menu"
      aria-label={localize("Full menu")}
      data-catalog-status={menu.status}
    >
      <p className="b-label">
        {" "}
        <CustomerCopy>THE 3L MENU</CustomerCopy>{" "}
      </p>
      <h2 className="b-heading">
        {" "}
        <CustomerCopy>FIND YOUR FAVOURITE.</CustomerCopy>{" "}
      </h2>
      <nav
        className="b-menu-categories"
        aria-label={localize("Menu categories")}
      >
        {menu.categories.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={category === c.id}
            onClick={() => {
              setCategory(c.id);
              const url = new URL(location.href);
              url.searchParams.set("category", c.id);
              history.replaceState(history.state, "", url);
            }}
          >
            <CustomerCopy>{c.name}</CustomerCopy>
          </button>
        ))}
      </nav>
      <h3 id={`category-${category}`} className="b-menu-category-heading">
        <CustomerCopy>{current.name}</CustomerCopy>
      </h3>
      {editorial.length > 0 && (
        <figure className="b-category-showcase">
          <MediaRotation
            frames={editorial}
            alt={localize(current.name)}
            sizes="(max-width: 1000px) 92vw, 960px"
          />
        </figure>
      )}
      <div className="b-menu-grid">
        {menu.products
          .filter((p) => menuProductFamily(menu, p).category === category)
          .map((p) => (
            <article
              className="b-menu-card"
              key={p.id}
              aria-label={localize(p.title)}
              id={`product-${p.slug}`}
              data-product-id={p.id}
              data-menu-family={p.familyId}
            >
              <ProductOptions product={p} />
            </article>
          ))}
      </div>
      <a className="b-link" href="/cart">
        {" "}
        <CustomerCopy>VIEW CART</CustomerCopy>{" "}
      </a>
    </section>
  );
}
