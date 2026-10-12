import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { Store, seed } from "../../server/db/store";
import {
  loadBootstrapSources,
  planCatalogBootstrap,
} from "../../server/catalog/bootstrap";
import { stagingEnv } from "../fixtures/staging";

const origin = "https://staging.example.invalid";
function png(width: number, height: number) {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.alloc(64))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
/** A real server process in staging mode: real login, real sessions, real roles. */
async function server(port: number, flags: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "hub-http-"));
  const env = { ...stagingEnv(dir), ...flags };
  mkdirSync(dirname(env.DB_PATH!), { recursive: true });
  const sources = loadBootstrapSources(process.cwd());
  const state = seed();
  state.catalog = structuredClone(sources.approved);
  state.catalogFoundation = planCatalogBootstrap(
    state.catalog,
    sources,
  ).foundation;
  new Store(env.DB_PATH!, "release-staging", state).close();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "server/main.ts"], {
    env: {
      ...process.env,
      ...env,
      APP_ORIGIN: origin,
      HOST: "127.0.0.1",
      PORT: String(port),
      API_PORT: String(port + 1),
    },
    stdio: "ignore",
  });
  let ready = false;
  for (let i = 0; i < 150 && child.exitCode === null; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, "staging server started");
  const login = async (role: string) => {
    const res = await fetch(base + "/api/login", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: `test-${role}`,
        password: "fixture-password-not-shipped",
      }),
    });
    assert.equal(res.status, 200, `login ${role}`);
    return res.headers.get("set-cookie")!.split(";")[0]!;
  };
  const call = (
    path: string,
    cookie: string | null,
    body?: unknown,
    extra: Record<string, string> = {},
  ) =>
    fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body === undefined
          ? {}
          : {
              Origin: origin,
              "Content-Type": "application/json",
              "Idempotency-Key": randomUUID(),
            }),
        ...extra,
      },
      body:
        body === undefined
          ? undefined
          : Buffer.isBuffer(body)
            ? new Uint8Array(body)
            : JSON.stringify(body),
    });
  const close = async () => {
    child.kill();
    await new Promise<void>((r) =>
      child.exitCode !== null ? r() : child.once("exit", () => r()),
    );
    rmSync(dir, { recursive: true, force: true });
  };
  return { base, env, login, call, close };
}
const meta = (expectedVersion: number) =>
  Buffer.from(
    JSON.stringify({
      expectedVersion,
      alt: Object.fromEntries(
        ["en", "es", "ar"].map((l) => [
          l,
          { name: null, description: null, variantLabel: null },
        ]),
      ),
    }),
  ).toString("base64url");

test("HTTP RBAC: sessions, roles, origin and idempotency are enforced by the API, not by the interface", async () => {
  const s = await server(3171, {
    PRODUCT_HUB_ENABLED: "true",
    PRODUCT_HUB_PUBLISH_ENABLED: "true",
  });
  try {
    // No session: nothing.
    assert.equal((await s.call("/api/product-hub", null)).status, 401);
    assert.equal(
      (
        await s.call("/api/product-hub/commands", null, {
          type: "discardDraft",
          expectedVersion: 0,
        })
      ).status,
      401,
    );
    const admin = await s.login("admin");
    const manager = await s.login("manager");
    const operator = await s.login("operator");

    const adminView = await (await s.call("/api/product-hub", admin)).json();
    assert.equal(adminView.available, true);
    assert.deepEqual(adminView.permissions, {
      canEdit: true,
      canPublish: true,
    });
    assert.equal(adminView.flags.publishEnabled, true);
    const managerView = await (
      await s.call("/api/product-hub", manager)
    ).json();
    assert.deepEqual(managerView.permissions, {
      canEdit: false,
      canPublish: false,
    });
    assert.equal(managerView.products.length, adminView.products.length);
    assert.equal((await s.call("/api/product-hub", operator)).status, 403);

    const product = adminView.products.find(
      (p: { id: string }) => p.id === "pan-de-muerto-traditional--azucar",
    );
    const command = {
      type: "saveProduct",
      expectedVersion: 0,
      product: {
        id: product.id,
        slug: product.slug,
        familyId: product.familyId,
        categoryId: product.categoryId,
        name: product.name,
        description: "Edited over HTTP.",
        commercialState: product.commercialState,
        translations: product.translations,
        media: product.media,
      },
      variants: product.variants.map((v: Record<string, unknown>) => ({
        skuId: v.skuId,
        flavor: v.flavor,
        size: v.size,
        packQuantity: v.packQuantity,
        commercialState: v.commercialState,
        translations: v.translations,
        media: v.media,
        catalogName: v.catalogName,
        priceFils: (v.priceFils as number) + 100,
        active: v.active,
        availability: v.availability,
      })),
    };
    // Manager and operator cannot write, whatever they send.
    for (const cookie of [manager, operator]) {
      assert.equal(
        (await s.call("/api/product-hub/commands", cookie, command)).status,
        403,
      );
      assert.equal(
        (
          await s.call("/api/product-hub/commands", cookie, {
            type: "publish",
            expectedVersion: 0,
            expectedPublishedRevision: adminView.published.id,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await s.call("/api/product-hub/media", cookie, png(400, 400), {
            "Content-Type": "image/png",
            "X-Hub-Meta": meta(0),
          })
        ).status,
        403,
      );
    }
    // A write from another origin is refused even with a valid admin session.
    assert.equal(
      (
        await s.call("/api/product-hub/commands", admin, command, {
          Origin: "https://evil.example",
        })
      ).status,
      403,
    );
    // Missing idempotency key, malformed JSON, unknown command, oversized body.
    assert.equal(
      (
        await s.call("/api/product-hub/commands", admin, command, {
          "Idempotency-Key": "",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await s.call(
          "/api/product-hub/commands",
          admin,
          Buffer.from("{not json"),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await s.call("/api/product-hub/commands", admin, {
          type: "dropEverything",
          expectedVersion: 0,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await s.call(
          "/api/product-hub/commands",
          admin,
          Buffer.alloc(600 * 1024, 32),
        )
      ).status,
      413,
    );
    assert.equal((await s.call("/api/product-hub/unknown", admin)).status, 404);
    assert.equal(
      (await (await s.call("/api/product-hub", admin)).json()).draft,
      null,
      "nothing above created a draft",
    );

    // Admin: save, replay with the same key, then a stale second editor.
    const key = randomUUID();
    const saved = await s.call("/api/product-hub/commands", admin, command, {
      "Idempotency-Key": key,
    });
    assert.equal(saved.status, 200);
    const first = await saved.json();
    assert.deepEqual(
      await (
        await s.call("/api/product-hub/commands", admin, command, {
          "Idempotency-Key": key,
        })
      ).json(),
      first,
    );
    assert.equal(
      (await s.call("/api/product-hub/commands", admin, command)).status,
      409,
    );

    // Upload: stored, served to staff only while it is a draft.
    const uploaded = await s.call(
      "/api/product-hub/media",
      admin,
      png(640, 640),
      {
        "Content-Type": "image/png",
        "X-Hub-Meta": meta(1),
      },
    );
    assert.equal(uploaded.status, 200);
    const { assetId } = await uploaded.json();
    assert.equal(
      (
        await s.call(
          "/api/product-hub/media",
          admin,
          Buffer.from("<svg onload=alert(1)>".padEnd(64)),
          { "Content-Type": "image/svg+xml", "X-Hub-Meta": meta(2) },
        )
      ).status,
      415,
    );
    const view = await (await s.call("/api/product-hub", admin)).json();
    const src = view.assets.find((a: { id: string }) => a.id === assetId)
      .derivatives[0].src;
    assert.equal(
      (await fetch(s.base + src)).status,
      404,
      "draft image is not public",
    );
    assert.equal((await s.call(src, operator)).status, 404);
    const privateImage = await s.call(src, manager);
    assert.equal(privateImage.status, 200);
    assert.equal(privateImage.headers.get("content-type"), "image/png");
    assert.equal(
      privateImage.headers.get("cache-control"),
      "private, no-store",
    );
    assert.equal(privateImage.headers.get("x-content-type-options"), "nosniff");
    assert.equal(
      (await fetch(s.base + "/brand/hub/../../etc/passwd")).status,
      404,
    );
    assert.equal(
      (await fetch(`${s.base}/brand/hub/${"a".repeat(64)}.png`)).status,
      404,
    );

    // The public checkout still quotes the published price while the draft exists.
    const sku = command.variants[0].skuId;
    const before = (
      await (await fetch(s.base + "/api/checkout/config")).json()
    ).products.find((p: { id: string }) => p.id === sku);
    assert.equal(before.priceFils, command.variants[0].priceFils - 100);

    // Publish as admin; the published price is what checkout quotes next.
    const publish = await s.call("/api/product-hub/commands", admin, {
      type: "publish",
      expectedVersion: view.version,
      expectedPublishedRevision: view.published.id,
    });
    assert.equal(publish.status, 200);
    const after = (
      await (await fetch(s.base + "/api/checkout/config")).json()
    ).products.find((p: { id: string }) => p.id === sku);
    assert.equal(after.priceFils, command.variants[0].priceFils);
  } finally {
    await s.close();
  }
});

test("HTTP flags: disabled by default; publication can be off while editing is on", async () => {
  const off = await server(3173, {});
  try {
    const admin = await off.login("admin");
    const view = await (await off.call("/api/product-hub", admin)).json();
    assert.equal(view.available, false);
    assert.deepEqual(view.permissions, { canEdit: false, canPublish: false });
    assert.equal(
      (
        await off.call("/api/product-hub/commands", admin, {
          type: "discardDraft",
          expectedVersion: 0,
        })
      ).status,
      404,
    );
  } finally {
    await off.close();
  }
  const editOnly = await server(3175, { PRODUCT_HUB_ENABLED: "true" });
  try {
    const admin = await editOnly.login("admin");
    const view = await (await editOnly.call("/api/product-hub", admin)).json();
    assert.deepEqual(view.permissions, { canEdit: true, canPublish: false });
    assert.match(view.flags.publishBlocked, /disabled/);
    assert.equal(
      (
        await editOnly.call("/api/product-hub/commands", admin, {
          type: "publish",
          expectedVersion: 0,
          expectedPublishedRevision: view.published.id,
        })
      ).status,
      403,
    );
  } finally {
    await editOnly.close();
  }
});
