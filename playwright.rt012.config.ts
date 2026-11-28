import { defineConfig } from "@playwright/test";

const port = 4178;
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "tests/rt012-e2e",
  outputDir: "test-results/rt012",
  workers: 1,
  projects: [
    { name: "chromium", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
    { name: "webkit", use: { browserName: "webkit", viewport: { width: 390, height: 844 } } },
    { name: "chromium-mobile", use: { browserName: "chromium", viewport: { width: 390, height: 844 } } },
    { name: "webkit-desktop", use: { browserName: "webkit", viewport: { width: 1440, height: 900 } } },
  ],
  use: { baseURL, trace: "retain-on-failure" },
  webServer: {
    command: `PORT=${port} node --import tsx tests/fixtures/rt012-panettone-server.ts`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
  },
});
