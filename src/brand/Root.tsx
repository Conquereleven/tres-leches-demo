import { CheckoutReturn } from "./Checkout";
import { useEffect, useState } from "react";
import { CommerceWorkspace } from "../commerce/Workspace";
import { BrandExperience } from "./Experience";
import { PolicyPage } from "./Policies";
import { isPolicyPath } from "./business";
export function Root() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const sync = () => setPath(location.pathname);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  if (path.startsWith("/operations")) return <CommerceWorkspace />;
  const page = path.replace(/\/+$/, "");
  if (page === "/checkout/return") return <CheckoutReturn />;
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
