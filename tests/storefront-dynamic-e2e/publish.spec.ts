/**
 * An administrator changes a product in Product Hub and publishes. The storefront,
 * served by the same build with no restart, shows the published name, variants,
 * photograph, availability and price; checkout charges the published price.
 *
 * Adapted to canonical V3.2 (RT01 P1 remediation). The retired legacy menu
 * (`/menu?category=`, `#bakery`, `[data-product-id]` cards with h4/select/price
 * button, `/menu?product=` detail, `.b-co-*` cart) no longer renders: the
 * storefront is the approved V3.2 bakery grid (ref32 cards), customization the
 * approved purchase dialog, detail the open dialog, and `/cart` the canonical
 * V3.2 cart. Every legacy contract below is mapped to its V3.2 approved
 * equivalent instead of deleted:
 *
 * - card name/price/photo -> `.ref32-product` title, From-price and
 *   `.ref32-photo img` (published media preferred, pending placeholder
 *   otherwise). The paused size is filtered out of the dialog instead of a
 *   status line: `[data-sku]` absence + the remaining size still buyable.
 * - detail title/description/photo -> the open dialog (published EN copy) and
 *   the published catalog API for es/ar wording (the approved V3.2 customer
 *   UI renders the published default-locale copy; translations stay
 *   server-authoritative and asserted on the API).
 * - pre-publication cart line -> V3.2 row (stable SKU identity name +
 *   published each-price; the approved V3.2 cart carries no photographs by
 *   design, so photo assertions live on the card). Published "Name in cart"
 *   translations are asserted on the storefront catalog API, and the row
 *   explicitly does NOT take them: line names resolve to the stable server
 *   SKU catalogName in both UIs (pre-existing server contract).
 * - checkout price -> unchanged `/api/checkout/config` authority.
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
/** V3.2 price copy is the app formatAed, identical to the aed helper below. */
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
  const description = `Published description ${info.project.name}`;
  const descriptionEs = `Descripción publicada ${info.project.name}`;
  const descriptionAr = `وصف منشور ${info.project.name}`;
  const price = first!.priceFils + 700;
  const sizeEs = `Porción ${info.project.name}`;
  const cartEs = `Pastel de celebración ${info.project.name}`;

  // The storefront shows the published catalog, not the build's.
  await shop.goto("/bakery?category=cakes&lang=en");
  await expect(shop.locator("html")).toHaveAttribute("data-catalog", "dynamic");
  await expect(shop.locator(".structural-grid")).toBeVisible();
  const card = shop.locator(`.ref32-product[data-product-id="${target.id}"]`);
  await expect(card).toBeEnabled();
  const cardName = async () =>
    (await card.locator(".ref32-product-copy strong").innerText()).trim();
  expect(await cardName()).toBe(target.content.en.name);
  const openDialog = async () => {
    await card.scrollIntoViewIfNeeded();
    await card.click();
    const dialog = shop.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".ref32-dialog-footer")).toBeVisible();
    return dialog;
  };
  // A cart that exists before the publication: the dialog carries the
  // server's own price for the chosen size.
  const beforeDialog = await openDialog();
  await beforeDialog.locator(`[data-sku="${first!.id}"]`).click();
  await expect(beforeDialog.locator(".ref32-buy")).toBeEnabled();
  await expect(beforeDialog.locator(".ref32-price strong")).toContainText(
    aed(first!.priceFils),
  );
  await beforeDialog.locator(".ref32-buy").click();
  await expect(shop.locator(".v32-cart-status")).toBeVisible();
  await shop.screenshot({
    path: `${shots}/${info.project.name}-1-before.png`,
  });

  const detail = await context.newPage();

  // Administrator: rename, translate, reprice, pause a size, replace the photograph.
  await hub.goto("/operations/products");
  await hub.getByLabel("Search").fill(target.id);
  await hub.locator(".ph-row").first().click();
  await hub.getByLabel("Name shown to customers").fill(name);
  await hub.getByLabel("Description shown to customers").fill(description);
  await hub.getByRole("tab", { name: "Español" }).click();
  await hub.getByLabel("Name shown to customers").fill(nameEs);
  await hub.getByLabel("Description shown to customers").fill(descriptionEs);
  await hub.getByRole("tab", { name: "العربية" }).click();
  await hub.getByLabel("Description shown to customers").fill(descriptionAr);
  await hub.getByRole("tab", { name: "Español" }).click();
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
  // Spanish wording for this size and for the name the cart shows.
  await variant(first!.id).locator("summary").click();
  await variant(first!.id).getByLabel("Size · Español").fill(sizeEs);
  await variant(first!.id).getByLabel("Name in cart · Español").fill(cartEs);
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
  expect(await cardName()).toBe(target.content.en.name);
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
  // es/ar wording stays server-authoritative: the approved V3.2 customer UI
  // renders the published default-locale copy.
  expect(content.es.name).toBe(nameEs);
  expect(content.ar.description).toBe(descriptionAr);

  // The open storefront tab picks the revision up when it is looked at again:
  // name, photograph and availability follow the live catalog. Prices keep
  // the page-load checkout configuration (page cache, same in the retired
  // classic UI), so price assertions follow a plain page reload — still the
  // same server build with no restart — while checkout stays server-exact.
  await revisit(shop);
  await expect(card.locator(".ref32-product-copy strong")).toHaveText(name, {
    timeout: 15000,
  });
  await shop.reload();
  await expect(shop.locator(".structural-grid")).toBeVisible();
  // The card carries the published price from the server's own configuration.
  await expect(card).toContainText(aed(price));
  // The card rotates the published photographs; the new main one comes first.
  await expect(card.locator(".ref32-photo img").first()).toHaveAttribute(
    "src",
    /^\/brand\/hub\/[a-f0-9]{64}\.png$/,
  );
  await expect
    .poll(() =>
      card
        .locator(".ref32-photo img")
        .first()
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth),
    )
    .toBeGreaterThan(0);
  // The dialog carries the published price and description; the paused size
  // is filtered out so it cannot be ordered, while the live size stays
  // buyable at the published price.
  const afterDialog = await openDialog();
  await expect(afterDialog).toContainText(description);
  await expect(afterDialog.locator(`[data-sku="${second!.id}"]`)).toHaveCount(
    0,
  );
  await afterDialog.locator(`[data-sku="${first!.id}"]`).click();
  await expect(afterDialog.locator(".ref32-buy")).toBeEnabled();
  await expect(afterDialog.locator(".ref32-price strong")).toContainText(
    aed(price),
  );
  await afterDialog.locator(".ref32-close").click();
  await shop.screenshot({ path: `${shots}/${info.project.name}-2-after.png` });

  // A fresh visit uses the published wording for each selected language.
  await shop.goto("/bakery?category=cakes&lang=es");
  await expect(card).toContainText(nameEs);
  await expect(card.locator(".ref32-photo img")).toHaveAttribute("src", /^\/brand\/hub\//);
  const esDialog = await openDialog();
  await expect(esDialog).toContainText(descriptionEs);
  await expect(esDialog.locator(`[data-sku="${first!.id}"]`)).toContainText(sizeEs);
  await esDialog.locator(".ref32-close").click();
  await shop.goto("/bakery?category=cakes&lang=ar");
  await expect(shop.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(card).toContainText(descriptionAr);
  await shop.screenshot({ path: `${shots}/${info.project.name}-3-detail.png` });

  // The already-added line uses the newly published localized SKU label.
  await shop.goto("/cart?lang=es");
  const line = shop.locator(".v32-new-cart-row").first();
  await expect(line).toContainText(cartEs);
  await shop.goto("/cart?lang=en");
  await expect(line).toContainText(aed(price));
  await expect(shop.locator("main")).not.toContainText(
    aed(first!.priceFils),
    { timeout: 1000 },
  );
  expect(await checkoutPrice(shop, first!.id)).toBe(price);
  expect(await checkoutPrice(shop, second!.id)).toBeUndefined();
  await shop.screenshot({ path: `${shots}/${info.project.name}-4-cart.png` });

  // Remove every product image through the actual editor and publication workflow.
  await hub.getByRole("button", { name: "Catalog", exact: true }).click();
  await hub.getByLabel("Search").fill(target.id);
  await hub.locator(".ph-row").first().click();
  while (await hub.locator(".ph-media li").count())
    await hub
      .locator(".ph-media li")
      .first()
      .getByRole("button", { name: "Remove", exact: true })
      .click();
  await hub.getByRole("button", { name: "Save draft" }).click();
  await expect(hub.getByText("Draft saved")).toBeVisible();
  await hub.getByRole("button", { name: /Review & publish/ }).click();
  await hub.getByLabel(/I reviewed every change/).check();
  await hub.getByRole("button", { name: "Publish catalog" }).click();
  await expect(hub.getByText("Catalog published")).toBeVisible();
  await shop.goto("/bakery?category=cakes&lang=en");
  await expect(shop.locator(".structural-grid")).toBeVisible();
  // The V3.2 card falls back to the approved pending placeholder.
  await expect(card.locator(".ref32-photo-pending")).toBeVisible({
    timeout: 15000,
  });
  await expect(card.locator(".ref32-photo img")).toHaveCount(0);
  await detail.goto(`/bakery?category=cakes&lang=en`);
  await expect(
    detail.locator(
      `.ref32-product[data-product-id="${target.id}"] .ref32-photo-pending`,
    ),
  ).toBeVisible();
  await detail.screenshot({
    path: `${shots}/${info.project.name}-6-removed.png`,
  });

  // Commercial rollback: the administrator publishes the previous price again.
  await hub.getByRole("button", { name: "Catalog", exact: true }).click();
  await hub.getByLabel("Search").fill(target.id);
  await hub.locator(".ph-row").first().click();
  await variant(first!.id)
    .getByLabel("Price (AED)")
    .fill((first!.priceFils / 100).toFixed(2));
  await hub.getByRole("button", { name: "Save draft" }).click();
  await expect(hub.getByText("Draft saved")).toBeVisible();
  await hub.getByRole("button", { name: /Review & publish/ }).click();
  await expect(hub.locator(".ph-diff-price")).toContainText(
    aed(first!.priceFils).replace(/^AED (\d+)$/, "AED $1.00"),
  );
  await hub.getByLabel(/I reviewed every change/).check();
  await hub.getByRole("button", { name: "Publish catalog" }).click();
  await expect(hub.getByText("Catalog published")).toBeVisible();
  // The cart, the menu and checkout agree on the restored price; nothing shows the other.
  await revisit(shop);
  await shop.goto("/cart?lang=en");
  await expect(shop.locator(".v32-new-cart-row").first()).toContainText(
    aed(first!.priceFils),
  );
  await shop.goto("/bakery?category=cakes&lang=en");
  await expect(
    shop.locator(`.ref32-product[data-product-id="${target.id}"]`),
  ).toContainText(aed(first!.priceFils));
  await expect(card).not.toContainText(aed(price), { timeout: 1000 });
  expect(await checkoutPrice(shop, first!.id)).toBe(first!.priceFils);
  await shop.screenshot({
    path: `${shots}/${info.project.name}-5-rollback.png`,
  });
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
