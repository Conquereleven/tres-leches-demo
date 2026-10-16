import type { PackSnapshot } from "../../shared/pack-composition";
import type { Order } from "./model";

export type KitchenEmailItem = {
  sku: string;
  name: string;
  quantity: number;
  priceFils?: number;
  isPack: boolean;
  pack?: PackSnapshot;
  review?: string;
};
export type KitchenEmail = {
  reference: string;
  orderId: string;
  customer: string;
  phone: string;
  email: string;
  whatsapp: string;
  pickup: boolean;
  date: string;
  time: string;
  address: string[];
  instructions: string;
  deliveryNotes: string;
  items: KitchenEmailItem[];
  amountFils: number;
  quote: Order["quote"];
  origin?: string;
};
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const money = (fils: number) => `AED ${(fils / 100).toFixed(2)}`;
const validMoney = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const warning = (text: string) =>
  `<p style="margin:12px 0;padding:12px;background:#fff0dc;color:#5c2600;border:2px solid #985500;font-weight:bold;">${escapeHtml(text)}</p>`;
const cellText = (text: string) =>
  `<p style="margin:8px 0;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(text)}</p>`;

/** Only an HTTP(S) configured origin can become a link; no customer URLs are used. */
function operationsLink(origin: string | undefined, id: string) {
  try {
    const url = new URL(origin ?? "");
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    return `${url.origin}/operations/orders?order=${encodeURIComponent(id)}`;
  } catch {
    return null;
  }
}

/** Pure rendering of already accepted data. No providers, catalog reads or writes. */
export function renderOperationsEmail(email: KitchenEmail) {
  const linePricesValid =
    email.items.length > 0 &&
    email.items.every(
      (i) =>
        validMoney(i.priceFils) &&
        Number.isSafeInteger(i.quantity) &&
        i.quantity > 0 &&
        Number.isSafeInteger(i.priceFils * i.quantity),
    );
  const subtotal = linePricesValid
    ? email.items.reduce((n, i) => n + i.priceFils! * i.quantity, 0)
    : null;
  const financialReview =
    !validMoney(email.amountFils) ||
    subtotal === null ||
    !Number.isSafeInteger(subtotal) ||
    (email.quote
      ? subtotal !== email.quote.subtotalFils ||
        email.quote.totalFils !== email.amountFils ||
        !validMoney(email.quote.feeFils) ||
        subtotal + email.quote.feeFils !== email.amountFils
      : subtotal !== email.amountFils);
  const link = operationsLink(email.origin, email.orderId);
  const text = [
    `NEW PAID ORDER ${email.reference} (${email.orderId})`,
    `Fulfillment: ${email.pickup ? "Pickup" : "Delivery"}`,
    `Date: ${email.date}`,
    `Time: ${email.time}`,
    "",
    "CUSTOMER INSTRUCTIONS / ALLERGIES — ORIGINAL",
    `Original customer instructions: ${email.instructions}`,
    `Original delivery notes: ${email.deliveryNotes}`,
    "",
    `Customer: ${email.customer}`,
    `Phone: ${email.phone}`,
    `Email: ${email.email}`,
    `WhatsApp: ${email.whatsapp}`,
    ...email.address,
    "",
    "PRODUCTS TO PREPARE",
  ];
  const cards = email.items
    .map((item) => {
      const priceValid =
        validMoney(item.priceFils) &&
        Number.isSafeInteger(item.quantity) &&
        item.quantity > 0 &&
        Number.isSafeInteger(item.priceFils * item.quantity);
      const price = priceValid
        ? `${money(item.priceFils!)} ${item.isPack ? "per box" : "each"} · ${money(item.priceFils! * item.quantity)} line total`
        : "Stored price or quantity missing/invalid — review required";
      text.push("", `${item.quantity} × ${item.name} (${item.sku}) · ${price}`);
      let preparation = "";
      if (item.pack) {
        const heading =
          item.quantity === 1 ? "INSIDE THIS BOX:" : "INSIDE EACH BOX:";
        const total = `TOTAL: ${item.pack.capacity * item.quantity} pieces · ${item.quantity} ${item.quantity === 1 ? "box" : "boxes"}`;
        text.push(
          heading,
          ...item.pack.components.map((c) => `- ${c.units} × ${c.name}`),
          ...(item.quantity > 1
            ? [
                `${item.pack.capacity} pieces per box; repeat this composition for each box.`,
              ]
            : []),
          total,
        );
        preparation = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border-top:1px solid #b9a78b;"><tr><td style="padding-top:12px;"><h3 style="font-size:14px;margin:0 0 8px;">${heading}</h3><ul style="padding-left:24px;margin:0;">${item.pack.components.map((c) => `<li style="padding:4px 0;">${c.units} × ${escapeHtml(c.name)}</li>`).join("")}</ul>${item.quantity > 1 ? cellText(`${item.pack.capacity} pieces per box; repeat this composition for each box.`) : ""}<p style="font-weight:bold;margin:12px 0 0;">${total}</p></td></tr></table>`;
      }
      if (item.review) {
        text.push(item.review);
        preparation += warning(item.review);
      }
      return `<tr><td style="padding:0 0 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid ${item.isPack ? "#69543d" : "#d7cdc0"};border-radius:12px;background:${item.isPack ? "#fbf3e7" : "#ffffff"};"><tr><td style="padding:20px;overflow-wrap:anywhere;word-break:break-word;"><p style="font-size:12px;font-weight:bold;margin:0 0 8px;">${item.isPack ? "PACK / BOX" : "INDIVIDUAL PRODUCT"}</p><h2 style="font-size:20px;line-height:1.35;margin:0;">${escapeHtml(String(item.quantity))} × ${escapeHtml(item.name)}</h2><p style="font-size:12px;margin:8px 0;color:#51463d;">${escapeHtml(item.sku)}</p>${cellText(price)}${preparation}</td></tr></table></td></tr>`;
    })
    .join("");
  const review =
    "MANUAL REVIEW REQUIRED: Stored line amounts and paid total do not reconcile. Use the accepted order/payment records; do not recalculate from today's catalog.";
  if (financialReview) text.push("", review);
  if (validMoney(email.quote?.feeFils) && email.quote.feeFils > 0)
    text.push(`Stored delivery fee: ${money(email.quote.feeFils)}`);
  text.push(
    "",
    `Total paid: ${validMoney(email.amountFils) ? money(email.amountFils) : "Stored payment amount invalid — review required"}`,
    "",
    link ??
      "Operations link unavailable — open the authenticated dashboard and find this order.",
  );
  const paid = validMoney(email.amountFils)
    ? money(email.amountFils)
    : "Review required";
  const html = `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="format-detection" content="telephone=no"><title>Paid 3L order ${escapeHtml(email.reference)}</title></head><body style="margin:0;padding:0;background:#f4eee7;color:#30251e;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;"><div role="main" lang="en" dir="ltr"><table lang="en" dir="ltr" role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;text-align:left;"><tr><td style="padding:24px 20px;background:#30251e;color:#ffffff;border-radius:12px;"><p style="font-size:13px;font-weight:bold;margin:0 0 8px;">3L · KITCHEN ORDER · PAID</p><h1 style="font-size:28px;line-height:1.25;margin:0;">Order ${escapeHtml(email.reference)}</h1>${cellText(email.orderId)}</td></tr><tr><td style="padding:20px 4px;"><h2 style="font-size:22px;margin:0;">${email.pickup ? "Pickup" : "Delivery"} · ${escapeHtml(email.date)}</h2><p style="font-size:20px;font-weight:bold;margin:4px 0;">${escapeHtml(email.time)}</p></td></tr><tr><td style="padding:20px;background:#fff0dc;border:2px solid #985500;border-radius:12px;"><h2 style="font-size:18px;margin:0;">Customer instructions / allergies</h2><p style="font-size:13px;margin:4px 0 12px;">Original customer text — check before preparation</p><h3 style="font-size:15px;margin:8px 0;">Original customer instructions</h3>${cellText(email.instructions)}<h3 style="font-size:15px;margin:12px 0 8px;">Original delivery notes</h3>${cellText(email.deliveryNotes)}</td></tr><tr><td style="padding:20px 4px;"><h2 style="font-size:18px;margin:0;">Customer &amp; ${email.pickup ? "pickup" : "delivery"}</h2>${[`Customer: ${email.customer}`, `Phone: ${email.phone}`, `Email: ${email.email}`, `WhatsApp: ${email.whatsapp}`, ...email.address].map(cellText).join("")}</td></tr>${cards}<tr><td style="padding:20px;background:#ffffff;border-radius:12px;">${financialReview ? warning(review) : ""}${validMoney(email.quote?.feeFils) && email.quote.feeFils > 0 ? cellText(`Stored delivery fee: ${money(email.quote.feeFils)}`) : ""}<h2 style="font-size:24px;margin:0 0 16px;">Total paid: ${paid}</h2>${link ? `<a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 18px;background:#30251e;color:#ffffff;border-radius:8px;text-decoration:underline;font-weight:bold;">Open order in Operations (sign-in required)</a>` : warning("Operations link unavailable — open the authenticated dashboard and find this order.")}</td></tr></table></td></tr></table></div></body></html>`;
  return { text: text.join("\n"), html };
}
