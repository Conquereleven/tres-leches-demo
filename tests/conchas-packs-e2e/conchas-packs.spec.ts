import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import {
  CONCHAS_PACK_SPECS,
  componentName,
} from "../../shared/pack-composition";
import { packCopy } from "../../shared/pack-copy";
const origin = "http://127.0.0.1:3274",
  shots = "work/qa/conchas-packs";
mkdirSync(shots, { recursive: true });
const change = async (page: Page, id: string, n: number, language: string) =>
  page
    .locator(".b-pack-builder")
    .getByRole("spinbutton", { name: componentName(id, language), exact: true })
    .fill(String(n));
const capture = async (page: Page, name: string) => {
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};
for (const width of [390, 768, 1440])
  for (const language of ["en", "es", "ar"])
    for (const family of ["traditional", "filled"])
      test(`${family} ${language} ${width}: all four formats, custom mixes, separate boxes, edit, refresh and fixed checkout`, async ({
        page,
        request,
      }, info) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(
          `/menu?product=conchas-${family}-pack&lang=${language}`,
        );
        const specs = CONCHAS_PACK_SPECS.filter((s) => s.family === family);
        for (const spec of specs) {
          await page
            .locator(".b-menu-selectors select")
            .selectOption(`${spec.capacity} ${spec.size}`);
          await expect(page.locator(".b-pack-builder")).toContainText(
            `0 / ${spec.capacity}`,
          );
          await expect(page.locator(".b-add-to-cart > button")).toBeDisabled();
          for (const [i, c] of spec.components.entries())
            await change(
              page,
              c.componentSkuId,
              i === 0 ? spec.capacity - spec.components.length + 1 : 1,
              language,
            );
          await expect(page.locator(".b-pack-builder")).toContainText(
            `${spec.capacity} / ${spec.capacity}`,
          );
          await expect(page.locator(".b-add-to-cart > button")).toBeEnabled();
        }
        const spec = specs.at(-1)!;
        expect(
          (await new AxeBuilder({ page }).include(".b-pack-builder").analyze())
            .violations,
        ).toEqual([]);
        await capture(
          page,
          `${info.project.name}-${width}-${language}-${family}-product`,
        );
        await page.locator(".b-add-to-cart > button").click();
        // Change only preparation, keeping the same priced SKU, and add another box.
        for (const c of spec.components)
          await change(page, c.componentSkuId, 0, language);
        await change(
          page,
          spec.components[1]!.componentSkuId,
          spec.capacity,
          language,
        );
        await page.locator(".b-add-to-cart > button").click();
        await page.goto(`/cart?lang=${language}`);
        await expect(page.locator(".b-co-item")).toHaveCount(2);
        await page.reload();
        await expect(page.locator(".b-pack-composition")).toHaveCount(2);
        const first = page.locator(".b-pack-edit").first();
        await first.locator("summary").click();
        for (const c of spec.components)
          await change(page, c.componentSkuId, 0, language);
        await change(
          page,
          spec.components[2]!.componentSkuId,
          spec.capacity,
          language,
        );
        await first
          .getByRole("button", { name: packCopy(language).save, exact: true })
          .click();
        await expect(page.locator(".b-co-item")).toHaveCount(2);
        await capture(
          page,
          `${info.project.name}-${width}-${language}-${family}-cart`,
        );
        const lines = await page.evaluate(() =>
          JSON.parse(localStorage.getItem("3l-cart")!),
        );
        const config = await (await request.get("/api/checkout/config")).json();
        const priced = config.products.find(
          (p: { id: string }) => p.id === spec.packSkuId,
        );
        const quote = await request.post("/api/checkout/quote", {
          headers: { Origin: origin },
          data: { lines, fulfillmentMethod: "pickup" },
        });
        expect(quote.status(), await quote.text()).toBe(200);
        expect((await quote.json()).totalFils).toBe(priced.priceFils * 2);
        await page.goto(`/checkout?lang=${language}`);
        await expect(
          page.locator(".b-co-summary-items .b-pack-composition"),
        ).toHaveCount(2);
        await capture(
          page,
          `${info.project.name}-${width}-${language}-${family}-checkout`,
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(errors).toEqual([]);
      });

test("Conchas fake paid checkout freezes exact preparation in order, kitchen and ticket; Product Hub has sixteen existing format controls", async ({
  page,
  request,
}, info) => {
  const spec = CONCHAS_PACK_SPECS.find(
    (s) =>
      s.family === "filled" && s.capacity === 12 && s.size === "individuales",
  )!;
  const config = await (await request.get("/api/checkout/config")).json();
  const headers = { Origin: origin, "Idempotency-Key": crypto.randomUUID() };
  const body = {
    lines: [
      {
        productId: spec.packSkuId,
        quantity: 2,
        composition: [
          { componentSkuId: spec.components[0]!.componentSkuId, units: 4 },
          { componentSkuId: spec.components[4]!.componentSkuId, units: 8 },
        ],
      },
    ],
    fulfillmentMethod: "pickup",
    pickup: {
      pickupDate: config.dates.min,
      preferredTime: "4:00 PM – 9:00 PM",
    },
    customer: {
      firstName: "Conchas",
      lastName: "UAT",
      phone: "0500000000",
      email: "uat@example.invalid",
    },
    billing: {
      sameAsDelivery: false,
      name: "Conchas UAT",
      address1: "Fixture street",
      city: "Dubai",
      country: "AE",
    },
  };
  const r = await request.post("/api/checkout/web", { headers, data: body });
  expect(r.status(), await r.text()).toBe(200);
  const checkout = await r.json();
  expect(checkout.amountFils).toBe(47000);
  const repeat = await request.post("/api/checkout/web", {
    headers,
    data: body,
  });
  expect((await repeat.json()).orderId).toBe(checkout.orderId);
  await request.post("/__fixture/paid");
  const paid = await request.post("/api/checkout/reconcile", {
    headers,
    data: { key: headers["Idempotency-Key"] },
  });
  expect((await paid.json()).paymentStatus).toBe("paid");
  const login = await request.post("/api/login", {
    headers,
    data: { id: "admin", password: "pack-fixture-password" },
  });
  expect(login.status()).toBe(200);
  expect(login.headers()["set-cookie"]).toContain("; HttpOnly; Secure;");
  const token = login
    .headers()
    ["set-cookie"].split(";")[0]!
    .slice("tl_session=".length);
  await page
    .context()
    .addCookies([
      {
        name: "tl_session",
        value: token,
        url: origin,
        httpOnly: true,
        secure: false,
        sameSite: "Strict",
      },
    ]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/operations/orders/${checkout.orderId}`);
  await expect(page.getByText(/Pistachio × 8/).first()).toBeVisible();
  await capture(page, `${info.project.name}-order`);
  await page.goto("/operations/production");
  await expect(
    page.getByText(/Diplomat cream \(vanilla\) × 4/).first(),
  ).toBeVisible();
  await capture(page, `${info.project.name}-kitchen`);
  await page.goto("/operations/print");
  await page
    .getByRole("combobox", { name: "Order", exact: true })
    .selectOption(checkout.orderId);
  await expect(page.getByText(/Pistachio × 8/).first()).toBeVisible();
  await capture(page, `${info.project.name}-ticket`);
  await page.goto("/operations/products");
  await page.getByText("Pack flavor eligibility", { exact: true }).click();
  const editor = page
    .locator("details")
    .filter({
      has: page.getByText("Pack flavor eligibility", { exact: true }),
    });
  await expect(editor.locator("fieldset")).toHaveCount(16);
  await expect(editor).toContainText("Traditional Conchas");
  await expect(editor).toContainText("Filled Conchas");
  await expect(editor).toContainText("Traditional Pan de Muerto");
  await capture(page, `${info.project.name}-hub`);
});

test("Pan on and Conchas off: existing Conchas remains purchasable without builder; activation requires explicit complete selection", async ({
  page,
  request,
}) => {
  try {
    await request.post("/__fixture/conchas-mode", {
      headers: { "X-Fixture-Enabled": "false" },
    });
    const config = await (await request.get("/api/checkout/config")).json();
    expect(config.personalizedPacks.enabled).toBe(true);
    expect(config.personalizedPacks.conchasEnabled).toBe(false);
    expect(config.personalizedPacks.rules).toHaveLength(8);
    await page.goto("/menu?product=conchas-traditional-pack&lang=en");
    await expect(page.locator(".b-add-to-cart > button")).toBeEnabled();
    await expect(page.locator(".b-pack-builder")).toHaveCount(0);
    const legacy = await request.post("/api/checkout/quote", {
      headers: { Origin: origin },
      data: {
        fulfillmentMethod: "pickup",
        lines: [{ productId: "conchas-traditional-pack-6-mini", quantity: 1 }],
      },
    });
    expect(legacy.status()).toBe(200);
    expect((await legacy.json()).totalFils).toBe(6000);
    await page.goto("/menu?product=pan-de-muerto-filled-pack&lang=en");
    await expect(page.locator(".b-pack-builder")).toBeVisible();
  } finally {
    await request.post("/__fixture/conchas-mode", {
      headers: { "X-Fixture-Enabled": "true" },
    });
  }
  await page.goto("/menu?product=conchas-traditional-pack&lang=en");
  await expect(page.locator(".b-pack-builder")).toBeVisible();
  await expect(page.locator(".b-add-to-cart > button")).toBeDisabled();
});
