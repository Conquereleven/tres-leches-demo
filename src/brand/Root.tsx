import { StorefrontCheckoutFrame, VisualV32 } from "./visual-v32/VisualV32";
import { LocalizationProvider, useLanguage } from "./localization";
import { CheckoutPage, CheckoutReturn } from "./Shop";
import { useMenu } from "./menu";
import { useLiveCatalog } from "./live-catalog";
import { pages } from "./Policies";
import { productDescription, productTitle } from "./visual-v32/ApprovedPurchaseSelector";
import { productMetadata, socialImage, storefrontLabels, storefrontMetadata } from "../seo/pages";
import { Suspense, lazy, useEffect, useState } from "react";
// Staff-only code (Operations, Product Hub) loads only on /operations, so
// customers never download it. A tab opened before a deploy may ask for a chunk
// that no longer exists: reload once to get the current build instead of failing.
const operationsLoadingLabel = "Loading 3L Operations…";
const RELOADED = "3l-operations-chunk-reload";
const CommerceWorkspace = lazy(() =>
  import("../commerce/Workspace").then(
    (m) => {
      try {
        sessionStorage.removeItem(RELOADED);
      } catch {
        /* Storage may be unavailable; the reload guard is best effort. */
      }
      return { default: m.CommerceWorkspace };
    },
    (error: unknown) => {
      let first = true;
      try {
        first = !sessionStorage.getItem(RELOADED);
        sessionStorage.setItem(RELOADED, "1");
      } catch {
        first = false;
      }
      if (first) {
        location.reload();
        return new Promise<never>(() => {});
      }
      throw error;
    },
  ),
);
function StorefrontMetadata({ path }: { path: string }) {
  const { language, text } = useLanguage();
  const catalog = useLiveCatalog();
  const menu = useMenu();
  const product = path.startsWith("/menu/") ? menu.products.find(item => item.slug === path.slice(6)) : undefined;
  const metadata = product
    ? productMetadata(productTitle(product, language, catalog, text), productDescription(product, language, catalog))
    : storefrontMetadata(path, language, pages);
  const title = metadata?.title;
  const description = metadata?.description;
  useEffect(() => {
    if (!title || !description) return;
    document.title = title;
    for (const [selector, value] of [
      ['meta[name="description"]', description], ['meta[property="og:description"]', description],
      ['meta[name="twitter:description"]', description], ['meta[property="og:title"]', title],
      ['meta[name="twitter:title"]', title], ['meta[property="og:locale"]', `${language}_AE`],
      ['meta[property="og:image:alt"]', language === "en" ? socialImage.alt : storefrontLabels[language].wordmark],
    ] as const) document.querySelector(selector)?.setAttribute("content", value);
  }, [language, title, description]);
  return null;
}
function RoutedApp() {
  const { language } = useLanguage();
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const sync = () => setPath(location.pathname);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    const publicPage = !path.startsWith("/operations");
    document.documentElement.lang = publicPage ? language : "en";
    document.documentElement.dir =
      publicPage && language === "ar" ? "rtl" : "ltr";
  }, [path, language]);
  if (path.startsWith("/operations"))
    return (
      <Suspense
        fallback={
          <main className="operations-entry" aria-busy="true">
            <span role="status">{operationsLoadingLabel}</span>
          </main>
        }
      >
        <CommerceWorkspace />
      </Suspense>
    );
  const page = path.replace(/\/+$/, "") || "/";
  if (page === "/checkout/return" || page === "/checkout") {
    return <><StorefrontMetadata path={page} /><StorefrontCheckoutFrame>
      {page === "/checkout/return" ? <CheckoutReturn /> : <CheckoutPage />}
    </StorefrontCheckoutFrame></>;
  }
  return <><StorefrontMetadata path={page} /><VisualV32 key={path} pathname={path} search={location.search} /></>;
}

export function Root() {
  return (
    <LocalizationProvider>
      <RoutedApp />
    </LocalizationProvider>
  );
}
