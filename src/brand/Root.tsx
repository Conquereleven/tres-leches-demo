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
    <>
      <header>
        <a className="b-return" href="/">
          ← Pastelerías 3L
        </a>
      </header>
      <CommerceWorkspace />
    </>
  ) : (
    <BrandExperience
      onManage={() => {
        history.pushState({}, "", "/operations/inbox");
        setOperations(true);
      }}
    />
  );
}
