import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// One compiled build, one disposable database, dynamic adoption on. The test publishes
// from Product Hub and reads the storefront served by the same build: no rebuild.
// Needs `npm run build` first.
const dir = mkdtempSync(join(tmpdir(), "3l-storefront-dynamic-e2e-"));
export default defineConfig({
  testDir: "tests/storefront-dynamic-e2e",
  outputDir: "test-results/storefront-dynamic",
  workers: 1,
  timeout: 120000,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: { baseURL: "http://127.0.0.1:3264", headless: true },
  webServer: {
    command: `DB_PATH=${dir}/state.sqlite PORT=3264 API_PORT=3264 APP_ORIGIN=http://127.0.0.1:3264 node --import tsx tests/fixtures/storefront-dynamic-server.ts`,
    url: "http://127.0.0.1:3264/api/health",
    reuseExistingServer: false,
  },
});
