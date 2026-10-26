import { defineConfig, devices } from "@playwright/test";
import checkout from "./playwright.checkout.config";
export default defineConfig({
  ...checkout,
  testDir: "tests/delivery-area-e2e",
  outputDir: "test-results/delivery-area",
  webServer: {
    ...checkout.webServer,
    command: `DELIVERY_AREA_FIXTURE=true ${(checkout.webServer as { command: string }).command}`,
  },
  projects: [
    {
      name: "chromium-mobile",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
    {
      name: "webkit-iphone",
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
    {
      name: "chromium-desktop",
      use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } },
    },
  ],
});
