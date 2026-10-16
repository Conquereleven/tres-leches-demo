import { mkdirSync, writeFileSync } from "node:fs";
import { kitchenEmailPreview } from "../tests/fixtures/kitchen-email";
const directory = "docs/email/previews";
mkdirSync(directory, { recursive: true });
const message = kitchenEmailPreview();
writeFileSync(`${directory}/fictional-paid-order.html`, message.html!);
writeFileSync(`${directory}/fictional-paid-order.txt`, message.body);
console.log(
  `Fictional preview only: ${directory}/fictional-paid-order.html (no sends)`,
);
