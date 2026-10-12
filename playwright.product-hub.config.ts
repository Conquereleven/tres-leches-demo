import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Real backend on a disposable database: approved catalog plus its foundation,
// no providers, Product Hub enabled. Needs `npm run build` first.
const dir = mkdtempSync(join(tmpdir(), "3l-product-hub-e2e-"));
export default defineConfig({
  testDir: "tests/product-hub-e2e",
  outputDir: "test-results/product-hub",
  workers: 1,
  timeout: 90000,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: { baseURL: "http://127.0.0.1:3262", headless: true },
  webServer: {
    command: `DB_PATH=${dir}/state.sqlite PORT=3262 API_PORT=3262 APP_ORIGIN=http://127.0.0.1:3262 node --import tsx tests/fixtures/product-hub-server.ts`,
    url: "http://127.0.0.1:3262/api/health",
    reuseExistingServer: false,
  },
});
