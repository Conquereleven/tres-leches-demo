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
  preparation?: string;
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
  `<p style="margin:4px 0;padding:6px;background:#F6DFE0;color:#27242d;border:1px solid #A28D5B;font-weight:bold;">${escapeHtml(text)}</p>`;
const cellText = (text: string) =>
  `<p style="margin:2px 0;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(text)}</p>`;

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
      const title = item.isPack ? item.name : `${item.quantity} × ${item.name}`;
      text.push(
        "",
        `${item.isPack ? "PACK / BOX: " : ""}${title} (${item.sku}) · ${price}`,
      );
      const visiblePrice = priceValid
        ? item.quantity === 1
          ? money(item.priceFils!)
          : price
        : "Stored price or quantity missing/invalid — review required";
      let preparation = "";
      if (item.preparation) {
        text.push(item.preparation);
        preparation = cellText(item.preparation);
      }
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
        preparation = `<h3 style="font-size:12px;line-height:1.3;margin:4px 0 2px;">${heading}</h3><ul style="padding-left:18px;margin:0;">${item.pack.components.map((c) => `<li style="margin:0;padding:0;">${c.units} × ${escapeHtml(c.name)}</li>`).join("")}</ul>${item.quantity > 1 ? cellText(`${item.quantity} boxes · ${item.pack.capacity} pieces per box; same contents in each box.`) : ""}<p style="font-weight:bold;margin:3px 0 0;">${escapeHtml(total)}</p>`;
      }
      if (item.isPack && !item.pack) {
        const count = `${item.quantity} ${item.quantity === 1 ? "box" : "boxes"} · pieces per box not recorded — manual review required`;
        text.push(count);
        preparation += cellText(count);
      }
      if (item.review) {
        text.push(item.review);
        preparation += warning(item.review);
      }
      const background = item.isPack ? "#fdf5f5" : "#ffffff";
      // One row group per accepted line: distinct same-SKU mixtures never merge.
      return `<tbody data-kitchen-item="${item.isPack ? "pack" : "single"}" style="background:${background};"><tr><th scope="row" style="text-align:left;vertical-align:top;padding:8px 6px 4px;overflow-wrap:anywhere;word-break:break-word;${preparation ? "" : "border-bottom:1px solid #e6dede;"}">${item.isPack ? '<p style="font-size:12px;font-weight:bold;margin:0 0 2px;">PACK / BOX</p>' : ""}<h2 style="font-size:14px;line-height:1.3;margin:0;font-weight:bold;">${escapeHtml(item.name)}</h2>${item.quantity !== 1 ? `<p style="font-size:13px;font-weight:normal;line-height:1.3;margin:3px 0 0;">${escapeHtml(priceValid ? `${money(item.priceFils!)} ${item.isPack ? "per box" : "each"}` : visiblePrice)}</p>` : ""}</th><td data-kitchen-quantity style="vertical-align:top;text-align:center;padding:8px 2px 4px;font-weight:bold;${preparation ? "" : "border-bottom:1px solid #e6dede;"}">${Number.isSafeInteger(item.quantity) && item.quantity > 0 ? item.quantity : "Review"}</td><td data-kitchen-price style="vertical-align:top;text-align:right;padding:8px 6px 4px;font-size:13px;font-weight:bold;${preparation ? "" : "border-bottom:1px solid #e6dede;"}">${escapeHtml(priceValid ? money(item.priceFils! * item.quantity) : "Review required")}</td></tr>${preparation ? `<tr><td colspan="3" style="padding:0 6px 8px;border-bottom:1px solid #e6dede;">${preparation}</td></tr>` : ""}</tbody>`;
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
  const contacts = [
    `Customer: ${email.customer}`,
    ...(email.phone === email.whatsapp && email.phone !== "Not stored"
      ? [`Phone / WhatsApp: ${email.phone}`]
      : [`Phone: ${email.phone}`, `WhatsApp: ${email.whatsapp}`]),
    `Email: ${email.email}`,
  ];
  const addressHtml = email.address
    .map((line) =>
      /(?:UNVERIFIED|Not recorded|review required|Not stored)/i.test(line)
        ? warning(line)
        : escapeHtml(line),
    )
    .join(" · ");
  const html = `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="format-detection" content="telephone=no"><title>Paid 3L order ${escapeHtml(email.reference)}</title></head><body style="margin:0;padding:0;background:#ffffff;color:#27242d;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.3;"><div role="main" lang="en" dir="ltr"><table lang="en" dir="ltr" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;"><tr><td align="center" style="padding:8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;table-layout:fixed;text-align:left;overflow-wrap:anywhere;word-break:break-word;">
<tr><td style="padding:8px 10px;background:#F6DFE0;border-bottom:2px solid #A28D5B;"><p style="margin:0 0 3px;font-size:12px;font-weight:bold;letter-spacing:1px;">3L PASTELERÍAS</p><h1 style="font-size:18px;line-height:1.2;margin:0;">Order ${escapeHtml(email.reference)} · PAID</h1></td></tr>
<tr><td style="padding:7px 0 0;"><table aria-label="Products to prepare" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-collapse:collapse;"><colgroup><col><col style="width:36px;"><col style="width:80px;"></colgroup><thead><tr style="border-bottom:1px solid #A28D5B;"><th scope="col" style="text-align:left;padding:4px 6px;font-size:13px;">Product</th><th scope="col" style="text-align:center;padding:4px 2px;font-size:13px;">Qty</th><th scope="col" style="text-align:right;padding:4px 6px;font-size:13px;">Price</th></tr></thead>${cards}</table></td></tr>
<tr><td data-kitchen-notes style="padding:7px 6px;background:#fdf5f5;border-bottom:1px solid #e6dede;"><h2 style="font-size:14px;margin:0 0 3px;">Customer instructions / allergies</h2><p style="margin:0 0 3px;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;"><strong>Original customer instructions:</strong> ${escapeHtml(email.instructions)}</p><p style="margin:0;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;"><strong>Original delivery notes:</strong> ${escapeHtml(email.deliveryNotes)}</p></td></tr>
<tr><td style="padding:7px 6px;">${financialReview ? warning(review) : ""}${validMoney(email.quote?.feeFils) && email.quote.feeFils > 0 ? cellText(`Stored delivery fee: ${money(email.quote.feeFils)}`) : ""}<h2 style="font-size:17px;margin:0;">Total paid: ${paid}</h2></td></tr>
<tr><td data-kitchen-fulfillment style="padding:5px 6px;border-top:1px solid #e6dede;"><h2 style="font-size:14px;margin:0;">${email.pickup ? "Pickup" : "Delivery"} · ${escapeHtml(email.date)} · ${escapeHtml(email.time)}</h2></td></tr>
<tr><td data-kitchen-customer style="font-size:13px;padding:4px 6px;line-height:1.35;">${contacts.map(escapeHtml).join(" · ")}</td></tr>
<tr><td data-kitchen-address style="font-size:13px;padding:4px 6px;line-height:1.35;">${addressHtml}</td></tr>
<tr><td style="padding:0 6px;">${link ? `<a href="${escapeHtml(link)}" style="display:inline-block;min-height:44px;box-sizing:border-box;padding:12px 0;line-height:20px;color:#27242d;text-decoration:underline;font-weight:bold;">Open order in Operations (sign-in required)</a>` : warning("Operations link unavailable — open the authenticated dashboard and find this order.")}</td></tr>
</table></td></tr></table></div></body></html>`;
  return { text: text.join("\n"), html };
}
