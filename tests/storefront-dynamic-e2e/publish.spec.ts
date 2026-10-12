/**
 * An administrator changes a product in Product Hub and publishes. The storefront,
 * served by the same build with no restart, shows the published name, variants,
 * photograph, availability and price; checkout charges the published price.
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";

const shots = "work/qa/storefront-dynamic";
mkdirSync(shots, { recursive: true });
type Catalog = {
  revision: string;
  products: {
    id: string;
    slug: string;
    categoryId: string;
    content: Record<"en" | "es" | "ar", { name: string | null }>;
    options: { id: string; size: string; priceFils: number }[];
  }[];
};
const catalog = async (page: Page) =>
  (await (await page.request.get("/api/storefront/catalog")).json()) as Catalog;
const checkoutPrice = async (page: Page, sku: string) =>
  (
    (await (await page.request.get("/api/checkout/config")).json()) as {
      products: { id: string; priceFils: number }[];
    }
  ).products.find((p) => p.id === sku)?.priceFils;
const aed = (fils: number) =>
  `AED ${Number.isInteger(fils / 100) ? fils / 100 : (fils / 100).toFixed(2)}`;
/** A real, decodable PNG (correct checksums and pixel rows) in a flat colour. */
function png(width: number, height: number) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + width * 3, 0xd8);
  row[0] = 0;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(Array(height).fill(row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
/** What a returning tab does: revalidate when it becomes active again. */
const revisit = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new Event("focus")));

test("publishing in Product Hub updates the open storefront, a fresh visit, the cart and checkout", async ({
  context,
}, info) => {
  const shop = await context.newPage();
  const hub = await context.newPage();
  await shop.setViewportSize({ width: 1280, height: 900 });
  await hub.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  shop.on("pageerror", (e) => errors.push(e.message));

  // Each browser engine edits its own cake so the runs do not depend on each other.
  const before = await catalog(shop);
  const cakes = before.products.filter(
    (p) => p.categoryId === "cakes" && p.options.length >= 2,
  );
  const target = cakes[info.project.name === "webkit" ? 1 : 0]!;
  const [first, second] = target.options;
  const name = `Celebration ${info.project.name}`;
  const nameEs = `Celebración ${info.project.name}`;
  const price = first!.priceFils + 700;

  // The storefront shows the published catalog, not the build's.
  await shop.goto("/menu?category=cakes");
  await expect(shop.locator("html")).toHaveAttribute("data-catalog", "dynamic");
  await expect(shop.locator("#bakery")).toHaveAttribute(
    "data-catalog-status",
    "live",
  );
  const card = shop.locator(`[data-product-id="${target.id}"]`);
  await expect(card.locator("h4")).toHaveText(target.content.en.name);
  const select = card.locator("select");
  await select.selectOption(first!.size);
  await expect(card.locator(".b-menu-price")).toHaveText(aed(first!.priceFils));
  // A cart that exists before the publication.
  await card.getByRole("button", { name: /ADD TO CART/ }).click();
  await expect(card.getByRole("link", { name: /in your cart/ })).toBeVisible();
  await shop.screenshot({
    path: `${shots}/${info.project.name}-1-before.png`,
  });

  // Administrator: rename, translate, reprice, pause a size, replace the photograph.
  await hub.goto("/operations/products");
  await hub.getByLabel("Search").fill(target.id);
  await hub.locator(".ph-row").first().click();
  await hub.getByLabel("Name shown to customers").fill(name);
  await hub.getByRole("tab", { name: "Español" }).click();
  await hub.getByLabel("Name shown to customers").fill(nameEs);
  const variant = (sku: string) =>
    hub
      .locator(".ph-variants li")
      .filter({ has: hub.locator(`input[value="${sku}"]`) });
  await variant(first!.id)
    .getByLabel("Price (AED)")
    .fill((price / 100).toFixed(2));
  await variant(second!.id)
    .getByLabel("Availability")
    .selectOption("unavailable");
  const images = hub.locator(".ph-media li");
  const existing = await images.count();
  await hub.getByLabel("Upload a new image").setInputFiles({
    name: "celebration.png",
    mimeType: "image/png",
    buffer: png(640 + (info.project.name === "webkit" ? 8 : 0), 640),
  });
  await expect(images).toHaveCount(existing + 1);
  // The upload joins the gallery; the administrator makes it the main photograph.
  if (existing)
    await images.last().getByRole("button", { name: "Make primary" }).click();
  await expect(images.first()).toContainText("Primary image");
  await expect(images.first().locator("img")).toHaveAttribute(
    "src",
    /\/brand\/hub\//,
  );
  await hub.getByRole("button", { name: "Save draft" }).click();
  await expect(hub.getByText("Draft saved")).toBeVisible();

  // Still a draft: customers and checkout see nothing new.
  await revisit(shop);
  await expect(card.locator("h4")).toHaveText(target.content.en.name);
  expect(await checkoutPrice(shop, first!.id)).toBe(first!.priceFils);
  expect((await catalog(shop)).revision).toBe(before.revision);

  await hub.getByRole("button", { name: /Review & publish/ }).click();
  await hub.getByLabel(/I reviewed every change/).check();
  await hub.getByRole("button", { name: "Publish catalog" }).click();
  await expect(hub.getByText("Catalog published")).toBeVisible();
  const published = await catalog(shop);
  expect(published.revision).not.toBe(before.revision);
  const content = published.products.find((p) => p.id === target.id)!.content;
  expect(content.en.name).toBe(name);
  expect(content.es.name).toBe(nameEs);

  // The open storefront tab picks the revision up when it is looked at again.
  await revisit(shop);
  await expect(card.locator("h4")).toHaveText(name);
  await expect(card.locator(".b-menu-price")).toHaveText(aed(price));
  await expect(card.locator(".b-menu-photo img")).toHaveAttribute(
    "src",
    /^\/brand\/hub\/[a-f0-9]{64}\.png$/,
  );
  await expect
    .poll(() =>
      card
        .locator(".b-menu-photo img")
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth),
    )
    .toBeGreaterThan(0);
  // The add button carries the published price from the server's own configuration.
  await expect(card.getByRole("button", { name: /ADD TO CART/ })).toContainText(
    aed(price),
  );
  // The paused size cannot be ordered.
  await select.selectOption(second!.size);
  await expect(card.getByRole("status")).toContainText(
    "Online ordering is unavailable for this option.",
  );
  await select.selectOption(first!.size);
  await shop.screenshot({ path: `${shots}/${info.project.name}-2-after.png` });

  // A fresh visit, in Spanish, with the same build.
  await shop.goto(`/menu?product=${target.slug}&lang=es`);
  await expect(shop.locator(".b-product-title")).toHaveText(nameEs);
  await expect(shop.locator(".b-menu-photo img")).toHaveAttribute(
    "src",
    /^\/brand\/hub\//,
  );
  await shop.goto(`/menu?product=${target.slug}&lang=ar`);
  await expect(shop.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(shop.locator(".b-product-title")).not.toBeEmpty();
  await shop.screenshot({ path: `${shots}/${info.project.name}-3-detail.png` });

  // The cart made before the publication is charged the published price.
  await shop.goto("/cart?lang=en");
  const line = shop.locator(".b-co-item").first();
  await expect(line).toContainText(aed(price));
  await expect(shop.locator("main")).not.toContainText(aed(first!.priceFils), {
    timeout: 1000,
  });
  expect(await checkoutPrice(shop, first!.id)).toBe(price);
  expect(await checkoutPrice(shop, second!.id)).toBeUndefined();
  await shop.screenshot({ path: `${shots}/${info.project.name}-4-cart.png` });
  expect(errors).toEqual([]);
});

test("revalidation uses the revision: unchanged catalog answers 304, a publication changes the ETag", async ({
  request,
}) => {
  const first = await request.get("/api/storefront/catalog");
  expect(first.status()).toBe(200);
  const etag = first.headers()["etag"]!;
  expect(etag).toMatch(/^"[a-f0-9]{16}-[a-f0-9]{16}"$/);
  expect(first.headers()["cache-control"]).toContain("no-cache");
  const again = await request.get("/api/storefront/catalog", {
    headers: { "If-None-Match": etag },
  });
  expect(again.status()).toBe(304);
  // Nothing administrative is reachable from the public contract.
  const body = JSON.stringify(await first.json());
  for (const word of ["draft", "commercialState", "updatedBy", "history"])
    expect(body).not.toContain(`"${word}`);
});
