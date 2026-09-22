import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "3l-checkout-e2e-"));
export default defineConfig({
  testDir: "tests/checkout-e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3189",
    headless: true,
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: `DB_PATH=${dir}/state.sqlite API_PORT=3189 PORT=3189 APP_ORIGIN=http://127.0.0.1:3189 node --import tsx tests/fixtures/web-checkout-server.ts`,
    url: "http://127.0.0.1:3189",
    reuseExistingServer: false,
  },
});
