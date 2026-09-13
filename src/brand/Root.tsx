import { useEffect, useState } from "react";
import { CommerceWorkspace } from "../commerce/Workspace";
import { BrandExperience } from "./Experience";
export function Root() {
  const [operations, setOperations] = useState(
    location.pathname.startsWith("/operations"),
  );
  useEffect(() => {
    const sync = () =>
      setOperations(location.pathname.startsWith("/operations"));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  return operations ? (
    <CommerceWorkspace />
  ) : (
    <BrandExperience
      onManage={() => {
        history.pushState({}, "", "/operations/inbox");
        setOperations(true);
      }}
    />
  );
}
