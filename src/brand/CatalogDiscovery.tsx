import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { localizedKey, localizedMoney } from "./locales/engine";
import { useLanguage, CustomerCopy } from "./localization";
import { liveState, refreshLiveCatalog, useLiveCatalog } from "./live-catalog";
import {
  cart,
  checkoutNow,
  useCart,
  useCheckoutConfig,
  useCheckoutNow,
} from "./cart";
import {
  discoveryProducts,
  recommendations,
  searchProducts,
  type DiscoveryProduct,
} from "./discovery";
import { ResponsiveMedia } from "./media";
import { packSpec } from "../../shared/pack-composition";
import { tricolorSpec } from "../../shared/tricolor";
import "./conversion.css";

function subscribeOnline(fn: () => void) {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
}
const useOnline = () =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
function DiscoveryPhoto({ hit }: { hit: DiscoveryProduct }) {
  return (
    <span className="b-discovery-photo" aria-hidden="true">
      <ResponsiveMedia
        productId={hit.product.id}
        family={hit.product.familyId}
        variant={hit.options[0]?.flavor ?? ""}
        fallback={null}
        alt=""
        sizes="96px"
      />
    </span>
  );
}
export function ProductSearch() {
  const { language, text } = useLanguage();
  const copy = (key: string, values = {}) =>
    localizedKey(`menu:conversion_${key}`, language, values);
  const published = useLiveCatalog(),
    { config, loading, retry } = useCheckoutConfig(),
    now = useCheckoutNow(config),
    online = useOnline();
  const id = useId(),
    input = useRef<HTMLInputElement>(null);
  const readQuery = () =>
    typeof location === "undefined"
      ? ""
      : (new URLSearchParams(location.search).get("q")?.slice(0, 120) ?? "");
  const [query, setQuery] = useState(readQuery),
    [limit, setLimit] = useState(8);
  useEffect(() => {
    const sync = () => {
      setQuery(readQuery());
      setLimit(8);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const change = (value: string) => {
    setQuery(value);
    setLimit(8);
    const url = new URL(location.href);
    if (value.trim()) url.searchParams.set("q", value);
    else url.searchParams.delete("q");
    history.replaceState(history.state, "", url);
  };
  const waiting = published.status === "loading" || loading;
  const available =
    online &&
    published.status === "live" &&
    !!config?.enabled &&
    config.catalogAvailable !== false;
  const hits = available
    ? searchProducts(published.catalog, config, query, now)
    : [];
  const message = !online
    ? copy("offline")
    : waiting
      ? copy("loading")
      : !available
        ? copy("unavailable")
        : query.trim()
          ? hits.length
            ? copy("results", { 0: hits.length })
            : copy("noResults")
          : copy("searchHint");
  return (
    <section className="b-discovery-search" aria-busy={waiting}>
      <form
        role="search"
        aria-label={copy("searchLabel")}
        onSubmit={(e) => e.preventDefault()}
      >
        <label htmlFor={id}>{copy("searchLabel")}</label>
        <div className="b-discovery-input">
          <input
            ref={input}
            id={id}
            type="search"
            maxLength={120}
            value={query}
            placeholder={copy("searchPlaceholder")}
            aria-controls={`${id}-results`}
            aria-describedby={`${id}-status`}
            onChange={(e) => change(e.target.value)}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                change("");
                input.current?.focus();
              }}
            >
              {copy("clear")}
            </button>
          )}
        </div>
      </form>
      <p id={`${id}-status`} role="status" className="b-discovery-status">
        {message}
      </p>
      {!waiting && online && !available && (
        <button
          className="b-text-button"
          type="button"
          onClick={() => {
            void refreshLiveCatalog();
            retry();
          }}
        >
          {copy("retry")}
        </button>
      )}
      <div id={`${id}-results`}>
        {query.trim() && hits.length > 0 && (
          <ul className="b-search-results">
            {hits.slice(0, limit).map((hit) => (
              <li key={hit.product.id}>
                <a
                  href={`/menu?product=${encodeURIComponent(hit.product.slug)}&sku=${encodeURIComponent(hit.options.slice().sort((a, b) => a.priceFils - b.priceFils || a.id.localeCompare(b.id))[0]!.id)}&lang=${language}`}
                >
                  <DiscoveryPhoto hit={hit} />
                  <span>
                    <strong>
                      <CustomerCopy>
                        {hit.product.content.en.name ?? hit.product.id}
                      </CustomerCopy>
                    </strong>
                    <span>
                      {published.status === "live"
                        ? text(
                            published.catalog.categories.find(
                              (c) => c.id === hit.product.categoryId,
                            )?.name ?? "",
                          )
                        : ""}
                    </span>
                    <span>
                      {copy("from")} {localizedMoney(hit.priceFils, language)}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {hits.length > limit && (
          <button
            className="b-text-button"
            type="button"
            onClick={() => setLimit((n) => n + 8)}
          >
            {copy("more")}
          </button>
        )}
      </div>
    </section>
  );
}

export function ComplementarySuggestions({
  contextSku,
  afterAdd = false,
}: {
  contextSku?: string;
  afterAdd?: boolean;
}) {
  const { language } = useLanguage(),
    published = useLiveCatalog(),
    { config } = useCheckoutConfig(),
    lines = useCart(),
    online = useOnline(),
    now = useCheckoutNow(config);
  const [dismissed, setDismissed] = useState(false),
    [lastAdded, setLastAdded] = useState(false),
    viewCart = useRef<HTMLAnchorElement>(null),
    id = useId();
  const copy = (key: string) =>
    localizedKey(`menu:conversion_${key}`, language);
  if (dismissed) return null;
  const context =
    published.status === "live"
      ? published.catalog.products.find((p) =>
          p.options.some((o) => o.id === contextSku),
        )?.id
      : undefined;
  const hits =
    online && published.status === "live"
      ? recommendations(published.catalog, config, lines, context, now)
      : [];
  if (!afterAdd && !hits.length) return null;
  return (
    <section className="b-complementary" aria-labelledby={id}>
      {(afterAdd || lastAdded) && (
        <p role="status" className="b-item-added">
          {copy("added")}
        </p>
      )}
      <h2 id={id}>{copy("anythingElse")}</h2>
      <nav className="b-complementary-nav" aria-label={copy("nextSteps")}>
        <a ref={viewCart} className="b-button" href={`/cart?lang=${language}`}>
          {copy("viewCart")}
        </a>
        <button
          type="button"
          className="b-text-button"
          onClick={() => setDismissed(true)}
        >
          {copy("continue")}
        </button>
      </nav>
      {!online && <p role="status">{copy("offline")}</p>}
      <div className="b-complementary-grid">
        {hits.map((hit) => (
          <Recommendation
            key={`${hit.product.id}:${published.status === "live" ? published.catalog.revision : ""}`}
            hit={hit}
            onAdded={() => {
              setLastAdded(true);
              viewCart.current?.focus();
            }}
          />
        ))}
      </div>
    </section>
  );
}
function Recommendation({
  hit,
  onAdded,
}: {
  hit: DiscoveryProduct;
  onAdded: () => void;
}) {
  const { language, text } = useLanguage(),
    { config } = useCheckoutConfig(),
    published = useLiveCatalog(),
    online = useOnline();
  const [sku, setSku] = useState(
    hit.options.length === 1 ? hit.options[0]!.id : "",
  );
  const option = hit.options.find((o) => o.id === sku),
    copy = (key: string) => localizedKey(`menu:conversion_${key}`, language),
    id = useId();
  const detailSku =
    option?.id ??
    hit.options
      .slice()
      .sort((a, b) => a.priceFils - b.priceFils || a.id.localeCompare(b.id))[0]!
      .id;
  const builder =
    !!option && (!!packSpec(option.id) || !!tricolorSpec(option.id));
  return (
    <article className="b-recommendation" data-recommendation={hit.product.id}>
      <DiscoveryPhoto hit={hit} />
      <div>
        <a
          className="b-recommendation-name"
          href={`/menu?product=${encodeURIComponent(hit.product.slug)}&sku=${encodeURIComponent(detailSku)}&lang=${language}`}
        >
          <CustomerCopy>
            {hit.product.content.en.name ?? hit.product.id}
          </CustomerCopy>
        </a>
        <p>
          {!option && copy("from")}{" "}
          {localizedMoney(option?.priceFils ?? hit.priceFils, language)}
        </p>
        {hit.options.length > 1 && (
          <>
            <label htmlFor={id}>{copy("option")}</label>
            <select
              id={id}
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            >
              <option value="">{copy("chooseOption")}</option>
              {hit.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {text(o.name)} · {localizedMoney(o.priceFils, language)}
                </option>
              ))}
            </select>
          </>
        )}
        {builder ? (
          <a
            className="b-link"
            href={`/menu?product=${encodeURIComponent(hit.product.slug)}&sku=${encodeURIComponent(detailSku)}&lang=${language}`}
          >
            {copy("configure")}
          </a>
        ) : (
          <button
            type="button"
            className="b-recommendation-add"
            disabled={!option || !online || published.status !== "live"}
            onClick={() => {
              const current = liveState();
              if (
                !online ||
                !option ||
                !config ||
                current.status !== "live" ||
                !discoveryProducts(
                  current.catalog,
                  config,
                  checkoutNow(config),
                ).some(
                  (h) =>
                    h.product.id === hit.product.id &&
                    h.options.some((o) => o.id === option.id),
                )
              )
                return;
              cart.add(option.id, 1);
              onAdded();
            }}
          >
            {copy("add")}
          </button>
        )}
      </div>
    </article>
  );
}
