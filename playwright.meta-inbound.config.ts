import { defineConfig } from "@playwright/test";
/** Separate server/port so Pack Builder and the existing OMS QA stay untouched. */
export default defineConfig({
  testDir: "tests/operations-e2e",
  testMatch: "meta-coexistence.spec.ts",
  outputDir: "test-results/meta-inbound",
  workers: 1,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: { baseURL: "http://127.0.0.1:3278", headless: true },
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 3278 --strictPort",
    url: "http://127.0.0.1:3278",
    reuseExistingServer: false,
  },
});
