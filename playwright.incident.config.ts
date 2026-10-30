import { defineConfig } from "@playwright/test";
import checkout from "./playwright.checkout.config";
export default defineConfig({
  ...checkout,
  outputDir: "test-results/incident",
  reporter: [
    ["list"],
    ["json", { outputFile: "work/incident/browser-results.json" }],
  ],
  projects: [
    { name: "chromium-390", use: { browserName: "chromium" } },
    { name: "webkit-390", use: { browserName: "webkit" } },
  ],
});
