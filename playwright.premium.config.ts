import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const dir = mkdtempSync(join(tmpdir(), "3l-premium-qa-"));
export default defineConfig({
  testDir: "tests/premium-e2e",
  outputDir: "test-results/premium",
  workers: 1,
  timeout: 90000,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: { baseURL: "http://127.0.0.1:3284", headless: true },
  webServer: {
    command: `DB_PATH=${dir}/state.sqlite PORT=3284 API_PORT=3284 APP_ORIGIN=http://127.0.0.1:3284 PAN_PACK_PREMIUM_PRICING_ENABLED=true node --import tsx tests/fixtures/pack-builder-server.ts`,
    url: "http://127.0.0.1:3284/api/health",
    reuseExistingServer: false,
  },
});
