import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/email-e2e",
  fullyParallel: true,
  outputDir: "test-results/email",
  reporter: "list",
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
