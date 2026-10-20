import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/operations-e2e",
  outputDir: "test-results/operations",
  workers: 1,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: {
    baseURL: "http://127.0.0.1:3242",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 3242",
    url: "http://127.0.0.1:3242",
    reuseExistingServer: false,
  },
});
