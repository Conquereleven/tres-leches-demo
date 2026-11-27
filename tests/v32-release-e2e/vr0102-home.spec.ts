import { expect, test } from "@playwright/test";

const widths = [320, 390, 768, 901, 1024, 1440, 1920];
const languages = ["en", "es", "ar"];

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`Home preserves the journey geometry and direction with motion ${reducedMotion}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion });
    for (const width of widths) {
      await page.setViewportSize({ width, height: 930 });
      let reference: number[] | undefined;
      for (const language of languages) {
        await page.goto(`/?lang=${language}`);
        await expect(page.locator("html")).toHaveAttribute("dir", language === "ar" ? "rtl" : "ltr");
        const result = await page.locator(".journey-composition").evaluate(async (hero) => {
          await document.fonts.ready;
          const heading = hero.querySelector("h1")!;
          const route = hero.querySelector(".journey-svg")!;
          const line = route.querySelector(".journey-line")!;
          const mexico = hero.querySelector("[data-city=mexico]")!;
          const dubai = hero.querySelector("[data-city=dubai]")!;
          const range = document.createRange();
          range.selectNodeContents(heading);
          const animations = [...line.getAnimations(), ...heading.getAnimations()];
          await Promise.all(animations.map(animation => animation.ready));
          const collisions: string[] = [];
          let clipped = false;
          let lineCount = 0;
          for (const progress of [0, .16, .33, .5, .7, .86, 1]) {
            for (const animation of animations) {
              animation.pause();
              animation.currentTime = Number(animation.effect!.getComputedTiming().endTime) * progress;
            }
            const lines = Array.from(range.getClientRects()).filter(rect => rect.width > 1);
            lineCount = lines.length;
            clipped ||= lines.some(rect => rect.left < 0 || rect.right > innerWidth);
            for (const target of [route, ...hero.querySelectorAll(".city img, .city figcaption")]) {
              const area = target.getBoundingClientRect();
              if (lines.some(rect => rect.bottom >= area.top && rect.top <= area.bottom && rect.left <= area.right && rect.right >= area.left))
                collisions.push(`${progress}: ${target.outerHTML.slice(0, 90)}`);
            }
          }
          const headingBox = heading.getBoundingClientRect();
          const routeBox = route.getBoundingClientRect();
          const landmarkBoxes = [...hero.querySelectorAll(".city img"), route].flatMap(element => {
            const { x, y, width, height } = element.getBoundingClientRect();
            return [x, y, width, height];
          });
          return {
            collisions, clipped, overflow: document.documentElement.scrollWidth > innerWidth,
            lineCount,
            geometry: [headingBox.top, headingBox.height, ...landmarkBoxes],
            routeVisible: routeBox.left >= 0 && routeBox.right <= innerWidth && routeBox.width > 0 && routeBox.height > 0,
            geographicOrder: mexico.getBoundingClientRect().right <= route.getBoundingClientRect().left + 4
              && route.getBoundingClientRect().right <= dubai.getBoundingClientRect().left + 4,
            routeAnimation: getComputedStyle(line).animationName,
            finalRouteOffset: getComputedStyle(line).strokeDashoffset,
            captionsRTL: [...hero.querySelectorAll("figcaption")].every(el => getComputedStyle(el).direction === "rtl"),
          };
        });
        const label = `${language} ${width}px`;
        expect(result.collisions, label).toEqual([]);
        expect(result.clipped, label).toBe(false);
        expect(result.overflow, label).toBe(false);
        expect(result.lineCount, label).toBe(2);
        expect(result.routeVisible, label).toBe(true);
        if (!reference) reference = result.geometry;
        expect(result.geometry.map((value, index) => Math.abs(value - reference![index]!)), label)
          .toEqual(Array.from({ length: result.geometry.length }, () => expect.closeTo(0, 0)));
        expect(result.geographicOrder, label).toBe(true);
        expect(result.captionsRTL, label).toBe(language === "ar");
        expect(result.routeAnimation, label).toBe(reducedMotion === "reduce" ? "none" : "route-draw");
        expect(result.finalRouteOffset, label).toBe("0px");
      }
    }
  });
}
