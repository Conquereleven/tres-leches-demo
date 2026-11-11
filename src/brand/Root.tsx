import { MenuPage, HowToOrder } from "./StorePages";
import { LocalizationProvider, useLanguage } from "./localization";
import { CartPage, CheckoutPage, CheckoutReturn } from "./Shop";
import { Suspense, lazy, useEffect, useState } from "react";
import { BrandExperience } from "./Experience";
import { PolicyPage } from "./Policies";
import { isPolicyPath } from "./business";
// Staff-only code (Operations, Product Hub) loads only on /operations, so
// customers never download it. A tab opened before a deploy may ask for a chunk
// that no longer exists: reload once to get the current build instead of failing.
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
        fallback={<main className="commerce ops-shell" aria-busy="true" />}
      >
        <CommerceWorkspace />
      </Suspense>
    );
  const page = path.replace(/\/+$/, "");
  // `/menu/<slug>` is a product's permanent URL (3L-SEO-AEO-002).
  if (page === "/menu" || page.startsWith("/menu/")) return <MenuPage />;
  if (page === "/how-to-order") return <HowToOrder />;
  if (page === "/checkout/return") return <CheckoutReturn />;
  if (page === "/cart") return <CartPage />;
  if (page === "/checkout") return <CheckoutPage />;
  if (isPolicyPath(page)) return <PolicyPage path={page} />;
  return (
    <BrandExperience
      onManage={() => {
        history.pushState({}, "", "/operations/inbox");
        setPath("/operations/inbox");
      }}
    />
  );
}

export function Root() {
  return (
    <LocalizationProvider>
      <RoutedApp />
    </LocalizationProvider>
  );
}
