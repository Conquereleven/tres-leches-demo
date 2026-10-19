/**
 * Customer-facing, responsive transactional email HTML.
 *
 * Pure rendering only: no provider access, no URLs, no checkout state changes.
 * Keep the English text fallback in customer-notifications.ts.
 */
import { PICKUP_LOCATION } from "../../shared/pickup-location";
import type { CustomerEvent } from "./model";

type CustomerHtmlInput = {
  event: CustomerEvent;
  first: string;
  reference: string;
  when: string;
  pickup: boolean;
  zoneName?: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const blush = "#F6DFE0";
const gold = "#A28D5B";
const ink = "#27242D";
const raspberry = "#A93C68";
const secondary = "#5A565F";

export function renderCustomerEmailHtml(input: CustomerHtmlInput): string {
  const { event, when, pickup } = input;
  const reference = escapeHtml(input.reference);
  const first = escapeHtml(input.first);
  const zone = input.zoneName ? escapeHtml(input.zoneName) : "";

  const prepared = event === "ORDER_PRODUCTION_STARTED";
  const ready = event === "ORDER_READY_FOR_PICKUP";
  const label = prepared
    ? "PREPARING YOUR ORDER"
    : ready
      ? "READY FOR PICKUP"
      : "OUT FOR DELIVERY";
  const heading = prepared
    ? "We're preparing your order."
    : ready
      ? "Your order is ready!"
      : "Your order is on its way.";
  const description = prepared
    ? "Good news! Our team is preparing your order with care."
    : ready
      ? "Your treats are ready for pickup at our store."
      : "Your 3L delivery is now on its way.";
  const next = prepared
    ? "We'll let you know as soon as it's ready."
    : ready
      ? "We look forward to seeing you."
      : "We'll update you once your order has been delivered.";
  const summary = prepared
    ? "Your order is being prepared"
    : ready
      ? "Your order is ready for pickup"
      : "Your order is on the way";

  const details: string[] = [
    '<tr><td style="padding:0 0 5px;font-size:12px;letter-spacing:1px;color:' +
      secondary +
      ';font-weight:bold;">ORDER NUMBER</td></tr>',
    '<tr><td style="padding:0 0 16px;font-size:21px;color:' +
      ink +
      ';font-weight:bold;">' +
      reference +
      "</td></tr>",
  ];
  if (when && event !== "ORDER_OUT_FOR_DELIVERY") {
    details.push(
      '<tr><td style="padding:0 0 5px;font-size:12px;letter-spacing:1px;color:' +
        secondary +
        ';font-weight:bold;">' +
        (pickup ? "PICKUP" : "DELIVERY") +
        "</td></tr>",
      '<tr><td style="padding:0 0 16px;font-size:16px;line-height:1.6;color:' +
        ink +
        ';">' +
        escapeHtml(when) +
        "</td></tr>",
    );
  }
  if (ready) {
    details.push(
      '<tr><td style="padding:0 0 5px;font-size:12px;letter-spacing:1px;color:' +
        secondary +
        ';font-weight:bold;">PICKUP LOCATION</td></tr>',
      '<tr><td style="padding:0;font-size:15px;line-height:1.6;color:' +
        ink +
        ';">' +
        escapeHtml(PICKUP_LOCATION.name) +
        "<br>" +
        PICKUP_LOCATION.lines.map(escapeHtml).join("<br>") +
        "</td></tr>",
    );
  }
  if (!prepared && !ready && zone) {
    details.push(
      '<tr><td style="padding:0 0 5px;font-size:12px;letter-spacing:1px;color:' +
        secondary +
        ';font-weight:bold;">DELIVERY AREA</td></tr>',
      '<tr><td style="padding:0;font-size:16px;line-height:1.6;color:' +
        ink +
        ';">' +
        zone +
        "</td></tr>",
    );
  }

  return [
    '<!doctype html><html lang="en" dir="ltr">',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">',
    "<title>3L Pastelerías · " + escapeHtml(summary) + "</title>",
    '<style>@media only screen and (max-width:600px){.mail-pad{padding:16px 10px !important}.inner-pad{padding:25px 20px !important}.mail-heading{font-size:28px !important}}</style>',
    "</head>",
    '<body style="margin:0;padding:0;background:#F9F6F2;color:' + ink + ';font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">',
    '<div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;max-height:0;overflow:hidden;font-size:1px;line-height:1px;">' +
      escapeHtml(summary) +
      " · " +
      reference +
      "</div>",
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background:#F9F6F2;">',
    '<tr><td class="mail-pad" align="center" style="padding:32px 16px;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;width:100%;border-collapse:separate;border-spacing:0;">',
    '<tr><td class="inner-pad" style="padding:28px 36px;background:' +
      blush +
      ';border-radius:16px 16px 0 0;text-align:left;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="vertical-align:middle;">',
    '<span style="color:' +
      ink +
      ';font-size:29px;font-weight:bold;letter-spacing:-1px;">3L</span>',
    '<span style="color:' +
      ink +
      ';font-size:15px;font-weight:bold;letter-spacing:1px;padding-left:9px;">PASTELERÍAS</span>',
    '</td></tr><tr><td style="padding-top:5px;color:' +
      secondary +
      ';font-size:10px;letter-spacing:1.6px;">MEXICO CITY SINCE 1982</td></tr></table>',
    "</td></tr>",
    '<tr><td class="inner-pad" style="padding:38px 36px 32px;background:#FFFFFF;text-align:left;">',
    '<p style="margin:0 0 14px;color:' +
      raspberry +
      ';font-size:12px;font-weight:bold;letter-spacing:1.2px;">' +
      label +
      "</p>",
    '<h1 class="mail-heading" style="margin:0 0 20px;color:' +
      ink +
      ';font-size:34px;line-height:1.2;font-weight:bold;">' +
      escapeHtml(heading) +
      "</h1>",
    '<p style="margin:0 0 10px;color:' +
      ink +
      ';font-size:17px;line-height:1.6;">Hi ' +
      first +
      ",</p>",
    '<p style="margin:0 0 24px;color:' +
      ink +
      ';font-size:16px;line-height:1.7;">' +
      escapeHtml(description) +
      "</p>",
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:separate;background:#F9F7F4;border-radius:10px;">',
    '<tr><td style="padding:24px 23px;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">',
    details.join(""),
    "</table></td></tr></table>",
    '<p style="margin:25px 0 0;color:' +
      secondary +
      ';font-size:15px;line-height:1.6;">' +
      escapeHtml(next) +
      "</p>",
    "</td></tr>",
    '<tr><td style="padding:0;background:' + gold + ';height:4px;line-height:4px;font-size:1px;">&nbsp;</td></tr>',
    '<tr><td style="padding:24px;background:#FFFFFF;border-radius:0 0 16px 16px;text-align:center;">',
    '<p style="margin:0;color:' +
      ink +
      ';font-size:13px;font-weight:bold;">3L Pastelerías</p>',
    '<p style="margin:5px 0 0;color:' +
      secondary +
      ';font-size:12px;">Dubai, United Arab Emirates</p>',
    "</td></tr>",
    "</table></td></tr></table></body></html>",
  ].join("");
}
