import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { renderCustomerEmail } from "../../server/domain/customer-notifications";
import { paidPreview } from "../fixtures/customer-paid-preview";
for (const width of [390, 1440])
  for (const pickup of [false, true])
    test(`paid confirmation email ${pickup ? "pickup" : "delivery"} ${width}`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const external: string[] = [];
      await page.route("**/*", (r) => {
        external.push(r.request().url());
        return r.abort();
      });
      await page.setContent(
        renderCustomerEmail("ORDER_PAID", paidPreview(pickup), {
          paidAmountFils: 70500,
        }).html!,
      );
      await expect(
        page.getByRole("heading", { name: "Your order is confirmed!" }),
      ).toBeVisible();
      await expect(page.getByText("Total paid: AED 705.00")).toBeVisible();
      await expect(page.getByText("#999", { exact: true })).toBeVisible();
      await expect(page.getByText(/24 pieces in 2 boxes/)).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(external).toEqual([]);
      await page.screenshot({
        path: `work/qa/customer-paid/${browserName}-${width}-${pickup ? "pickup" : "delivery"}-email.png`,
        fullPage: true,
      });
    });
