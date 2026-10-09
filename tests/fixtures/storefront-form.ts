import type { Page } from "@playwright/test";
/** Type into the delivery-area typeahead and pick a suggestion by its visible name. */
export async function chooseArea(page: Page, text: string, option = text) {
  const field = page.getByRole("combobox", {
    name: "Delivery area",
    exact: true,
  });
  await field.fill(text);
  await page
    .getByRole("option", {
      name: new RegExp(`^${option.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`),
    })
    .first()
    .click();
}
export async function fillName(page: Page, first: string, last: string) {
  await page.getByLabel("First name", { exact: true }).fill(first);
  await page.getByLabel("Last name", { exact: true }).fill(last);
}
