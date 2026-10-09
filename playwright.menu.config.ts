import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "3l-menu-e2e-"));
export default defineConfig({
  outputDir: "test-results/menu",
  testDir: "tests/menu-e2e",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3191",
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: `DB_PATH=${dir}/state.sqlite PAYMENNT_PUBLIC_KEY=pk_test_fixture_local API_PORT=3191 PORT=3191 APP_ORIGIN=http://127.0.0.1:3191 node --import tsx tests/fixtures/web-checkout-server.ts`,
    url: "http://127.0.0.1:3191",
    reuseExistingServer: false,
  },
});
