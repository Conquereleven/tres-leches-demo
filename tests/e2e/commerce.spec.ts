import { test, expect } from "@playwright/test";
test("WA2 operational golden path, responsive and console", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") errors.push(m.text());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Gestión", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Todo empieza con una conversación." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Zonas y tarifas", exact: true })
    .click();
  await page.getByLabel("Tarifa AED", { exact: true }).fill("10");
  await page
    .getByRole("button", { name: "Guardar regla", exact: true })
    .click();
  await expect(page.locator(".commerce")).toHaveAttribute("aria-busy", "false");
  await page
    .getByRole("button", { name: "Inbox unificado", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Tomar conversación", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Liberar conversación", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Crear pedido", exact: true }).click();
  await expect(page.getByTestId("order-panel")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Producto", exact: true })
    .selectOption("tres");
  await page
    .getByRole("button", { name: "Guardar producto", exact: true })
    .click();
  await expect(page.locator(".co-state")).toHaveText("Awaiting Location");
  await page
    .getByRole("button", { name: "Simular GPS entrante · JVC", exact: true })
    .click();
  await expect(page.locator(".co-state")).toHaveText("Minimum Check");
  await expect(page.locator(".co-quote")).toContainText("AED 130.00");
  await page
    .getByRole("button", { name: "Request Payment", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pago · pending" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".co-message.out")).toContainText(
    "Complete your payment here",
  );
  await expect(page.locator(".co-message.out")).toContainText("WA2");
  await page.getByText("Simular resultado de pago", { exact: true }).click();
  await page.getByRole("button", { name: "Simular paid", exact: true }).click();
  await expect(page.locator(".co-state")).toHaveText("Confirmed");
  for (const state of [
    "Production",
    "Ready",
    "Out for Delivery",
    "Delivered",
  ]) {
    await page
      .getByRole("button", { name: `Avanzar a ${state}`, exact: true })
      .click();
    await expect(page.locator(".co-state")).toHaveText(state);
  }
  await page.getByRole("button", { name: "Entregas", exact: true }).click();
  await expect(page.locator(".co-state")).toHaveText("Delivered");
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: `work/qa/delivery-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "Inbox unificado", exact: true })
    .click();
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: `work/qa/inbox-${width}.png`,
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});
test("original storefront checkout, capacity and legacy conversation remain usable", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "MVP demo", exact: true }).click();
  await page.getByRole("button", { name: "Pedir ahora", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirmar pedido", exact: true })
    .click();
  await expect(page.getByText("¡Gracias, Valentina!")).toBeVisible();
  await page
    .getByRole("button", { name: "Volver a la tienda", exact: true })
    .click();
  await page.getByRole("button", { name: "Gestión", exact: true }).click();
  await page
    .getByRole("button", { name: "Pedidos", exact: true })
    .first()
    .click();
  await expect(page.getByText("#TL-1049", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Ver detalle", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Abrir conversación", exact: true })
    .click();
  await expect(
    page.getByText("Valentina García", { exact: true }).first(),
  ).toBeVisible();
});

test("recoverable send keeps draft, filters and out-of-coverage block payment", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Gestión", exact: true }).click();
  await page.getByRole("button", { name: /Ana Torres WA1/ }).click();
  await page
    .getByRole("button", { name: "Tomar conversación", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Mensaje", exact: true })
    .fill("Demo recoverable reply");
  await page.route(
    "**/api/commands",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Conexión interrumpida. Intenta nuevamente.",
        }),
      }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Conexión interrumpida");
  await expect(
    page.getByRole("textbox", { name: "Mensaje", exact: true }),
  ).toHaveValue("Demo recoverable reply");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Mensaje", exact: true }),
  ).toHaveValue("");
  await expect(page.locator(".co-message.out")).toContainText(
    "Demo recoverable reply",
  );
  await expect(page.locator(".co-message.out")).toContainText("sent");
  await expect(page.locator(".commerce")).toHaveAttribute("aria-busy", "false");
  await page.getByRole("button", { name: "Crear pedido", exact: true }).click();
  await expect(page.getByTestId("order-panel")).toBeVisible();
  await page
    .getByRole("button", { name: "Guardar producto", exact: true })
    .click();
  await page.getByLabel("Dirección / zona manual").fill("Al Ain");
  await page
    .getByRole("button", { name: "Resolver dirección", exact: true })
    .click();
  await expect(page.locator(".co-quote")).toContainText("Fuera de cobertura");
  await expect(
    page.getByRole("button", { name: "Request Payment", exact: true }),
  ).toBeDisabled();
  await page.getByText("Revisar y seleccionar zona", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Zona confirmada", exact: true })
    .selectOption("jvc");
  await page
    .getByLabel("Motivo de la selección", { exact: true })
    .fill("Synthetic UAT: confirmed with fixture customer");
  await page
    .getByRole("button", { name: "Confirmar zona manual", exact: true })
    .click();
  await expect(page.locator(".co-quote")).toContainText("No cumple el mínimo");
  await expect(
    page.getByRole("button", { name: "Request Payment", exact: true }),
  ).toBeDisabled();
  await expect(page.getByTestId("order-panel")).toContainText(
    "Zona manual jvc",
  );
  await page.getByLabel("Buscar conversación").fill("No existe");
  await expect(
    page.getByText("Sin conversaciones para estos filtros."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Zonas y tarifas", exact: true })
    .click();
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: `work/qa/zones-${width}.png`,
      fullPage: true,
    });
  }
});
