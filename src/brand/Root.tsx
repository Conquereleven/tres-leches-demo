import { MenuPage, HowToOrder } from "./StorePages";
import { LocalizationProvider } from "./localization";
import { CartPage, CheckoutPage, CheckoutReturn } from "./Shop";
import { useEffect, useState } from "react";
import { CommerceWorkspace } from "../commerce/Workspace";
import { BrandExperience } from "./Experience";
import { PolicyPage } from "./Policies";
import { isPolicyPath } from "./business";
function RoutedApp() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const sync = () => setPath(location.pathname);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  if (path.startsWith("/operations")) return <CommerceWorkspace />;
  const page = path.replace(/\/+$/, "");
  if (page === "/menu") return <MenuPage />;
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
