import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const out = process.env.PRINT_EVIDENCE_DIR;
if (!out)
  throw new Error(
    "PRINT_EVIDENCE_DIR required for synthetic download evidence",
  );
async function download(page: Page, label: string, name: string) {
  const exportMenu = page.locator(".oms-export-trigger");
  if (await exportMenu.isVisible()) await exportMenu.click();
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: label, exact: true }).click();
  const d = await waiting;
  expect(await d.failure()).toBeNull();
  const path = join(out!, name);
  await d.saveAs(path);
  const bytes = readFileSync(path);
  expect(bytes.length).toBeGreaterThan(100);
  return bytes;
}
test("real authenticated downloads: single, >25 matching, all variants, CSV, ZIP and role guard", async ({
  page,
}, info) => {
  mkdirSync(out!, { recursive: true });
  const login = await page.request.post("/api/login", {
    headers: { Origin: "http://127.0.0.1:5174" },
    data: { id: "fixture-admin", password: "fictional-password" },
  });
  expect(login.status()).toBe(200);
  await page.goto("/operations/orders");
  await expect(page.locator(".oms-table tbody tr")).toHaveCount(25);
  await page
    .getByRole("button", { name: /^Select all \d+ matching orders$/ })
    .click();
  const selected = await page.locator(".oms-bulk strong").innerText();
  const count = Number(selected.match(/\d+/)![0]);
  expect(count).toBeGreaterThan(25);
  const prefix = info.project.name;
  const csv = await download(page, "Export orders CSV", `${prefix}-bulk.csv`);
  expect(csv.toString().trim().split("\r\n").length).toBe(count + 1);
  const pdf = await download(
    page,
    "Packing slips (PDF)",
    `${prefix}-bulk-p1.pdf`,
  );
  expect(
    (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length,
  ).toBeGreaterThanOrEqual(count);
  await download(
    page,
    "Production & packing · Event / bulk (PDF)",
    `${prefix}-bulk-p2.pdf`,
  );
  await download(
    page,
    "Delivery note · A5 candidate (PDF)",
    `${prefix}-bulk-a5.pdf`,
  );
  await download(
    page,
    "Delivery notes · A4 two-up candidate (PDF)",
    `${prefix}-bulk-two-up.pdf`,
  );
  for (const [label, filename] of [
    ["Delivery notes (PDF)", "delivery-a4.pdf"],
    ["Packing slips (ZIP)", "packing.zip"],
    ["Production & packing · Event / bulk (ZIP)", "production.zip"],
    ["Delivery note · A5 candidate (ZIP)", "delivery-a5.zip"],
    ["Delivery notes · A4 two-up candidate (ZIP)", "delivery-two-up.zip"],
  ]) {
    const bytes = await download(page, label!, `${prefix}-bulk-${filename}`);
    expect(bytes.subarray(0, filename!.endsWith(".zip") ? 2 : 4).toString()).toBe(
      filename!.endsWith(".zip") ? "PK" : "%PDF",
    );
  }
  const zip = await download(
    page,
    "Delivery notes (ZIP)",
    `${prefix}-bulk.zip`,
  );
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(zip.readUInt16LE(end + 10)).toBe(count);
  await page.locator(".oms-export-trigger").click();
  await page.screenshot({
    path: join(out!, `${prefix}-selection.png`),
    fullPage: true,
  });
  await page.goto("/operations/orders/TL-DEMO-P1");
  await download(page, "Packing slip (PDF)", `${prefix}-single-p1.pdf`);
  await download(
    page,
    "Production & packing · Event / bulk (PDF)",
    `${prefix}-single-p2.pdf`,
  );
  await download(
    page,
    "Delivery note · A5 candidate (PDF)",
    `${prefix}-single-a5.pdf`,
  );
  await download(
    page,
    "Delivery notes · A4 two-up candidate (PDF)",
    `${prefix}-single-two-up.pdf`,
  );
  await page.screenshot({
    path: join(out!, `${prefix}-single.png`),
    fullPage: true,
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const role of ["operator", "agent"]) {
    await page.request.post("/api/logout", {
      headers: { Origin: "http://127.0.0.1:5174" },
    });
    expect(
      (
        await page.request.post("/api/login", {
          headers: { Origin: "http://127.0.0.1:5174" },
          data: { id: `fixture-${role}`, password: "fictional-password" },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/operations/orders");
    await expect(
      page.getByRole("button", { name: "Packing slips (PDF)", exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await page.request.get(
          "/api/orders/TL-DEMO-P1/document?kind=packing-slip",
        )
      ).status(),
    ).toBe(403);
  }
  expect(errors).toEqual([]);
});
