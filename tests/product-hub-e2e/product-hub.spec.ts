import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

const shots = "work/qa/product-hub";
mkdirSync(shots, { recursive: true });
const SKU = "pan-de-muerto-traditional-azucar-individual-70-g";
const serverPrice = async (page: Page) =>
  (
    (await (await page.request.get("/api/checkout/config")).json()) as {
      products: { id: string; priceFils: number }[];
    }
  ).products.find((p) => p.id === SKU)!.priceFils;
const open = async (page: Page) => {
  await page.goto("/operations/products");
  await expect(page.locator(".ph-overview")).toBeVisible();
};
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
/** A structurally valid PNG; enough for the upload contract. */
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

test("desktop: edit a price, save the draft, reload, compare and publish", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await expect(page.locator(".ph-metrics")).toContainText("236");
  await page.screenshot({
    path: `${shots}/${info.project.name}-overview-1440.png`,
  });

  // Search and filters narrow the list.
  await page.getByLabel("Search").fill("azucar");
  await expect(page.locator(".ph-row").first()).toContainText("Azúcar");
  const narrowed = await page.locator(".ph-row").count();
  expect(narrowed).toBeGreaterThan(0);
  expect(narrowed).toBeLessThan(20);
  await page.getByLabel("Search").fill("");
  await page.getByLabel("Category").selectOption({ label: "Conchas" });
  await expect(page.locator(".ph-row").first()).toContainText("Concha");
  await page.getByLabel("Category").selectOption("");

  const before = await serverPrice(page);
  const next = before + 100;
  await page.getByLabel("Search").fill("pan-de-muerto-traditional--azucar");
  await page.locator(".ph-row").first().click();
  await expect(
    page.getByRole("heading", { name: /Azúcar Pan de Muerto/ }),
  ).toBeVisible();
  const variant = page
    .locator(".ph-variants li")
    .filter({ has: page.locator(`input[value="${SKU}"]`) });
  await expect(variant.getByLabel("SKU")).toBeDisabled();
  // A price that is not money is refused before anything is sent.
  await variant.getByLabel("Price (AED)").fill("12,5");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert").first()).toContainText(
    "Price must be a positive amount",
  );
  await variant.getByLabel("Price (AED)").fill((next / 100).toFixed(2));
  // Customer content in three languages; Arabic is edited right-to-left.
  await page.getByRole("tab", { name: "Español" }).click();
  await page
    .getByLabel("Description shown to customers")
    .fill("Pan dulce tradicional con azúcar.");
  await page.getByRole("tab", { name: "العربية" }).click();
  await expect(page.locator('.ph-form[lang="ar"]')).toHaveAttribute(
    "dir",
    "rtl",
  );
  await page
    .getByLabel("Description shown to customers")
    .fill("خبز حلو تقليدي بالسكر.");
  await expect(page.locator(".ph-card")).toContainText(
    "خبز حلو تقليدي بالسكر.",
  );
  await page.screenshot({
    path: `${shots}/${info.project.name}-editor-1440.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();
  await expect(page.locator(".ph-status")).toContainText("unpublished changes");
  // Checkout still charges the published price.
  expect(await serverPrice(page)).toBe(before);

  // The draft survives a reload.
  await page.reload();
  await expect(page.locator(".ph-status")).toContainText("unpublished changes");
  await page.getByLabel("Draft changes only").check();
  await expect(page.locator(".ph-row")).toHaveCount(1);
  await expect(page.locator(".ph-row").first()).toContainText("Edited");

  // Review: before and after, then an explicit confirmation.
  await page.getByRole("button", { name: /Review & publish/ }).click();
  const priceRow = page.locator(".ph-diff-price");
  await expect(priceRow).toContainText(`AED ${(before / 100).toFixed(2)}`);
  await expect(priceRow).toContainText(`AED ${(next / 100).toFixed(2)}`);
  const publish = page.getByRole("button", { name: "Publish catalog" });
  await expect(publish).toBeDisabled();
  await page.screenshot({
    path: `${shots}/${info.project.name}-review-1440.png`,
    fullPage: true,
  });
  await page.getByLabel(/I reviewed every change/).check();
  await publish.click();
  await expect(page.getByText("Catalog published")).toBeVisible();
  await expect(page.locator(".ph-status")).toContainText(
    "No unpublished changes",
  );
  expect(await serverPrice(page)).toBe(next);
  await page.getByRole("button", { name: "Activity" }).click();
  await expect(page.locator(".ph-history li").first()).toContainText(
    "Published",
  );
  await page.screenshot({
    path: `${shots}/${info.project.name}-activity-1440.png`,
  });
  expect(errors).toEqual([]);
});

test("desktop: create a product with a new SKU and an uploaded image, then discard the draft", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  const id = `e2e-${info.project.name}-canela`;
  await page.getByRole("button", { name: "New product" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.locator(".ph-issue-error").first()).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Canela Pan de Muerto");
  await page.getByLabel("Product ID").fill(id);
  await page.getByLabel("Slug").fill(id);
  // A dropdown's label text includes its options, so match these by structure.
  const dropdown = (label: string) =>
    page
      .locator(".ph-editor label")
      .filter({ hasText: new RegExp(`^${label}`) })
      .locator("select");
  await dropdown("Category").selectOption({ label: "Pan de Muerto" });
  await dropdown("Family").selectOption("pan-de-muerto-traditional");
  const variant = page.locator(".ph-variants li").first();
  await variant.getByLabel("SKU").fill(`${id}-mini`);
  await variant
    .getByLabel("Catalog name")
    .fill("Pan de Muerto · Canela · Mini");
  await variant.getByLabel("Flavour").fill("Canela");
  await variant.getByLabel("Size").fill("Mini · 40 g");
  await variant.getByLabel("Price (AED)").fill("13");
  // A file that is not an image is refused by the server.
  await page.getByLabel("Upload a new image").setInputFiles({
    name: "not-an-image.png",
    mimeType: "image/png",
    buffer: Buffer.from("<svg onload=alert(1)>".padEnd(80)),
  });
  await expect(page.getByRole("alert").first()).toContainText(
    "PNG, JPEG, WebP or AVIF",
  );
  await page.getByLabel("Upload a new image").setInputFiles({
    name: "canela.png",
    mimeType: "image/png",
    buffer: png(640, 640),
  });
  await expect(page.locator(".ph-media li")).toHaveCount(1);
  await expect(page.locator(".ph-media li")).toContainText("Primary image");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();
  await page.getByLabel("Search").fill(id);
  const row = page.locator(".ph-row").first();
  await expect(row).toContainText("Canela Pan de Muerto");
  await expect(row).toContainText("Unpublished");
  await expect(row).toContainText("New");
  // Not purchasable: the public catalog knows nothing about it.
  const config = await (await page.request.get("/api/checkout/config")).json();
  expect(
    config.products.some((p: { id: string }) => p.id === `${id}-mini`),
  ).toBe(false);
  await page.getByRole("button", { name: /Review & publish/ }).click();
  await expect(page.locator(".ph-diff")).toContainText(id);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Discard draft" }).click();
  await expect(page.getByText("Draft discarded")).toBeVisible();
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await page.getByLabel("Search").fill(id);
  await expect(page.locator(".ph-row")).toHaveCount(0);
});

for (const width of [390, 768])
  test(`responsive ${width}px: overview and editor fit, are usable and accessible`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
    await open(page);
    expect(await noOverflow(page)).toBe(true);
    await page.screenshot({
      path: `${shots}/${info.project.name}-overview-${width}.png`,
    });
    const overview = await new AxeBuilder({ page })
      .include(".ph")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(overview.violations.map((v) => v.id)).toEqual([]);
    await page.locator(".ph-row").first().click();
    await expect(page.locator(".ph-editor")).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
    await expect(
      page.getByRole("button", { name: "Save draft" }),
    ).toBeVisible();
    const editor = await new AxeBuilder({ page })
      .include(".ph")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(editor.violations.map((v) => v.id)).toEqual([]);
    await page.screenshot({
      path: `${shots}/${info.project.name}-editor-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: /Back to catalog/ }).click();
    await expect(page.locator(".ph-overview")).toBeVisible();
  });
