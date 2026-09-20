/**
 * Single source of customer-facing business facts for the footer, contact and
 * policy pages. Only verified values are filled in. `null` means the owner has
 * not supplied the fact yet: pages omit it rather than guessing, and the build
 * lists it (see `pendingBusinessFacts`). Never put secrets or provider
 * credentials here — everything in this file is public.
 */
import { destinations, whatsappUrl } from "./content";

export type DeliveryBand = { minOrderAed: number; areas: string[] };

export const business = {
  /** Customer-facing brand used across the approved site. */
  tradingName: "Pastelerías 3L",
  brandDescription: "Tres Leches cakes, cake jars and bakery",
  heritage: "Mexico City since 1982",
  /** OWNER INPUT: registered legal entity exactly as on the trade licence. */
  legalName: null as string | null,
  /** OWNER INPUT: trade licence number and issuing authority, if to be shown. */
  tradeLicence: null as string | null,
  /** OWNER INPUT: registered/business address in the UAE. */
  address: null as string | null,
  /** Verified: the site and delivery zones serve Dubai only. */
  city: "Dubai",
  country: "United Arab Emirates",
  /** OWNER INPUT: customer-service email. */
  email: null as string | null,
  /** OWNER INPUT: customer-service phone in E.164 (e.g. +9715XXXXXXXX). */
  phone: null as string | null,
  /** Same source as every ORDER ON WHATSAPP button (content.ts). */
  whatsapp: destinations.whatsapp,
  /** OWNER INPUT: e.g. "Daily, 9:00 am – 9:00 pm (GST)". */
  supportHours: null as string | null,
  currency: "AED",
  /** Hosted payment page used by the existing checkout integration. */
  paymentProcessor: "Paymennt",
  policiesUpdated: "18 September 2026",
};

/**
 * Commercial decisions the code does not determine. Each `null` renders a
 * neutral, accurate sentence (review by our team) instead of an invented rule.
 */
export const policyDecisions = {
  /** OWNER INPUT: e.g. "up to 24 hours before the agreed delivery time". */
  paidCancellationWindow: null as string | null,
  /** OWNER INPUT: refund amount for an approved paid cancellation, e.g. "a full refund". */
  paidCancellationRefund: null as string | null,
  /** OWNER INPUT: deadline to report damaged/incorrect/missing items, e.g. "within 2 hours of delivery". */
  issueReportWindow: null as string | null,
  /** OWNER INPUT: minimum notice for orders / custom cakes, e.g. "48 hours for custom cakes". */
  orderLeadTime: null as string | null,
  /** OWNER INPUT: delivery days and hours, e.g. "Daily, 10:00 am – 8:00 pm". */
  deliveryHours: null as string | null,
  /** OWNER INPUT: what happens after a failed delivery (redelivery charge, refund). */
  failedDeliveryOutcome: null as string | null,
};

/**
 * Transcribed from docs/sources/delivery-minimums.jpeg and kept identical to
 * the operational seed in server/domain/zones.ts (enforced by a unit test).
 */
export const deliveryBands: DeliveryBand[] = [
  {
    minOrderAed: 30,
    areas: [
      "JLT Clusters O, P, Q, R, S, T, U, V, W, X, Y",
      "One JLT",
      "Mazaya",
      "Taj Residence",
    ],
  },
  {
    minOrderAed: 50,
    areas: [
      "Jumeirah Islands",
      "The Gardens",
      "Discovery Gardens",
      "Springs",
      "Meadows",
      "Emirates Hills",
      "The Lakes",
      "The Greens",
      "Jumeirah Park",
      "Jumeirah Heights",
      "JVT",
      "Al Furjan",
      "Jebel Ali 2",
      "Jebel Ali Village",
      "The Hills",
      "Vida The Hills",
      "JBR",
      "Dubai Marina",
    ],
  },
  {
    minOrderAed: 100,
    areas: [
      "JVC",
      "Internet City",
      "Media City",
      "Barsha Heights",
      "Palm Jumeirah (Shoreline, Golden Mile)",
      "Al Barsha 1",
      "Knowledge Village",
      "Knowledge Park",
      "Al Sufouh 2",
      "Secret Beach",
    ],
  },
  {
    minOrderAed: 150,
    areas: [
      "Dubai Hills",
      "Al Quoz",
      "IMPZ (Dubai Production City)",
      "Al Barsha South",
      "Jumeirah Golf Estates",
      "Motor City",
      "Sports City",
      "Jebel Ali",
      "Al Barsha 2",
      "Al Barsha 3",
      "Al Sufouh 1",
      "Umm Suqeim 3",
      "Victory Heights",
      "Palm Jumeirah (West & East Crescent)",
      "Studio City",
    ],
  },
  {
    minOrderAed: 200,
    areas: [
      "Al Wasl Road",
      "Al Safa",
      "Arabian Ranches",
      "Umm Suqeim 2",
      "Umm Suqeim 1",
      "Al Manara",
      "JAFZA",
      "DIP",
      "Green Community DIP",
    ],
  },
  { minOrderAed: 250, areas: ["Damac Hills", "Sustainable City"] },
  {
    minOrderAed: 300,
    areas: [
      "Jumeirah 1, 2 and 3",
      "Satwa",
      "Deira",
      "Downtown",
      "Jebel Ali Downtown",
      "Kite Beach",
      "Festival City",
      "Dubai South",
      "Remraam",
      "Expo Site",
      "D3 District",
      "DIFC",
      "Nad Al Sheba",
      "Mudon",
      "Port Rashid",
      "Al Badaa",
      "Villanova",
      "Burj Al Arab",
    ],
  },
];
/** Confirmed in TL-25: JLT Clusters B, C and D — AED 30 minimum, free delivery. */
export const freeDeliveryAreas = {
  minOrderAed: 30,
  areas: ["JLT Clusters B, C and D"],
};

export const legalEntityLabel = () =>
  business.legalName
    ? `${business.legalName}, trading as ${business.tradingName}`
    : business.tradingName;

export const phoneHref = (phone: string) => `tel:${phone.replace(/\s+/g, "")}`;

export type ContactChannel = {
  kind: "whatsapp" | "phone" | "email";
  label: string;
  value: string;
  href: string;
};
export function contactChannels(): ContactChannel[] {
  const channels: ContactChannel[] = [];
  const wa = whatsappUrl(
    business.whatsapp,
    "Hello 3L, I have a question about my order.",
  );
  if (wa && business.whatsapp)
    channels.push({
      kind: "whatsapp",
      label: "WhatsApp",
      value: business.whatsapp,
      href: wa,
    });
  if (business.phone)
    channels.push({
      kind: "phone",
      label: "Phone",
      value: business.phone,
      href: phoneHref(business.phone),
    });
  if (business.email)
    channels.push({
      kind: "email",
      label: "Email",
      value: business.email,
      href: `mailto:${business.email}`,
    });
  return channels;
}

/** Facts still required from the owner; printed by the build, never rendered. */
export function pendingBusinessFacts(): string[] {
  const missing: string[] = [];
  for (const key of [
    "legalName",
    "address",
    "email",
    "phone",
    "whatsapp",
    "supportHours",
  ] as const)
    if (!business[key]) missing.push(`business.${key}`);
  for (const [key, value] of Object.entries(policyDecisions))
    if (!value) missing.push(`policyDecisions.${key}`);
  return missing;
}

export const policyRoutes = [
  { path: "/terms", label: "Terms & Conditions" },
  { path: "/privacy", label: "Privacy Policy" },
  { path: "/refund-policy", label: "Refund & Cancellation" },
  { path: "/delivery-policy", label: "Delivery Policy" },
  { path: "/contact", label: "Contact Us" },
] as const;
export type PolicyPath = (typeof policyRoutes)[number]["path"];
export const isPolicyPath = (path: string): path is PolicyPath =>
  policyRoutes.some((r) => r.path === path.replace(/\/+$/, ""));
