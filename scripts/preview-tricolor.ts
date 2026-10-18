/** Fictional local order only. Injected fake payment transport. No sends. */
import { writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { premiumFixture, premiumInput } from "../tests/fixtures/premium-packs";
import { createWebCheckout } from "../server/domain/web-checkout";
const f = premiumFixture();
f.service.operationsOrigin = "https://example.invalid";
try {
  const lines = [
    {
      productId: "conchas-traditional-tricolor-mini-40-g",
      quantity: 2,
      color: "red" as const,
    },
    {
      productId: "conchas-traditional-tricolor-individual-70-g",
      quantity: 1,
      color: "white" as const,
    },
    { productId: "conchas-tricolor-pack-3-mini", quantity: 2 },
    { productId: "conchas-tricolor-pack-3-individuales", quantity: 1 },
  ];
  const input = premiumInput(lines);
  input.customer.name = "FICTIONAL TRICOLOR QA";
  const result = await createWebCheckout(
    f.service,
    input,
    randomUUID(),
    "web",
    "https://www.3ldubai.ae",
  );
  f.paid();
  const p = f.store.read().payments.find((p) => p.orderId === result.orderId)!;
  await f.service.reconcile(p.id, { id: "fixture-admin", role: "admin" });
  const email = f.store.read().operationsEmailNotifications![0]!;
  mkdirSync("docs/tricolor", { recursive: true });
  writeFileSync("docs/tricolor/fictional-kitchen.html", email.html!);
  writeFileSync("docs/tricolor/fictional-kitchen.txt", email.body);
} finally {
  f.store.close();
}
