import { ResponsiveMedia, selectedProductMedia } from "./media";
import { CustomerCopy } from "./localization";
import { availableSku } from "../../shared/commerce-policy";
import { useId, useState } from "react";
import { AddToCart } from "./Shop";
import { useCheckoutConfig, useCheckoutNow } from "./cart";
import { formatAed } from "./content";
import {
  menuCategories,
  storefrontProducts,
  productFamily,
  productHref,
  type StorefrontProduct,
} from "./menu";
import manifest from "./media-manifest.json";

export function ProductOptions({
  product,
  detail = false,
}: {
  product: StorefrontProduct;
  detail?: boolean;
}) {
  const family = productFamily(product),
    labelId = useId();
  const [sku, setSku] = useState(family.options[0]!.id);
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
  const serverProduct = config?.products.find((p) => p.id === option?.id);
  const ready =
    !!option && !!serverProduct && serverProduct.priceFils === option.priceFils;
  const gallery = manifest.products.find((p) => p.productId === product.id)
    ?.gallerySourceIds as string[] | undefined;
  return (
    <div className="b-menu-options">
      <figure className={`b-menu-photo ${media ? "" : "b-family-photo"}`}>
        {media || family.image ? (
          <ResponsiveMedia
            productId={product.id}
            family={family.id}
            variant={product.variant}
            size={display.size}
            fallback={family.image}
            alt={media ? product.title : `${family.name} · family photograph`}
          />
        ) : (
          <div
            className="b-menu-no-photo"
            aria-label="Product photograph coming soon"
          >
            <span>3L</span>
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
      <p className="b-menu-price" aria-live="polite">
        {formatAed(display.priceFils)}
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
                  ? `${o.size.startsWith("6 ") ? "Half Dozen" : "Dozen"} · `
                  : ""}
                {o.size}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="b-menu-option-summary" aria-live="polite">
        {display.size}
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
          key={option.id}
          productId={option.id}
          fallback={<p>Online ordering is unavailable.</p>}
        />
      ) : (
        <div role="status">
          <button className="b-button" disabled>
            {loading ? "LOADING…" : "ADD TO CART · UNAVAILABLE"}
          </button>
          {!loading && (
            <>
              <p>Online ordering is unavailable for this option.</p>
              <button className="b-text-button" onClick={retry}>
                TRY AGAIN
              </button>
            </>
          )}
        </div>
      )}
      {detail && !!gallery?.length && (
        <div className="b-product-gallery" aria-label="Product gallery">
          {gallery.map((id) => {
            const asset = manifest.assets.find(
              (a) => a.sourceId === id && a.status === "assigned",
            );
            return asset ? (
              <img
                key={id}
                src={
                  asset.derivatives.find(
                    (d) => d.format === "webp" && d.width === 640,
                  )?.src
                }
                alt={asset.alt}
                loading="lazy"
              />
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}
export function MenuCatalog() {
  const params =
    typeof location === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(location.search);
  const [category, setCategory] = useState(() =>
    menuCategories.some((c) => c.id === params.get("category"))
      ? params.get("category")!
      : "cakes",
  );
  const slug = params.get("product");
  if (slug) {
    const product = storefrontProducts.find((p) => p.slug === slug);
    return (
      <section className="b-product-page b-section" aria-label="Product detail">
        <a
          className="b-link"
          href={
            product
              ? `/menu?category=${productFamily(product).category}`
              : "/menu"
          }
        >
          ← BACK TO MENU
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
            <h1>Product not found</h1>
            <p>Please choose a product from the current menu.</p>
          </>
        )}
      </section>
    );
  }
  const current = menuCategories.find((c) => c.id === category)!;
  return (
    <section
      id="bakery"
      className="b-section b-full-menu"
      aria-label="Full menu"
    >
      <p className="b-label">THE 3L MENU</p>
      <h2 className="b-heading">FIND YOUR FAVOURITE.</h2>
      <nav className="b-menu-categories" aria-label="Menu categories">
        {menuCategories.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={category === c.id}
            onClick={() => {
              setCategory(c.id);
              history.replaceState({}, "", `/menu?category=${c.id}`);
            }}
          >
            <CustomerCopy>{c.name}</CustomerCopy>
          </button>
        ))}
      </nav>
      <h3 id={`category-${category}`} className="b-menu-category-heading">
        <CustomerCopy>{current.name}</CustomerCopy>
      </h3>
      <div className="b-menu-grid">
        {storefrontProducts
          .filter((p) => productFamily(p).category === category)
          .map((p) => (
            <article
              className="b-menu-card"
              key={p.id}
              aria-label={p.title}
              id={`product-${p.slug}`}
              data-product-id={p.id}
              data-menu-family={p.familyId}
            >
              <ProductOptions product={p} />
            </article>
          ))}
      </div>
      <a className="b-link" href="/cart">
        VIEW CART
      </a>
    </section>
  );
}
