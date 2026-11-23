import { VisualV32 } from "./visual-v32/VisualV32";
import { LocalizationProvider, useLanguage } from "./localization";
import { CheckoutPage, CheckoutReturn } from "./Shop";
import { Suspense, lazy, useEffect, useState } from "react";
import { BrandExperience } from "./Experience";
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
  // Canonical V3.2 customer storefront. Keep the authorized legacy checkout
  // and server-authoritative payment/3DS recovery unchanged.
  if (page === "/visual-v32" || page.startsWith("/visual-v32/")) return <VisualV32 />;
  if (["", "/", "/menu", "/bakery", "/cart", "/contact", "/how-to-order", "/journal"].includes(page))
    return <VisualV32 />;
  if (page === "/checkout/return") return <CheckoutReturn />;
  if (page === "/checkout") return <CheckoutPage />;
  // Canonical public policies render inside the approved V3.2 shell.
  // VisualV32 owns their frame; the authorized legal copy still comes from
  // src/brand/Policies.tsx (see VisualPolicy), never from preview text.
  if (isPolicyPath(page)) return <VisualV32 />;
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
