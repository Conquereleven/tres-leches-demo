import { ProductSearch } from "./CatalogDiscovery";
import { packSpec } from "../../shared/pack-composition";
import { packCopy } from "../../shared/pack-copy";
import { useLanguage as useCustomerLanguage } from "./localization";
import {
  ResponsiveMedia,
  MediaPicture,
  MediaRotation,
  categoryEditorialMedia,
  selectedProductMedia,
  productGalleryMedia,
  usesMenuReferencePresentation,
} from "./media";
import { CustomerCopy } from "./localization";
import { availableSku } from "../../shared/commerce-policy";
import { useEffect, useId, useRef, useState } from "react";
import { localizedKey } from "./locales/engine";
import { AddToCart } from "./Shop";
import { useCheckoutConfig, useCheckoutNow } from "./cart";
import { liveOrderable, refreshLiveCatalog } from "./live-catalog";
import { formatAed } from "./content";
import {
  menuProductFamily,
  productHref,
  useMenu,
  type StorefrontProduct,
} from "./menu";

/** Presentation-only grouping. Published family/category/SKU records remain authoritative. */
export const publicMenuCategoryId = (id: string) =>
  id === "pan" || id === "conchas" ? "bakery" : id;
export const publicMenuCategories = (categories: {id: string; name: string}[]) =>
  categories.filter(category => category.id !== "pan" && category.id !== "conchas");

export function ProductOptions({
  product,
  detail = false,
}: {
  product: StorefrontProduct;
  detail?: boolean;
}) {
  const { text: localize, language } = useCustomerLanguage();

  const menu = useMenu();
  const family = menuProductFamily(menu, product),
    labelId = useId();
  const [sku, setSku] = useState(() => {
    const requested =
      typeof location === "undefined"
        ? null
        : new URLSearchParams(location.search).get("sku");
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
    menu.status !== "bundled"
      ? null
      : family.id === "conchas-traditional" && product.variant !== "Chocolate"
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
  // Product media and gallery share the published assignment policy.
  const gallery = productGalleryMedia(product.id, family.id, product.variant);
  return (
    <div className="b-menu-options">
      <figure
        className={`b-menu-photo ${media ? "" : "b-family-photo"} ${usesMenuReferencePresentation(media) || family.id.startsWith("conchas") ? "b-official-photo" : ""}`}
      >
        {media || fallback ? (
          <ResponsiveMedia
            productId={product.id}
            family={family.id}
            variant={product.variant}
            size={display.size}
            fallback={fallback}
            alt={product.title}
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
        {config?.packPricing && packSpec(display.id) && (
          <span>{packCopy(language).base}: </span>
        )}
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
            <MediaPicture
              key={asset.sourceId}
              asset={asset}
              alt={localize(asset.alt)}
              sizes="(max-width: 640px) 90vw, 45vw"
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
    () => publicMenuCategoryId(params.get("category") ?? "cakes"),
  );
  const publicCategories = publicMenuCategories(menu.categories);
  const category = publicCategories.some((c) => c.id === chosen)
    ? chosen
    : (publicCategories.find((c) => c.id === "cakes") ?? publicCategories[0])?.id;
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [floatingAt, setFloatingAt] = useState({left: 16, top: 16});
  const openButton = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const activeProduct = menu.products.find(p => p.id === activeProductId);
  const { language } = useCustomerLanguage();
  const close = () => { setActiveProductId(null); openButton.current?.focus(); };
  useEffect(() => {
    if (!activeProductId) return;
    const frame = requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>(".s02-close")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [activeProductId]);
  const slug = params.get("product");
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
        <ProductSearch />
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
  const current = publicCategories.find((c) => c.id === category)!;
  const editorial = categoryEditorialMedia(category);
  return (
    <section
      id="bakery"
      className="b-section b-full-menu"
      aria-label={localize("Full menu")}
      data-catalog-status={menu.status}
    >
      <header className="s02-menu-intro">
        <p className="b-label"><CustomerCopy>THE 3L MENU</CustomerCopy></p>
        <h2 className="s02-title">
          {category === "bakery"
            ? <CustomerCopy>Panadería Mexicana</CustomerCopy>
            : <CustomerCopy>EXPLORE THE MENU</CustomerCopy>}
        </h2>
        <p className="s02-subtitle"><CustomerCopy>Cakes, jars, bakery</CustomerCopy></p>
        <ProductSearch />
        <div className="s02-doors">
          <button className="s02-door" type="button" onClick={() => {
            setCategory("cakes");
            history.replaceState(history.state,"", "/menu?category=cakes");
          }}>
            <img src="/brand/menu/cakes.webp" alt="" loading="lazy" />
            <span><CustomerCopy>CAKES</CustomerCopy></span>
          </button>
          <button className="s02-door" type="button" onClick={() => {
            setCategory("bakery");
            history.replaceState(history.state,"", "/menu?category=bakery");
          }}>
            <img src="/brand/menu/bakery.webp" alt="" loading="lazy" />
            <span><CustomerCopy>BAKERY</CustomerCopy></span>
          </button>
        </div>
      </header>
      <nav
        className="b-menu-categories"
        aria-label={localize("Menu categories")}
      >
        {publicCategories.map((c) => (
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
      <div className="b-menu-grid s02-grid">
        {menu.products
          .filter(p => publicMenuCategoryId(menuProductFamily(menu,p).category) === category)
          .map(p => {
            const family = menuProductFamily(menu,p);
            const size = family.options[0]?.size;
            const assigned = selectedProductMedia(p.id, family.id, p.variant, size);
            const fallback = menu.status === "bundled"
              ? family.id === "conchas-traditional" && p.variant !== "Chocolate"
                ? "/brand/icon.png" : family.image
              : null;
            return (
              <article
                key={p.id}
                className="b-menu-card s02-card"
                data-product-id={p.id}
                data-menu-family={p.familyId}
                id={`product-${p.slug}`}
                aria-label={localize(p.title)}
              >
                <figure className="b-menu-photo s02-photo">
                  {assigned || fallback
                    ? <ResponsiveMedia
                        productId={p.id} family={family.id} variant={p.variant}
                        size={size} fallback={fallback} alt={p.title}
                      />
                    : <div className="b-menu-no-photo" aria-label={localize("Product photograph coming soon")}>
                        <span><CustomerCopy>3L</CustomerCopy></span>
                      </div>}
                </figure>
                <div className="s02-card-body">
                  <h4><a href={productHref(p)}><CustomerCopy>{p.title}</CustomerCopy></a></h4>
                  {p.description && <p className="s02-description"><CustomerCopy>{p.description}</CustomerCopy></p>}
                  {!!family.options.length && <p className="s02-price">
                    {formatAed(Math.min(...family.options.map(o => o.priceFils)))}
                  </p>}
                  <button
                    className="s02-open" type="button" aria-haspopup="dialog"
                    aria-expanded={activeProductId === p.id}
                    onClick={event => {
                      openButton.current = event.currentTarget;
                      const rect = event.currentTarget.closest("article")?.getBoundingClientRect();
                      if (rect) {
                        const w = Math.min(460, innerWidth - 24);
                        const right = rect.right + 12;
                        setFloatingAt({
                          left: right + w < innerWidth - 12 ? right : Math.max(12, rect.left - w - 12),
                          top: Math.max(12, Math.min(rect.top, innerHeight - Math.min(520, innerHeight - 24))),
                        });
                      }
                      setActiveProductId(p.id);
                    }}
                  >
                    {localizedKey("menu:conversion_configure", language)}
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </article>
            );
          })}
      </div>
      {activeProduct && (
        <div className="s02-overlay" onPointerDown={e => {
          if (e.target === e.currentTarget) close();
        }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={localize(activeProduct.title)}
            ref={panel}
            className="s02-config"
            style={{left:floatingAt.left,top:floatingAt.top}}
            onKeyDown={e => {
              if (e.key === "Escape") { e.preventDefault(); close(); }
              if (e.key !== "Tab") return;
              const items = Array.from(panel.current?.querySelectorAll<HTMLElement>(
                'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled])'
              ) ?? []).filter(el => el.getClientRects().length > 0);
              if (!items.length) return;
              if (e.shiftKey && document.activeElement === items[0]) {
                e.preventDefault(); items[items.length - 1]!.focus();
              } else if (!e.shiftKey && document.activeElement === items[items.length - 1]) {
                e.preventDefault(); items[0]!.focus();
              }
            }}
          >
            <button className="s02-close" type="button" aria-label={localize("Close dialog")} onClick={close}>
              <span aria-hidden="true">×</span>
            </button>
            <ProductOptions key={activeProduct.id} product={activeProduct} />
          </div>
        </div>
      )}
      <a className="b-link" href="/cart">
        {" "}
        <CustomerCopy>VIEW CART</CustomerCopy>{" "}
      </a>
    </section>
  );
}
