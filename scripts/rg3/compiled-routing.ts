/** Local Production-profile rehearsal: compiled Node, disposable empty DB, no providers. */
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import https from "node:https";
import http from "node:http";
import { chromium, webkit, expect } from "@playwright/test";
import { stagingEnv } from "../../tests/fixtures/staging";

const dir = mkdtempSync(join(tmpdir(), "3l-rg3-routing-"));
const origin = "https://127.0.0.1:3256";
const expectedRevision = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const fixtureEnv = stagingEnv(dir);
delete fixtureEnv.STAGING_SEED;
const users = JSON.parse(fixtureEnv.OPERATOR_USERS_JSON!);
users.push({ ...users[0], id: "test-agent", role: "agent" });
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    join(dir, "key.pem"),
    "-out",
    join(dir, "cert.pem"),
    "-days",
    "1",
    "-subj",
    "/CN=127.0.0.1",
  ],
  { stdio: "ignore" },
);
const child = spawn(process.execPath, ["dist/node/server.mjs"], {
  env: {
    PATH: process.env.PATH,
    ...fixtureEnv,
    APP_ENV: "production",
    APP_ORIGIN: origin,
    HOST: "127.0.0.1",
    PORT: "3255",
    AI_ENABLED: "false",
    AI_AUTONOMOUS_ALLOWED: "false",
    AI_AGENT_DEFAULT_MODE: "copilot",
    OPERATOR_USERS_JSON: JSON.stringify(users),
  },
  stdio: "ignore",
});
const proxy = https.createServer(
  {
    key: readFileSync(join(dir, "key.pem")),
    cert: readFileSync(join(dir, "cert.pem")),
  },
  (req, res) => {
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: 3255,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  },
);
const routes = [
  "overview",
  "orders",
  "production",
  "delivery",
  "inbox",
  "products",
  "print",
  "settings",
];
const report: Record<string, unknown> = {
  expectedRevision,
  environment: "local-production-profile",
  providers: "offline",
  productionAccessed: false,
  routes: [],
};
let blocked = false;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch("http://127.0.0.1:3255/api/health")).ok) break;
    } catch {}
    if (i === 99) throw Error("Compiled application did not start");
    await new Promise((r) => setTimeout(r, 100));
  }
  await new Promise<void>((r) => proxy.listen(3256, "127.0.0.1", r));
  for (const [name, browserType] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ] as const) {
    const browser = await browserType.launch();
    try {
      const context = await browser.newContext({ ignoreHTTPSErrors: true });
      const request = context.request;
      const health = await (await request.get(origin + "/api/health")).json();
      if (health.revision !== expectedRevision)
        throw Error("Compiled revision mismatch");
      const ready = await (await request.get(origin + "/api/ready")).json();
      const anonymousWorkspace = (
        await request.get(origin + "/api/workspace")
      ).status();
      if (anonymousWorkspace !== 401 || !ready.storage)
        throw Error("Storage or authentication regression");
      const page = await context.newPage();
      const publicPage = await page.goto(origin);
      const publicImages = await page
        .locator("img")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              !(image as HTMLImageElement).complete ||
              (image as HTMLImageElement).naturalWidth > 0,
          ),
        );
      const assets = await request.get(origin + "/assets/");
      const privatePaths: Record<string, number> = {};
      for (const path of [
        "/.env",
        "/data/commerce.sqlite",
        "/server/db/store.ts",
      ])
        privatePaths[path] = (await request.get(origin + path)).status();
      if (Object.values(privatePaths).some((status) => status !== 404))
        throw Error("Private path exposure");
      const unknown = (
        await request.get(origin + "/unknown-private-file.sqlite")
      ).status();
      const unknownApi = await request.get(origin + "/api/unknown");
      const publicRoutes: Record<string, number> = {};
      for (const route of ["/menu", "/cart", "/checkout", "/checkout/return"])
        publicRoutes[route] = (await request.get(origin + route)).status();
      if (
        publicPage?.status() !== 200 ||
        !publicImages ||
        unknown !== 404 ||
        unknownApi.status() !== 401 ||
        !unknownApi.headers()["content-type"]?.includes("application/json") ||
        Object.values(publicRoutes).some((status) => status !== 200)
      )
        throw Error("Public/API routing regression");
      const anonymousRoutes = [];
      for (const route of routes) {
        const response = await page.goto(origin + "/operations/" + route);
        const status = response?.status();
        let loginVisible = false;
        if (status === 200) {
          await page
            .getByRole("button", { name: "Sign in to workspace" })
            .waitFor();
          loginVisible = true;
        } else blocked = true;
        anonymousRoutes.push({ route, status, loginVisible });
      }
      // Exercise the compiled login UI, not just API cookie injection.
      await page.getByLabel("Agent", { exact: true }).fill("test-admin");
      await page.getByLabel("Password", { exact: true }).fill("fixture-password-not-shipped");
      const loggedIn = page.waitForResponse(
        (response) => response.url() === origin + "/api/login",
      );
      await page.getByRole("button", { name: "Sign in to workspace" }).click();
      const login = await loggedIn;
      if (login.status() !== 200) throw Error("Local admin login failed");
      const entries = [];
      for (const route of routes) {
        const response = await page.goto(origin + "/operations/" + route);
        const status = response?.status();
        let refresh = status;
        if (status === 200) {
          await page.locator(".ops-shell").waitFor();
          refresh = (await page.reload())?.status();
          await page.locator(".ops-shell").waitFor();
        }
        if (status !== 200 || refresh !== 200) blocked = true;
        entries.push({ route, status, refresh, shell: status === 200 });
      }
      const unknownOperation = (
        await request.get(origin + "/operations/not-a-route")
      ).status();
      if (unknownOperation !== 404) throw Error("Open Operations fallback");
      const agent = await browser.newContext({ ignoreHTTPSErrors: true });
      const agentLogin = await agent.request.post(origin + "/api/login", {
        headers: { Origin: origin },
        data: { id: "test-agent", password: "fixture-password-not-shipped" },
      });
      const diagnostics = (
        await agent.request.get(origin + "/api/admin/diagnostics")
      ).status();
      const agentPage = await agent.newPage();
      await agentPage.goto(origin + "/operations/inbox");
      await agentPage.locator(".ops-shell").waitFor();
      const settingsHidden =
        (await agentPage
          .getByRole("button", { name: "Settings", exact: true })
          .count()) === 0;
      const agentRestrictedRoutes: Record<string, number> = {};
      for (const [route, heading] of [
        ["settings", "Settings access is restricted"],
        ["products", "Product Hub access is restricted"],
      ]) {
        const response = await agentPage.goto(origin + "/operations/" + route);
        agentRestrictedRoutes[route!] = response?.status() ?? 0;
        await expect(agentPage.getByText(heading!, { exact: true })).toBeVisible();
        if (response?.status() !== 200) throw Error("Restricted route shell missing");
        await agentPage.reload();
        await expect(agentPage.getByText(heading!, { exact: true })).toBeVisible();
      }
      if (agentLogin.status() !== 200 || diagnostics !== 403 || !settingsHidden)
        throw Error("Role boundary regression");
      (report.routes as unknown[]).push({
        browser: name,
        health,
        ready,
        anonymousWorkspace,
        anonymousRoutes,
        adminRoutes: entries,
        agentDiagnostics: diagnostics,
        agentSettingsHidden: settingsHidden,
        agentRestrictedRoutes,
        publicHomepage: publicPage?.status(),
        publicImages,
        publicRoutes,
        staticDirectoryStatus: assets.status(),
        unknownRouteStatus: unknown,
        unknownOperationStatus: unknownOperation,
        privatePaths,
        unknownApiStatus: unknownApi.status(),
        unknownApiContentType: unknownApi.headers()["content-type"],
      });
      await agent.close();
      await context.close();
    } finally {
      await browser.close();
    }
  }
  report.verdict = blocked
    ? "BLOCKED: compiled Node route or refresh failed"
    : "PASS";
  writeFileSync(
    "work/rg3/compiled-routing.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      verdict: report.verdict,
      expectedRevision,
      evidence: "work/rg3/compiled-routing.json",
    }),
  );
  if (blocked) process.exitCode = 2;
} finally {
  child.kill();
  await new Promise<void>((r) => child.once("exit", () => r()));
  await new Promise<void>((r) => proxy.close(() => r()));
  rmSync(dir, { recursive: true, force: true });
}
