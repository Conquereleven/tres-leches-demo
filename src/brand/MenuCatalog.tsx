import { availableSku } from "../../shared/commerce-policy";
import { useId, useState } from "react";
import { AddToCart } from "./Shop";
import { useCheckoutConfig } from "./cart";
import { formatAed } from "./content";
import {
  menuCategories,
  menuFamilies,
  selectMenuOption,
  type MenuFamily,
} from "./menu";

export function MenuOptions({ family }: { family: MenuFamily }) {
  const labelId = useId();
  const [variant, setVariant] = useState(family.options[0]!.variant);
  const [size, setSize] = useState(family.options[0]!.size);
  const { config, loading, retry } = useCheckoutConfig();
  const options = family.options.filter((o) =>
    availableSku(
      o.id,
      config?.serverNow ? new Date(config.serverNow) : new Date(),
    ),
  );
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
        Individual Pan de Muerto is available October 15–November 15. Half Dozen
        and Dozen packs remain available year-round.
      </p>
    );
  const option = selectMenuOption(family, selected.variant, selected.size);
  const serverProduct = config?.products.find(
    (product) => product.id === option.id,
  );
  const ready = !!serverProduct && serverProduct.priceFils === option.priceFils;
  return (
    <div className="b-menu-options">
      <div className="b-menu-selectors">
        {variants.length > 1 && (
          <label htmlFor={`${labelId}-variant`}>
            {family.id.includes("filled") ? "Filling" : "Flavour"}
            <select
              id={`${labelId}-variant`}
              value={selected.variant}
              onChange={(event) => setVariant(event.target.value)}
            >
              {variants.map((value) => (
                <option key={value} value={value}>
                  {family.pack && /^(6|12) /.test(value)
                    ? `${value.startsWith("6 ") ? "Half Dozen" : "Dozen"} · ${value}`
                    : value}
                </option>
              ))}
            </select>
          </label>
        )}
        {sizes.length > 1 && (
          <label htmlFor={`${labelId}-size`}>
            {family.pack ? "Pack" : "Size / pack"}
            <select
              id={`${labelId}-size`}
              value={selected.size}
              onChange={(event) => setSize(event.target.value)}
            >
              {sizes.map((value) => (
                <option key={value} value={value}>
                  {family.pack && /^(6|12) /.test(value)
                    ? `${value.startsWith("6 ") ? "Half Dozen" : "Dozen"} · ${value}`
                    : value}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="b-menu-option-summary" aria-live="polite">
        {[variant, size].filter(Boolean).join(" · ")}
      </p>
      <p className="b-menu-price" aria-live="polite">
        {formatAed(option.priceFils)}
      </p>
      {family.advanceOrder && (
        <p className="b-menu-advance">Order at least 24 hours in advance</p>
      )}
      {ready ? (
        <AddToCart
          key={option.id}
          productId={option.id}
          fallback={<p>Online ordering is unavailable.</p>}
        />
      ) : (
        <div className="b-menu-unavailable" role="status">
          <button className="b-button" type="button" disabled>
            {loading ? "LOADING…" : "ADD TO CART · UNAVAILABLE"}
          </button>
          {!loading && (
            <>
              <p>
                Online ordering is unavailable for this option. Please try again
                later.
              </p>
              <button className="b-text-button" type="button" onClick={retry}>
                TRY AGAIN
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
      <p className="b-label">THE 3L MENU</p>
      <h2 className="b-heading">FIND YOUR FAVOURITE.</h2>
      <nav className="b-menu-categories" aria-label="Menu categories">
        {menuCategories.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={category === entry.id}
            onClick={() => setCategory(entry.id)}
          >
            {entry.name}
          </button>
        ))}
      </nav>
      <h3 className="b-menu-category-heading">{current.name}</h3>
      {"image" in current && current.image && (
        <figure className="b-menu-category-photo">
          <img
            src={current.image}
            alt={`${current.name} category photography from Liza’s menu`}
          />
          <figcaption>Category photograph</figcaption>
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
              {family.image ? (
                <figure className="b-menu-photo">
                  <img
                    src={family.image}
                    alt={`${family.name} family photography from Liza’s menu`}
                    loading="lazy"
                  />
                  <figcaption>Family photograph</figcaption>
                </figure>
              ) : (
                <div className="b-menu-no-photo">
                  <span>3L</span>
                </div>
              )}
              <h4>{family.name}</h4>
              <MenuOptions family={family} />
            </article>
          ))}
      </div>
      <a className="b-link" href="/cart">
        VIEW CART
      </a>
    </section>
  );
}
