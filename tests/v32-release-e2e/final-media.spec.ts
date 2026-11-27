import { expect, test } from "@playwright/test";

test("verified product galleries keep variant identity and respect reduced motion", async ({ page, request }) => {
  const response = await request.get("/api/storefront/catalog");
  expect(response.ok()).toBe(true);
  const catalog = await response.json() as {
    products: Array<{id:string; options:Array<{id:string}>; media:Array<{assetId:string; role:string}>}>;
    assets: Array<{id:string; derivatives:Array<{src:string}>}>;
  };
  for (const id of ["tres-leches--classic", "conchas-traditional--vainilla", "pan-de-muerto-traditional--azucar", "orejas", "panettone-normal", "carrot-cake", "cheesecake"]) {
    const product = catalog.products.find(p=>p.id===id)!;
    expect(product.options.length, id).toBeGreaterThan(0);
    expect(product.media.filter(ref => ref.role === "gallery").length, id).toBeGreaterThan(0);
    for (const ref of product.media) {
      const asset = catalog.assets.find(a=>a.id===ref.assetId)!;
      expect(asset.derivatives.length, id).toBeGreaterThan(0);
    }
  }
  const avif = catalog.assets.flatMap(asset => asset.derivatives).find(derivative => derivative.src.endsWith(".avif"));
  expect(avif).toBeDefined();
  const photograph = await request.get(avif!.src);
  expect(photograph.ok()).toBe(true);
  expect(photograph.headers()["content-type"]).toBe("image/avif");

  await page.emulateMedia({ reducedMotion:"reduce" });
  await page.goto("/menu/orejas?lang=ar");
  const rotation = page.locator(".v32-product-page-card .b-official-rotation");
  await expect(rotation).toHaveAttribute("data-frame", "0");
  const image = rotation.locator("picture.is-active img");
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  const trigger = page.locator("button[data-product-id=orejas]");
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.locator("#product-panel")).toBeVisible();
  await expect(image).toBeVisible();
  await expect(rotation).toHaveAttribute("data-frame", "0");
  await page.keyboard.press("Escape");

  await page.emulateMedia({ reducedMotion:"no-preference" });
  await page.goto("/menu/panettone-normal?lang=en");
  const pan = page.locator(".v32-product-page-card .b-official-rotation");
  await expect(pan).toBeVisible();
  await expect(pan).toHaveAttribute("data-frame", "1", { timeout: 15_000 });
  await expect.poll(() => pan.locator("picture.is-active img").evaluate((element:HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  expect(await pan.locator("picture.is-active img").evaluate((element: HTMLImageElement) => element.currentSrc)).toContain("/brand/hub/");
});
