import { test, expect } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
test("TL26 Copilot in canonical WA2 Inbox, handoff, responsive and accessibility", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const inbound = async (text: string) => {
    const raw = JSON.stringify({
      type: "message",
      eventId: randomUUID(),
      sourceNumberId: "wa2",
      phone: "971500008888",
      customer: "AI UAT fixture",
      text,
    });
    const r = await request.post("/api/webhooks/whatsapp", {
      headers: {
        "X-Hub-Signature-256":
          "sha256=" +
          createHmac("sha256", "test-only-secret-at-least-24-characters")
            .update(raw)
            .digest("hex"),
      },
      data: raw,
    });
    expect(r.status()).toBe(200);
  };
  await inbound("Hi, I want to order a tres leches");
  await page.goto("/operations/inbox");
  await page.getByLabel("Buscar conversación").fill("AI UAT fixture");
  await page.getByRole("button", { name: /AI UAT fixture/ }).click();
  await page
    .getByRole("button", { name: "Tomar control humano", exact: true })
    .click();
  await expect(page.locator(".commerce")).toHaveAttribute("aria-busy", "false");
  await page
    .getByRole("button", { name: /Generar sugerencia|Regenerar sugerencia/ })
    .click();
  await expect(page.getByLabel("Sugerencia privada")).toHaveValue(
    /Pastel Tres Leches/,
  );
  await page
    .getByRole("button", { name: "Aprobar y enviar", exact: true })
    .click();
  await expect(page.locator(".commerce")).toHaveAttribute("aria-busy", "false");
  await expect
    .poll(async () => {
      const w = await (await request.get("/api/workspace")).json();
      return w.conversations
        .find((c: { customer: string }) => c.customer === "AI UAT fixture")
        .messages.filter(
          (m: { direction: string; status: string }) =>
            m.direction === "out" && m.status === "sent",
        ).length;
    })
    .toBe(1);
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `work/qa/tl26-inbox-${width}.png`,
      fullPage: true,
    });
  }
  await inbound("I need a custom wedding cake for 120 people.");
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await page.getByRole("button", { name: "Regenerar sugerencia" }).click();
  await expect(
    page.getByText("Consulta personalizada · cotización humana"),
  ).toBeVisible();
  await expect(page.getByText(/120 personas/)).toBeVisible();
  await page.getByRole("button", { name: "Pausar IA", exact: true }).click();
  await expect(page.getByText(/AI_PAUSED/)).toBeVisible();
  expect(errors).toEqual([]);
});
