import { useState } from "react";
import { App } from "../App.jsx";
import { BrandExperience } from "./Experience";
export function Root() {
  const [view, setView] = useState<"brand" | "admin" | "demo">("brand");
  return view === "brand" ? (
    <BrandExperience
      onManage={() => setView("admin")}
      onDemo={() => setView("demo")}
    />
  ) : (
    <>
      <button className="b-return" onClick={() => setView("brand")}>
        ← Pastelerías 3L
      </button>
      <App initialMode={view === "admin" ? "admin" : "shop"} />
    </>
  );
}
