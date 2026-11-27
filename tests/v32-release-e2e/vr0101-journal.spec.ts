import { expect, test } from "@playwright/test";

const locales = {
  en: ["A crown of sweetness, a table full of love.", "Read the story", "A tradition across centuries", "A crown filled with meaning", "The little surprise", "A promise to gather again", "From Mexico City to Dubai"],
  es: ["Una corona dulce, una mesa llena de amor.", "Leer la historia", "Una tradición que cruza siglos", "Una corona llena de significado", "La pequeña sorpresa", "La promesa de volver a la mesa", "De Ciudad de México a Dubái"],
  ar: ["خبزٌ على هيئة تاج، ومائدة تجمع الأحبّة.", "اقرأ الحكاية", "تقليد يمتدّ عبر القرون", "تاج يحمل أكثر من معنى", "المفاجأة الصغيرة", "وعد بلقاء آخر", "من مدينة مكسيكو إلى دبي"],
} as const;

test("journal presents the authenticated Rosca photo and complete localized internal story", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const original = await request.get("/brand/editorial/rosca-de-reyes.jpg");
  expect(original.ok()).toBe(true);
  const digest = await import("node:crypto").then(({ createHash }) => createHash("sha256"));
  expect(digest.update(await original.body()).digest("hex")).toBe(
    "1a166925579ff7d653f360689c90afa80bd32b0b6d4df78ec128678afb223717",
  );
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 925 });
    for (const [locale, [title, link, ...chapters]] of Object.entries(locales)) {
      await page.goto(`/journal?lang=${locale}`);
      await expect(page.locator("header.mast")).toHaveCount(1);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
      const hero = page.locator(".journal-hero");
      const photo = hero.getByRole("img");
      await expect(photo).toBeVisible();
      const image = await photo.evaluate(async (img: HTMLImageElement) => {
        await img.decode();
        const { width, height } = img.getBoundingClientRect();
        return { source: new URL(img.currentSrc).pathname, intrinsic: [img.naturalWidth, img.naturalHeight], width, height, filter: getComputedStyle(img).filter };
      });
      expect(image.source).toBe("/brand/editorial/rosca-de-reyes.jpg");
      expect(image.intrinsic).toEqual([800, 1200]);
      expect(image.width).toBeGreaterThan(240);
      expect(image.width).toBeLessThanOrEqual(500);
      expect(image.height / image.width).toBeCloseTo(1.5, 3);
      expect(image.filter).toBe("none");
      await expect(hero.locator(".journal-portrait")).toHaveCSS("animation-name", "none");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await expect(page.locator(".editorial-journal a[href^='http']")).toHaveCount(0);
      await expect(page.locator(".editorial-journal h2")).toHaveText(chapters);
      await expect(page.locator(".editorial-journal a")).toHaveCount(1);
      await expect(page.locator("time[datetime='01-06']")).toBeVisible();
      await expect(page.locator("time[datetime='02-02']")).toBeVisible();
      const headingFits = await hero.locator("h1").evaluate((h1) => {
        const range = document.createRange();
        range.selectNodeContents(h1);
        return [...range.getClientRects()].every((box) => box.left >= 0 && box.right <= innerWidth);
      });
      expect(headingFits).toBe(true);
      if (width === 390 && locale === "ar")
        await page.screenshot({ path: info.outputPath(`journal-${width}-${locale}.png`), animations: "disabled", timeout: 20_000 });
      const entry = hero.getByRole("link", { name: link });
      await entry.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/#journal-story$/);
      await expect(page.locator("#journal-story")).toBeInViewport();
      await expect(page.locator("#journal-story")).toBeFocused();
    }
  }
});

test("Journal reveal is restrained and all five chapters remain available", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/journal?lang=ar");
  await expect(page.locator(".journal-portrait")).toHaveCSS("animation-name", "journal-enter");
  await expect(page.locator(".journal-chapter h2")).toHaveCount(5);
  await expect(page.locator(".journal-portrait")).toHaveCSS("opacity", "1");
});

test("Home keeps its Rosca disclosure and loads the photo only after opening", async ({ page }) => {
  for (const lang of ["en", "es", "ar"]) {
    await page.goto(`/?lang=${lang}`);
    const trigger = page.locator("#rosca-toggle");
    const content = page.locator("#rosca-content");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(content.locator("img")).toHaveCount(0);
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(content.getByRole("img")).toHaveAttribute("src", "/brand/editorial/rosca-de-reyes.jpg");
    await trigger.click();
    await expect(content).toHaveAttribute("inert", "");
  }
});
