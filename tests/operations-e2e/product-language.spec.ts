import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { workspace } from "../fixtures/ux-states";
const catalog = JSON.parse(
  readFileSync("data-imports/liza-current-menu.json", "utf8"),
) as { items: { id: string; name: string }[] };
const en = JSON.parse(
  readFileSync("src/commerce/locales/en.json", "utf8"),
) as Record<string, string>;
const tl = JSON.parse(
  readFileSync("src/commerce/locales/tl.json", "utf8"),
) as Record<string, string>;
const tr = (lang: "en" | "tl", key: string) =>
  (lang === "en" ? en : tl)[key as keyof typeof en] ?? key;
const item = catalog.items.find(
  (p) => p.name.includes("Crema diplomática") && p.name.includes("Mini"),
)!;
for (const language of ["en", "tl"] as const) {
  test(`${language}: English products, original search and English Kitchen/Reception tickets`, async ({
    page,
  }, info) => {
    test.setTimeout(60_000);
    const data = workspace();
    data.orders = [data.orders[0]!];
    const order = data.orders[0]!;
    Object.assign(order.quote!, { subtotalFils: 3600, totalFils: 3600 });
    data.payments = [{ ...data.payments[0]!, amountFils: 3600 }];
    order.lines = [{ productId: item.id, quantity: 2 }];
    order.catalogSnapshot = [{ id: item.id, name: item.name, priceFils: 1800 }];
    Object.assign(order, {
      customerDetails: { instructions: "Sin nueces, por favor" },
      fulfillmentMethod: "delivery",
    });
    data.catalog = [
      {
        ...data.catalog[0]!,
        id: item.id,
        name: "Changed current recipe",
        priceFils: 99900,
      },
    ];
    const original = JSON.stringify(data);
    const mutations: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", async (route) => {
      if (route.request().method() !== "GET")
        mutations.push(route.request().url());
      await route.fulfill({ json: data });
    });
    await page.addInitScript(
      ({ id, language }) =>
        localStorage.setItem(
          `3l-operations-language:${encodeURIComponent(id)}`,
          language,
        ),
      { id: data.actor.id, language },
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/operations/orders");
    const english = "Filled Pan de Muerto · Vanilla diplomat cream · Mini";
    await expect(page.locator(".ops-shell")).toHaveAttribute("lang", language);
    for (const query of [
      "Crema diplomática",
      "Vanilla diplomat cream",
      item.id,
    ]) {
      await page.getByLabel(tr(language, "Search orders")).fill(query);
      await expect(page.locator(".oms-table tbody tr")).toHaveCount(1);
    }
    await page.getByLabel(tr(language, "Search orders")).fill("");
    // The order page names the product in English from the order's own snapshot.
    await page.locator(".oms-table tbody tr").first().click();
    const items = page.locator(".oms-items");
    await expect(items).toContainText(english);
    await expect(items).not.toContainText("Crema diplomática");
    await expect(items).toContainText("36");
    await expect(items).not.toContainText("Changed current recipe");
    const dir = "docs/operations/english-products/screenshots";
    mkdirSync(dir, { recursive: true });
    if (info.project.name === "chromium")
      await page.screenshot({
        path: `${dir}/after-${language}-orders.png`,
        fullPage: true,
      });
    await page.goto("/operations/print");
    await page
      .getByRole("combobox", { name: tr(language, "Order"), exact: true })
      .selectOption(order.id);
    for (const destination of ["kitchen", "reception"]) {
      await page
        .getByRole("combobox", {
          name: tr(language, "Destination"),
          exact: true,
        })
        .selectOption(destination);
      const ticket = page.locator(".ops-ticket");
      await expect(ticket).toHaveAttribute("lang", "en");
      await expect(ticket).toContainText(
        destination === "kitchen" ? "Kitchen ticket" : "Reception ticket",
      );
      await expect(ticket).toContainText("Delivery");
      await expect(ticket).toContainText(english);
      await expect(ticket).toContainText(
        "Original customer notes: Sin nueces, por favor",
      );
      await expect(ticket).not.toContainText("Changed current recipe");
      if (info.project.name === "chromium")
        await page.screenshot({
          path: `${dir}/after-${language}-${destination}.png`,
          fullPage: true,
        });
    }
    await expect(
      page.getByRole("button", { name: /^(Print|Reprint)$/ }),
    ).toHaveCount(0);
    expect(mutations).toEqual([]);
    expect(errors).toEqual([]);
    expect(JSON.stringify(data)).toBe(original);
  });
  test(`${language}: unknown translation retains original and warns in ticket`, async ({
    page,
  }) => {
    const data = workspace();
    data.orders[0]!.catalogSnapshot[0]!.name = "Receta histórica especial";
    await page.route("**/api/**", (r) => r.fulfill({ json: data }));
    await page.addInitScript(
      ({ id, language }) =>
        localStorage.setItem(
          `3l-operations-language:${encodeURIComponent(id)}`,
          language,
        ),
      { id: data.actor.id, language },
    );
    await page.goto("/operations/print");
    await page
      .getByRole("combobox", { name: tr(language, "Order"), exact: true })
      .selectOption(data.orders[0]!.id);
    await expect(page.locator(".ops-ticket")).toContainText(
      "Receta histórica especial",
    );
    await expect(page.locator(".ops-ticket")).toContainText(
      "Product translation requires review",
    );
  });
}

for (const language of ["en", "tl"] as const) {
  test(`${language}: production delivery inbox and draft product selector use English`, async ({
    page,
  }) => {
    const data = workspace();
    data.orders = [data.orders[0]!];
    const order = data.orders[0]!;
    order.state = "Ready";
    data.conversations[0]!.sourceNumberId = "wa1";
    Object.assign(order.quote!, { subtotalFils: 3600, totalFils: 3600 });
    data.payments = [{ ...data.payments[0]!, amountFils: 3600 }];
    order.lines = [{ productId: item.id, quantity: 2 }];
    order.catalogSnapshot = [{ id: item.id, name: item.name, priceFils: 1800 }];
    data.catalog = [{ id: item.id, name: item.name, priceFils: 1800 }];
    Object.assign(data, {
      ai: {
        configured: false,
        enabled: false,
        defaultMode: "copilot",
        autonomousAllowed: false,
        sessions: {},
        enquiries: [],
        runs: [
          {
            id: "local-preview",
            conversationId: order.conversationId,
            status: "suggested",
            approvedActions: 0,
            tools: [],
            actions: [
              {
                name: "add_order_item",
                arguments: JSON.stringify({ productId: item.id, quantity: 2 }),
              },
            ],
          },
        ],
      },
    });
    await page.route("**/api/**", async (r) => {
      expect(r.request().method()).toBe("GET");
      await r.fulfill({ json: data });
    });
    await page.addInitScript(
      ({ id, language }) =>
        localStorage.setItem(
          `3l-operations-language:${encodeURIComponent(id)}`,
          language,
        ),
      { id: data.actor.id, language },
    );
    for (const route of ["production", "delivery"]) {
      await page.goto(`/operations/${route}`);
      await expect(page.locator(".ops-oc-lines")).toContainText(
        "Vanilla diplomat cream",
      );
    }
    await page.goto("/operations/inbox");
    await page.getByRole("button", { name: /Layla Fixture/ }).click();
    await expect(page.locator(".co-lines")).toContainText(
      "Vanilla diplomat cream",
    );
    await expect(page.locator(".co-ai-action")).toContainText(
      "Vanilla diplomat cream",
    );
    order.state = "Building";
    // A legacy link opens the order page, where a draft keeps its builder.
    await page.goto(`/operations/orders?order=${order.id}`);
    const option = page
      .getByRole("combobox", { name: tr(language, "Producto"), exact: true })
      .locator("option");
    await expect(option).toHaveText(
      "Filled Pan de Muerto · Vanilla diplomat cream · Mini · AED 18.00",
    );
    await expect(option).toHaveAttribute("value", item.id);
  });
}
