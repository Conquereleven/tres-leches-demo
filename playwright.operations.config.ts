import { defineConfig } from "@playwright/test";
const port = Number(process.env.OPERATIONS_E2E_PORT ?? 3242);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid Operations E2E port");
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "tests/operations-e2e",
  outputDir: "test-results/operations",
  workers: 1,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
