import { ResponsiveMedia, selectedMedia } from "./media";
import { CustomerCopy } from "./localization";
import { useLanguage } from "./localization";
import { availableSku } from "../../shared/commerce-policy";
import { useId, useState } from "react";
import { AddToCart } from "./Shop";
import { useCheckoutConfig, useCheckoutNow } from "./cart";
import { formatAed } from "./content";
import {
  menuCategories,
  menuFamilies,
  selectMenuOption,
  type MenuFamily,
} from "./menu";

export function MenuOptions({ family }: { family: MenuFamily }) {
  const labelId = useId();
  const { text } = useLanguage();
  const [variant, setVariant] = useState(family.options[0]!.variant);
  const [size, setSize] = useState(family.options[0]!.size);
  const { config, loading, retry } = useCheckoutConfig();
  const now = useCheckoutNow(config);
  const options = family.options.filter((o) => availableSku(o.id, now));
  const variants = [...new Set(options.map((option) => option.variant))];
  const sizes = [
    ...new Set(
      options
        .filter((option) => option.variant === variant)
        .map((option) => option.size),
    ),
  ];
  const selectedVariant = variants.includes(variant) ? variant : variants[0];
  const selected =
    options.find((o) => o.variant === selectedVariant && o.size === size) ??
    options.find((o) => o.variant === selectedVariant);
  if (!selected)
    return (
      <p className="b-menu-advance">
        <CustomerCopy>
          Individual Pan de Muerto is available October 15–November 15. Half
          Dozen and Dozen packs remain available year-round.
        </CustomerCopy>
      </p>
    );
  const option = selectMenuOption(family, selected.variant, selected.size);
  const serverProduct = config?.products.find(
    (product) => product.id === option.id,
  );
  const ready = !!serverProduct && serverProduct.priceFils === option.priceFils;
  return (
    <div className="b-menu-options">
      {family.image ||
      selectedMedia(family.id, selected.variant, selected.size) ? (
        <figure className="b-menu-photo">
          <ResponsiveMedia
            family={family.id}
            variant={selected.variant}
            size={selected.size}
            fallback={family.image}
            alt={
              selectedMedia(family.id, selected.variant, selected.size)
                ? `${family.name} · ${selected.variant}`
                : `${family.name} family photograph`
            }
          />
        </figure>
      ) : (
        <div className="b-menu-no-photo">
          <span>3L</span>
        </div>
      )}
      <div className="b-menu-selectors">
        {variants.length > 1 && (
          <label htmlFor={`${labelId}-variant`}>
            <CustomerCopy>
              {text(family.id.includes("filled") ? "Filling" : "Flavour")}
            </CustomerCopy>
            <select
              id={`${labelId}-variant`}
              value={selected.variant}
              onChange={(event) => setVariant(event.target.value)}
            >
              {variants.map((value) => (
                <option key={value} value={value}>
                  <CustomerCopy>
                    {family.pack && /^(6|12) /.test(value)
                      ? `${value.startsWith("6 ") ? "Half Dozen" : "Dozen"} · ${value}`
                      : value}
                  </CustomerCopy>
                </option>
              ))}
            </select>
          </label>
        )}
        {sizes.length > 1 && (
          <label htmlFor={`${labelId}-size`}>
            <CustomerCopy>
              {text(family.pack ? "Pack" : "Size / pack")}
            </CustomerCopy>
            <select
              id={`${labelId}-size`}
              value={selected.size}
              onChange={(event) => setSize(event.target.value)}
            >
              {sizes.map((value) => (
                <option key={value} value={value}>
                  <CustomerCopy>
                    {family.pack && /^(6|12) /.test(value)
                      ? `${value.startsWith("6 ") ? "Half Dozen" : "Dozen"} · ${value}`
                      : value}
                  </CustomerCopy>
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="b-menu-option-summary" aria-live="polite">
        <CustomerCopy>
          {[selected.variant, selected.size].filter(Boolean).join(" · ")}
        </CustomerCopy>
      </p>
      <p className="b-menu-price" aria-live="polite">
        <CustomerCopy>{formatAed(option.priceFils)}</CustomerCopy>
      </p>
      {family.advanceOrder && (
        <p className="b-menu-advance">
          <CustomerCopy>Order at least 24 hours in advance</CustomerCopy>
        </p>
      )}
      {ready ? (
        <AddToCart
          key={option.id}
          productId={option.id}
          fallback={
            <p>
              <CustomerCopy>Online ordering is unavailable.</CustomerCopy>
            </p>
          }
        />
      ) : (
        <div className="b-menu-unavailable" role="status">
          <button className="b-button" type="button" disabled>
            <CustomerCopy>
              {loading ? "LOADING…" : "ADD TO CART · UNAVAILABLE"}
            </CustomerCopy>
          </button>
          {!loading && (
            <>
              <p>
                <CustomerCopy>
                  Online ordering is unavailable for this option. Please try
                  again later.
                </CustomerCopy>
              </p>
              <button className="b-text-button" type="button" onClick={retry}>
                <CustomerCopy>TRY AGAIN</CustomerCopy>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function MenuCatalog() {
  const [category, setCategory] = useState(() => {
    const value =
      typeof location !== "undefined"
        ? new URLSearchParams(location.search).get("category")
        : null;
    return menuCategories.some((c) => c.id === value) ? value! : "cakes";
  });
  const current = menuCategories.find((entry) => entry.id === category)!;
  return (
    <section
      id="bakery"
      className="b-section b-full-menu"
      aria-label="Full menu"
    >
      <p className="b-label">
        <CustomerCopy>THE 3L MENU</CustomerCopy>
      </p>
      <h2 className="b-heading">
        <CustomerCopy>FIND YOUR FAVOURITE.</CustomerCopy>
      </h2>
      <nav className="b-menu-categories" aria-label="Menu categories">
        {menuCategories.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={category === entry.id}
            onClick={() => setCategory(entry.id)}
          >
            <CustomerCopy>{entry.name}</CustomerCopy>
          </button>
        ))}
      </nav>
      <h3 className="b-menu-category-heading">
        <CustomerCopy>{current.name}</CustomerCopy>
      </h3>
      {"image" in current && current.image && (
        <figure className="b-menu-category-photo">
          {current.id === "jars" ? (
            <ResponsiveMedia
              family="cake-jar-bundle"
              variant=""
              alt="3L cake jars in branded packaging · family photograph"
            />
          ) : (
            <img
              src={current.image}
              alt={`${current.name} category photography from Liza’s menu`}
            />
          )}
          <figcaption>
            <CustomerCopy>Category photograph</CustomerCopy>
          </figcaption>
        </figure>
      )}
      <div className="b-menu-grid">
        {menuFamilies
          .filter((family) => family.category === category)
          .map((family) => (
            <article
              className="b-menu-card"
              key={family.id}
              aria-label={family.name}
              data-menu-family={family.id}
            >
              <h4>
                <CustomerCopy>{family.name}</CustomerCopy>
              </h4>
              <MenuOptions family={family} />
            </article>
          ))}
      </div>
      <a className="b-link" href="/cart">
        <CustomerCopy>VIEW CART</CustomerCopy>
      </a>
    </section>
  );
}
