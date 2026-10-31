/** Fake-transport control file allocated by the local checkout Playwright config. */
import { readFileSync, writeFileSync } from "node:fs";
export function setCheckoutProviderStatus(checkoutUrl: string, status: string) {
  const file = process.env.CHECKOUT_FIXTURE_STATUS_FILE;
  if (!file) throw new Error("Local checkout fixture required");
  const id = new URL(checkoutUrl).pathname.split("/").at(-1)!;
  const current = JSON.parse(readFileSync(file, "utf8"));
  writeFileSync(file, JSON.stringify({ ...current, [id]: status }));
}
