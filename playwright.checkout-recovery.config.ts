import { defineConfig, devices } from "@playwright/test";
import checkout from "./playwright.checkout.config";
export default defineConfig({
  ...checkout,
  outputDir: "test-results/checkout-recovery",
  projects: [
    {
      name: "chromium-mobile",
      use: { browserName: "chromium", viewport: { width: 390, height: 844 } },
    },
    {
      name: "chromium-desktop",
      use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "webkit-iphone",
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
  ],
});
