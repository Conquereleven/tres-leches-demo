/** Explicitly synthetic: in-memory SQLite + injected fake Paymennt transport, no sends. */
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PACK_SPECS } from "../shared/pack-composition";
import { premiumFixture, premiumInput } from "../tests/fixtures/premium-packs";
import {
  quoteWebCheckout,
  createWebCheckout,
} from "../server/domain/web-checkout";
process.env.PERSONALIZED_PACKS_ENABLED = "true";
process.env.PAN_PACK_PREMIUM_PRICING_ENABLED = "true";
const dir = "docs/pack-pricing";
mkdirSync(dir, { recursive: true });
const f = premiumFixture();
// Synthetic preview opts in explicitly; real recipients remain configuration-only.
f.service.operationsEmailCompactRecipients = [
  ...f.service.operationsEmailRecipients,
];
const line = (spec: (typeof PACK_SPECS)[number], n: number, q = 1) => ({
  productId: spec.packSkuId,
  quantity: q,
  composition: [
    {
      componentSkuId: spec.components[0]!.componentSkuId,
      units: spec.capacity - n,
    },
    ...(n
      ? [
          {
            componentSkuId: spec.components.find((c) =>
              spec.family === "traditional"
                ? c.componentSkuId.endsWith("-chocolate-covering")
                : c.componentSkuId.includes("filled-pistachio"),
            )!.componentSkuId,
            units: n,
          },
        ]
      : []),
  ].filter((c) => c.units > 0),
});
try {
  const csv = [
    "SKU,Base AED,Surcharge per premium piece AED,0 premium AED,1 premium AED,2 premium AED,Full premium box AED",
  ];
  for (const spec of PACK_SPECS) {
    const totals = [0, 1, 2, spec.capacity].map(
      (n) =>
        quoteWebCheckout(f.service, {
          lines: [line(spec, n)],
          fulfillmentMethod: "pickup",
        }).totalFils! / 100,
    );
    const rate =
      spec.family === "traditional"
        ? spec.size === "mini"
          ? 5
          : 6
        : spec.size === "mini"
          ? 23
          : 26;
    csv.push([spec.packSkuId, totals[0], rate, ...totals].join(","));
  }
  writeFileSync(`${dir}/eight-format-evidence.csv`, csv.join("\n") + "\n");
  const lines = [
    line(PACK_SPECS[0]!, 2),
    line(PACK_SPECS[4]!, 2),
    line(PACK_SPECS[4]!, 1, 2),
  ];
  const input = {
    ...premiumInput(lines),
    customer: {
      ...premiumInput(lines).customer,
      instructions:
        "FICTIONAL PREVIEW — ALLERGY: peanuts. Keep each box separate.\nOriginal customer note / nota original / ملاحظة أصلية.",
    },
  };
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
  writeFileSync(`${dir}/fictional-premium-kitchen.html`, email.html!);
  writeFileSync(`${dir}/fictional-premium-kitchen.txt`, email.body);
  console.log(
    "Synthetic pricing evidence and AED462 kitchen preview created; fake provider only, no email sends.",
  );
} finally {
  f.store.close();
}
