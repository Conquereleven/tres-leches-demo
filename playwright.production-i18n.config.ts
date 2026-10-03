import { defineConfig } from "@playwright/test";
if (process.env.PRODUCTION_SMOKE !== "1")
  throw new Error(
    "Production smoke requires explicit PRODUCTION_SMOKE=1; never submits payment.",
  );
export default defineConfig({
  testDir: "tests/production-i18n",
  outputDir: "test-results/production-i18n",
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: "https://www.3ldubai.ae",
    viewport: { width: 390, height: 900 },
  },
});
