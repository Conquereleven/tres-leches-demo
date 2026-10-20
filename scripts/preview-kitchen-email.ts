import { mkdirSync, writeFileSync } from "node:fs";
import {
  kitchenEmailPreview,
  compactKitchenEmailPreview,
} from "../tests/fixtures/kitchen-email";
const directory = "docs/email/previews";
mkdirSync(directory, { recursive: true });
const message = kitchenEmailPreview();
writeFileSync(`${directory}/fictional-paid-order.html`, message.html!);
writeFileSync(`${directory}/fictional-paid-order.txt`, message.body);
console.log(
  `Fictional preview only: ${directory}/fictional-paid-order.html (no sends)`,
);

for (const kind of [
  "short",
  "three",
  "typical",
  "pickup",
  "long",
  "review",
  "large",
] as const) {
  const preview = compactKitchenEmailPreview(kind);
  writeFileSync(`${directory}/compact-${kind}.html`, preview.html!);
  writeFileSync(`${directory}/compact-${kind}.txt`, preview.body);
}
