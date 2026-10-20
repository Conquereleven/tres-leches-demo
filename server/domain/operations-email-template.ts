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
      // Each accepted line owns its row group, including any frozen box contents.
      return `<tbody data-kitchen-item="${item.isPack ? "pack" : "single"}"><tr><th scope="row" style="text-align:left;vertical-align:top;padding:12px 9px ${preparation ? "3px" : "12px"};font-weight:normal;overflow-wrap:anywhere;word-break:break-word;${preparation ? "" : "border-bottom:1px solid #dbcbb3;"}">${item.isPack ? '<p style="font:10px Arial,Helvetica,sans-serif;letter-spacing:1px;color:#6f5733;margin:0 0 3px;">PACK / BOX</p>' : ""}<h2 style="font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.14;margin:0;font-weight:normal;">${escapeHtml(item.name)}</h2></th><td data-kitchen-quantity style="vertical-align:top;text-align:center;padding:14px 2px 4px;font-size:18px;${preparation ? "" : "border-bottom:1px solid #dbcbb3;"}">${Number.isSafeInteger(item.quantity) && item.quantity > 0 ? item.quantity : "Review"}</td><td style="vertical-align:top;text-align:right;padding:14px 9px 4px;font-size:17px;${preparation ? "" : "border-bottom:1px solid #dbcbb3;"}"><span data-kitchen-price style="white-space:nowrap;">${escapeHtml(priceValid ? money(item.priceFils! * item.quantity) : "Review required")}</span>${item.quantity !== 1 ? `<p style="font-size:13px;line-height:1.25;margin:3px 0 0;color:#6f5733;">${escapeHtml(priceValid ? `${money(item.priceFils!)} ${item.isPack ? "per box" : "each"}` : visiblePrice)}</p>` : ""}</td></tr>${preparation ? `<tr><td colspan="3" style="padding:0 9px 12px;border-bottom:1px solid #dbcbb3;color:#6f5733;">${preparation}</td></tr>` : ""}</tbody>`;
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
  const secondary =
    "font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.4;letter-spacing:1.8px;text-transform:uppercase;color:#715633;";
  // Suppress only structured values already literally present in the full address.
  // Conflicts, missing values and every review warning remain explicit; text stays exact.
  const fullAddress = email.address
    .find((line) => line.startsWith("Full address: "))
    ?.slice(14);
  const normalizedFull = fullAddress?.trim().toLowerCase() ?? "";
  const addressLines = email.address.filter((line) => {
    const field =
      /^(Street\/address|Building\/villa|Apartment\/unit): (.+)$/.exec(line);
    if (!field || /Not stored|Not recorded|review required/i.test(field[2]!))
      return true;
    const value = field[2]!.trim().toLowerCase();
    if (!value) return true;
    const containsExact = (needle: string) => {
      const at = normalizedFull.indexOf(needle);
      if (at < 0) return false;
      const before = normalizedFull[at - 1];
      const after = normalizedFull[at + needle.length];
      return (
        (!before || /[\s,;·]/.test(before)) &&
        (!after || /[\s,;·.]/.test(after))
      );
    };
    if (field[1] === "Apartment/unit")
      return !["unit", "apartment", "flat", "apt"].some((label) =>
        containsExact(`${label} ${value}`),
      );
    return !containsExact(value);
  });
  const addressHtml = addressLines
    .map((line) =>
      /(?:UNVERIFIED|Not recorded|review required|Not stored)/i.test(line)
        ? warning(line)
        : cellText(line.startsWith("Full address: ") ? line.slice(14) : line),
    )
    .join("");
  const contacts = [
    ...(email.phone === email.whatsapp && email.phone !== "Not stored"
      ? [`Phone / WhatsApp: ${email.phone}`]
      : [`Phone: ${email.phone}`, `WhatsApp: ${email.whatsapp}`]),
    `Email: ${email.email}`,
  ];
  const storedSubtotal =
    subtotal !== null && Number.isSafeInteger(subtotal)
      ? money(subtotal)
      : "Not stored — review required";
  const fee = validMoney(email.quote?.feeFils)
    ? money(email.quote.feeFils)
    : "Not stored — review required";
  const html = `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="format-detection" content="telephone=no"><title>Paid 3L order ${escapeHtml(email.reference)}</title></head><body style="margin:0;padding:0;background:#fffcf8;color:#191919;font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.3;"><div role="main" lang="en" dir="ltr"><table lang="en" dir="ltr" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;table-layout:fixed;text-align:left;overflow-wrap:anywhere;word-break:break-word;">
<tr><td data-kitchen-brand style="text-align:center;background:#F6DFE0;padding:15px 12px 13px;color:#715633;"><p style="font-size:26px;line-height:1.15;letter-spacing:5px;margin:0;">TRES LECHES</p><table role="presentation" width="44%" align="center" cellpadding="0" cellspacing="0"><tr><td style="border-bottom:1px solid #A28D5B;height:9px;font-size:1px;line-height:1px;">&nbsp;</td></tr></table><p style="font:10px Arial,Helvetica,sans-serif;letter-spacing:4px;margin:10px 0 0;">BAKERY</p></td></tr>
<tr><td style="text-align:center;padding:14px 12px 15px;"><h1 style="font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:normal;line-height:1.1;margin:0 0 9px;">New Order: ${escapeHtml(email.reference)}</h1><p style="font-size:14px;margin:0 0 8px;">You’ve received the following order from ${escapeHtml(email.customer)}.</p><p style="${secondary}margin:0;">PAID · ${email.pickup ? "Pickup" : "Delivery"} · ${escapeHtml(email.date)}</p></td></tr>
<tr><td style="padding:0 12px;"><table data-kitchen-summary role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border:1px solid #e5d9c9;border-radius:12px;border-spacing:0;"><tr><td><table aria-label="Products to prepare" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-spacing:0;"><colgroup><col><col style="width:30px;"><col style="width:104px;"></colgroup><thead><tr style="background:#F6DFE0;"><th scope="col" style="text-align:left;padding:10px 9px;border-radius:11px 0 0 0;${secondary}">Product</th><th scope="col" style="text-align:center;padding:10px 2px;${secondary}">Qty</th><th scope="col" style="text-align:right;padding:10px 9px;border-radius:0 11px 0 0;${secondary}">Price</th></tr></thead>${cards}</table></td></tr>
<tr><td style="padding:9px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="${secondary}padding:3px 0;">Subtotal</td><td style="text-align:right;font-size:15px;">${escapeHtml(storedSubtotal)}</td></tr><tr><td style="${secondary}padding:3px 0;">${email.pickup ? "Fulfillment fee" : "Delivery fee"}</td><td style="text-align:right;font-size:15px;">${escapeHtml(fee)}</td></tr></table>${financialReview ? warning(review) : ""}</td></tr>
<tr><td style="padding:10px 9px;border-top:1px solid #dbcbb3;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="${secondary}font-size:11px;">Total paid</td><td style="text-align:right;"><h2 aria-label="Total paid: ${paid}" style="margin:0;font-size:23px;line-height:1.2;font-weight:normal;color:#715633;">${paid}</h2></td></tr></table></td></tr></table></td></tr>
<tr><td style="padding:7px 12px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6DFE0;border:1px solid #A28D5B;border-radius:11px;"><tr><td data-kitchen-notes style="padding:9px;"><h2 style="font: bold 12px Arial,Helvetica,sans-serif;margin:0 0 4px;">Customer instructions / allergies</h2><p style="margin:0 0 3px;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;"><strong>Original customer instructions:</strong> ${escapeHtml(email.instructions)}</p><p style="margin:0;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;"><strong>Original delivery notes:</strong> ${escapeHtml(email.deliveryNotes)}</p></td></tr></table></td></tr>
<tr><td style="padding:7px 12px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-radius:11px;background:#F6DFE0;"><tr><td data-kitchen-fulfillment style="padding:9px 10px;width:47%;vertical-align:top;"><p style="${secondary}margin:0 0 3px;">${email.pickup ? "Pickup" : "Delivery"} date</p><p style="margin:0;font-size:15px;">${escapeHtml(email.date)}</p></td><td style="padding:9px 10px;border-left:1px solid #dbcbb3;vertical-align:top;"><p style="${secondary}margin:0 0 3px;">${email.pickup ? "Pickup" : "Delivery"} time</p><p style="margin:0;font-size:15px;">${escapeHtml(email.time)}</p></td></tr></table></td></tr>
<tr><td style="padding:7px 12px 0;"><table data-kitchen-customer role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;background:#f5efe7;border-radius:11px;"><tr><td data-kitchen-address style="width:52%;vertical-align:top;padding:10px 9px;font-size:13px;"><p style="${secondary}margin:0 0 4px;">${email.pickup ? "Pickup location" : "Delivery address"}</p><p style="margin:0 0 3px;">${escapeHtml(email.customer)}</p>${addressHtml}</td><td style="vertical-align:top;padding:10px 9px;border-left:1px solid #dbcbb3;font:12px Arial,Helvetica,sans-serif;">${contacts.map(cellText).join("")}</td></tr></table></td></tr>

<tr><td style="padding:3px 12px 6px;font:12px Arial,Helvetica,sans-serif;">${link ? `<a href="${escapeHtml(link)}" style="display:inline-block;min-height:44px;box-sizing:border-box;padding:12px 0;line-height:20px;color:#27242d;text-decoration:underline;">Open order in Operations (sign-in required)</a>` : warning("Operations link unavailable — open the authenticated dashboard and find this order.")}</td></tr>
</table></td></tr></table></div></body></html>`;
  return { text: text.join("\n"), html };
}
