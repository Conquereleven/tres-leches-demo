import { expect, type Locator } from "@playwright/test";

/** One real click after scroll settles; no forced click, delay or mutation retry. */
export async function clickStableControl(control: Locator) {
  await expect(control).toBeEnabled();
  await control.evaluate((el) =>
    el.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await expect
    .poll(() =>
      control.evaluate(async (el) => {
        const before = el.getBoundingClientRect();
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        const after = el.getBoundingClientRect();
        return (
          before.x === after.x &&
          before.y === after.y &&
          before.height === after.height &&
          document
            .elementFromPoint(
              after.x + after.width / 2,
              after.y + after.height / 2,
            )
            ?.closest("button") === el
        );
      }),
    )
    .toBe(true);
  await control.click();
}
