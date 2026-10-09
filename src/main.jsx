import "./styles.css";
import React from "react";
import { createRoot } from "react-dom/client";
import { Root } from "./brand/Root";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
