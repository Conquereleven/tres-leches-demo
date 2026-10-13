/**
 * Products created or renamed in Product Hub: Operations and tickets show the English
 * name approved at publication, an order accepted under an earlier name keeps that
 * name's English, and a definition nobody approved keeps its original text and warns.
 * Mocked API responses only: nothing is written and nothing is printed.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { workspace } from "../fixtures/ux-states";

const tl = JSON.parse(
  readFileSync("src/commerce/locales/tl.json", "utf8"),
) as Record<string, string>;
const tr = (lang: "en" | "tl", key: string) =>
  lang === "en" ? key : (tl[key] ?? key);
const SKU = "tres-leches-canela-small";

for (const language of ["en", "tl"] as const)
  test(`${language}: Product Hub names in orders and Kitchen/Reception tickets`, async ({
    page,
  }) => {
    const data = workspace();
    const [current, earlier, unapproved] = [0, 1, 2].map((i) => {
      const order = structuredClone(data.orders[0]!);
      order.id = `${order.id}-${i}`;
      order.lines = [{ productId: SKU, quantity: 2 }];
      return order;
    });
    current!.catalogSnapshot = [
      { id: SKU, name: "Pastel 3 Leches · Canela · Chico", priceFils: 9900 },
    ];
    earlier!.catalogSnapshot = [
      { id: SKU, name: "Pastel 3 Leches · Canela", priceFils: 9500 },
    ];
    unapproved!.catalogSnapshot = [
      { id: SKU, name: "Pastel 3 Leches · Receta nueva", priceFils: 9900 },
    ];
    data.orders = [current!, earlier!, unapproved!];
    data.payments = data.orders.map((o) => ({
      ...data.payments[0]!,
      orderId: o.id,
    }));
    Object.assign(data, {
      productNames: {
        [SKU]: [
          {
            source: "Pastel 3 Leches · Canela",
            en: "3 Leches Cake · Cinnamon",
          },
          {
            source: "Pastel 3 Leches · Canela · Chico",
            en: "3 Leches Cake · Cinnamon · Small",
          },
        ],
      },
    });
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
    // Product names are shown on each order page; the list searches them.
    expect(data.orders).toHaveLength(3);
    const names: string[] = [];
    for (const o of data.orders) {
      await page.goto(`/operations/orders/${o.id}`);
      await expect(page.locator(".ops-shell")).toHaveAttribute(
        "lang",
        language,
      );
      names.push(await page.locator(".oms-items tbody").innerText());
    }
    const text = names.join("\n");
    await page.goto("/operations/orders");
    expect(text).toContain("3 Leches Cake · Cinnamon · Small");
    expect(text).toContain("3 Leches Cake · Cinnamon");
    expect(text).toContain("Pastel 3 Leches · Receta nueva");
    expect(text).toContain("Product translation requires review");
    // Only the unapproved definition warns.
    expect(text.match(/Product translation requires review/g)).toHaveLength(1);
    // Search finds the product by its approved English name and by the original.
    for (const query of ["Cinnamon · Small", "Canela · Chico"]) {
      await page.getByLabel(tr(language, "Search orders")).fill(query);
      await expect(page.locator(".oms-table tbody tr")).toHaveCount(1);
    }

    await page.goto("/operations/print");
    const ticket = page.locator(".ops-ticket");
    const expectTicket = async (
      orderId: string,
      shown: string,
      hidden: string | null,
      warns: boolean,
    ) => {
      await page
        .getByRole("combobox", { name: tr(language, "Order"), exact: true })
        .selectOption(orderId);
      for (const destination of ["kitchen", "reception"]) {
        await page
          .getByRole("combobox", {
            name: tr(language, "Destination"),
            exact: true,
          })
          .selectOption(destination);
        await expect(ticket).toHaveAttribute("lang", "en");
        await expect(ticket).toContainText(shown);
        if (hidden) await expect(ticket).not.toContainText(hidden);
        const warning = ticket.getByText("Product translation requires review");
        await expect(warning).toHaveCount(warns ? 1 : 0);
      }
    };
    await expectTicket(
      current!.id,
      "3 Leches Cake · Cinnamon · Small",
      "Pastel 3 Leches",
      false,
    );
    // Accepted under the earlier name: that name's English, at that order's own price.
    await expectTicket(
      earlier!.id,
      "3 Leches Cake · Cinnamon",
      "Cinnamon · Small",
      false,
    );
    await expectTicket(
      unapproved!.id,
      "Pastel 3 Leches · Receta nueva",
      "Cinnamon",
      true,
    );
    await expect(
      page.getByRole("button", { name: /^(Print|Reprint)$/ }),
    ).toHaveCount(0);
    expect(mutations).toEqual([]);
    expect(errors).toEqual([]);
    expect(JSON.stringify(data)).toBe(original);
  });
