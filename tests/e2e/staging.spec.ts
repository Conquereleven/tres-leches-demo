import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import https from "node:https";
import http from "node:http";
import { stagingEnv } from "../fixtures/staging";

test("TL18 HTTPS staging login, readiness RBAC, TEST seeds and responsive", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const dir = mkdtempSync(join(tmpdir(), "tl18-browser-"));
  const origin = "https://127.0.0.1:5185";
  // Ephemeral certificate only for this localhost TLS rehearsal; never a deployment certificate.
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
  const child = spawn(
    process.execPath,
    process.env.E2E_BUILD
      ? ["dist/node/server.mjs"]
      : ["--import", "tsx", "server/main.ts"],
    {
      env: {
        ...process.env,
        ...stagingEnv(dir),
        INTEGRATION_MODE: "false",
        DEMO_MODE: "false",
        API_PORT: "3106",
        APP_ORIGIN: origin,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const proxy = https.createServer(
    {
      key: readFileSync(join(dir, "key.pem")),
      cert: readFileSync(join(dir, "cert.pem")),
    },
    (req, res) => {
      const upstream = http.request(
        {
          hostname: "127.0.0.1",
          port: 3106,
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
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Staging startup timeout")),
        10000,
      );
      child.stdout.on("data", (chunk) => {
        if (String(chunk).includes("listening")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("Staging exited before listen"));
      });
    });
    await new Promise<void>((resolve) =>
      proxy.listen(5185, "127.0.0.1", resolve),
    );
    expect(
      (await context.request.get(origin + "/api/workspace")).status(),
    ).toBe(401);
    const ready = await (
      await context.request.get(origin + "/api/ready")
    ).json();
    expect(ready.overall).toBe("NOT READY");
    expect(ready.components.backup.status).toBe("READY");
    expect(ready.components.Paymennt.status).toBe("NOT CONFIGURED");
    expect(
      (
        await context.request.post(origin + "/api/webhooks/payment", {
          data: {},
        })
      ).status(),
    ).toBe(503);
    const page = await context.newPage();
    await page.goto(origin);
    await page.getByRole("button", { name: "Gestión", exact: true }).click();
    await page.getByLabel("Agente", { exact: true }).fill("test-admin");
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill("fixture-password-not-shipped");
    await page.getByRole("button", { name: "Entrar al workspace" }).click();
    await expect(
      page.getByText("Staging · conexiones pendientes de activación", {
        exact: true,
      }),
    ).toBeVisible();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") errors.push(m.text());
    });
    const clean = await (
      await context.request.get(origin + "/api/workspace")
    ).json();
    for (const field of [
      "conversations",
      "orders",
      "payments",
      "jobs",
      "catalog",
      "uatScenarios",
    ])
      expect(clean[field]).toHaveLength(0);
    expect(
      clean.zones.find((z: { id: string }) => z.id === "jvc").deliveryFeeAed,
    ).toBeNull();
    expect(JSON.stringify(clean)).not.toMatch(
      /25\.0657|mock-pay-|TEST-CONVERSATION|50000100/,
    );
    for (const route of ["/api/demo/location", "/api/demo/payment"])
      expect(
        (
          await context.request.post(origin + route, {
            headers: { Origin: origin },
            data: {},
          })
        ).status(),
      ).toBe(404);
    expect(
      (await context.request.get(origin + "/qa-comparison.html")).status(),
    ).toBe(404);
    expect(
      (await context.request.get(origin + "/operations/legacy-inbox")).status(),
    ).toBe(404);
    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(
        page
          .getByRole("navigation", { name: "Operaciones" })
          .getByRole("button", { name: /Inbox/ }),
      ).toHaveCount(1);
      await expect(page.locator(".admin-header")).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText("MVP demo");
      await expect(page.locator("body")).not.toContainText("Inbox anterior");
      await expect(page.getByText(/No conversations yet/)).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: `work/qa/tl24-inbox-${width}.png`,
        fullPage: true,
      });
      if (width === 390)
        await page
          .getByRole("navigation", { name: "Operaciones" })
          .screenshot({ path: "work/qa/tl24-mobile-nav.png" });
      await page.getByRole("button", { name: "Pedidos", exact: true }).click();
      await expect(page.getByText(/No orders yet/)).toBeVisible();
      await page.screenshot({
        path: `work/qa/tl24-orders-${width}.png`,
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Producción", exact: true })
        .click();
      await expect(page.getByText(/No production items yet/)).toBeVisible();
      await page
        .getByRole("button", { name: "Inbox unificado", exact: true })
        .click();
    }
    await page
      .getByRole("button", { name: "Preparación y UAT", exact: true })
      .click();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Preparación y UAT · NOT READY" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Diez escenarios de aceptación" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Comprobar Paymennt TEST" }).click();
    await expect(page.locator(".commerce")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    expect(
      (await (await context.request.get(origin + "/api/workspace")).json())
        .payments,
    ).toHaveLength(0);
    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      await page.screenshot({
        path: `work/qa/tl18-readiness-${width}.png`,
        fullPage: true,
      });
    }
    expect(errors).toEqual([]);
    expect(
      readdirSync(join(dir, "backups")).filter((f) => f.endsWith(".sqlite"))
        .length,
    ).toBeGreaterThan(0);
    await context.request.post(origin + "/api/logout", {
      headers: { Origin: origin },
      data: {},
    });
    for (const role of ["manager", "operator"]) {
      expect(
        (
          await context.request.post(origin + "/api/login", {
            headers: { Origin: origin },
            data: {
              id: `test-${role}`,
              password: "fixture-password-not-shipped",
            },
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await context.request.post(origin + "/api/admin/diagnostics", {
            headers: { Origin: origin },
            data: { provider: "paymennt" },
          })
        ).status(),
      ).toBe(403);
      const workspace = await (
        await context.request.get(origin + "/api/workspace")
      ).json();
      expect(workspace.conversations).toHaveLength(0);
      expect(workspace.orders).toHaveLength(0);
      expect(workspace.uatScenarios).toHaveLength(0);
      expect(
        (
          await context.request.post(origin + "/api/commands", {
            headers: {
              Origin: origin,
              "Idempotency-Key": "test-zone-admin-only",
            },
            data: { type: "updateZone", zone: workspace.zones[0] },
          })
        ).status(),
      ).toBe(403);
      await context.request.post(origin + "/api/logout", {
        headers: { Origin: origin },
        data: {},
      });
    }
  } finally {
    await context.close();
    proxy.closeAllConnections();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) resolve();
      else child.once("exit", () => resolve());
    });
    rmSync(dir, { recursive: true, force: true });
  }
});
