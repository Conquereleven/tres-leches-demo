import type { CommerceLine, PackSnapshot } from "../../shared/pack-composition";
import { z } from "zod";
export const states = [
  "New",
  "Building",
  "Awaiting Location",
  "Minimum Check",
  "Awaiting Payment",
  "Paid",
  "Confirmed",
  "Production",
  "Ready",
  "Out for Delivery",
  "Delivered",
  "Cancelled",
] as const;
export type OrderState = (typeof states)[number];
export const locationSchema = z
  .object({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
  })
  .strict();
export type Location = z.infer<typeof locationSchema>;
export const zoneSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(150),
    aliases: z.array(z.string().min(1).max(150)).max(30),
    minOrderAed: z.number().nonnegative().max(100000).nullable(),
    deliveryFeeAed: z.number().nonnegative().max(10000).nullable(),
    freeDelivery: z.boolean(),
    active: z.boolean(),
    priority: z.number().int().min(0).max(100),
    canonicalIds: z.array(z.string().min(1).max(200)).max(30).optional(),
    polygon: z.array(locationSchema).min(3).optional(),
    review: z.string().optional(),
    version: z.number().int().nonnegative(),
  })
  .strict()
  .refine(
    (z) => !z.freeDelivery || z.deliveryFeeAed === 0,
    "Free delivery requires a zero fee",
  );
export type DeliveryZone = z.infer<typeof zoneSchema>;
export type Audit = {
  at: string;
  actor: string;
  action: string;
  from?: OrderState;
  to?: OrderState;
};
export type Message = {
  id: string;
  direction: "in" | "out";
  text: string;
  at: string;
  status:
    | "received"
    | "queued"
    | "sending"
    | "accepted"
    | "sent"
    | "delivered"
    | "read"
    | "failed"
    | "unknown";
  providerId?: string;
  sentAt?: string;
  agentGuard?: {
    runId: string;
    version: number;
    owner: string | null;
    epoch: number;
    sourceNumberId: string;
  };
  location?: Location;
  translation?: string;
  paymentContext?: { amountAed: string; url: string };
};
export type Conversation = {
  id: string;
  customer: string;
  phone: string;
  sourceNumberId: string;
  sourcePhoneNumber: string;
  assignedAgent: string | null;
  status: "open" | "closed";
  unread: boolean;
  version: number;
  messages: Message[];
  location?: Location;
  address?: string;
  audit: Audit[];
};
export type Line = CommerceLine & { packSnapshot?: PackSnapshot };
export type Quote = {
  zoneId: string | null;
  zoneName: string | null;
  minOrderAed: number | null;
  feeFils: number | null;
  subtotalFils: number;
  totalFils: number | null;
  minimumMet: boolean;
  eligible: boolean;
  reason: string;
  resolutionCode?: "RESOLVED" | "ZONE_REVIEW_REQUIRED";
  zoneVersion: number | null;
};
export type Order = {
  /** Internal immutable reference: payments, provider calls, idempotency, audit. */
  id: string;
  /**
   * Customer-facing sequence (#001). Allocated exactly once, when the order
   * first becomes paid; absent on unpaid orders and on orders paid before the
   * sequence existed. Never used as a key.
   */
  publicOrderNumber?: number;
  conversationId: string;
  state: OrderState;
  version: number;
  lines: Line[];
  catalogSnapshot?: CatalogItem[];
  location?: Location;
  address?: string;
  quote: Quote | null;
  paymentId?: string;
  manualZoneId?: string;
  /** Captured by the website checkout; absent for WhatsApp-built orders. */
  fulfillmentMethod?: "delivery" | "pickup";
  pickup?: { pickupDate: string; preferredTime: string };
  delivery?: DeliveryDetails;
  customerDetails?: {
    /** Captured separately by the website checkout; older orders have neither. */
    firstName?: string;
    lastName?: string;
    email?: string;
    instructions?: string;
    whatsappNumber?: string;
  };
  /** Server-owned storefront identity; historical records may omit it. */
  storefrontProducts?: Record<string, string>;
  /** Billing address confirmed by the customer, exactly as sent to Paymennt. */
  billing?: import("./billing").OrderBilling;
  /** Set exactly once, when the order first becomes paid. */
  paidAt?: string;
  audit: Audit[];
};
export type DeliveryDetails = {
  /** Server-owned evidence; never accepted from checkout input. */
  addressVerification?: "UNVERIFIED" | "VERIFIED";
  addressRef?: string;
  zoneId: string;
  address: string;
  building: string;
  unit?: string;
  /** Customer-requested date, YYYY-MM-DD in Asia/Dubai. */
  date: string;
  /** A configured slot label, or the customer's stated preference. */
  slot: string;
  notes?: string;
};
/**
 * Operations notification outbox. Rows are created only by ORDER_PAID and are
 * delivered by a dispatcher that is a hard no-op while outbound is disabled.
 */
export type OperationsNotification = {
  id: string;
  event: "ORDER_PAID";
  kind: "notify_operations_whatsapp";
  orderId: string;
  publicOrderNumber?: number;
  paymentId: string;
  recipient: { name: string; phone: string };
  message: string;
  status:
    | "pending-whatsapp-delivery"
    | "accepted"
    | "sending"
    | "sent"
    | "delivered"
    | "read"
    | "failed"
    | "suppressed";
  paidAt?: string;
  templateParameters?: string[];
  statusAt?: string;
  acceptedAt?: string;
  attempts: number;
  createdAt: string;
  sentAt?: string;
  providerId?: string;
  lastError?: string;
};
export const customerEvents = [
  "ORDER_PRODUCTION_STARTED",
  "ORDER_READY_FOR_PICKUP",
  "ORDER_OUT_FOR_DELIVERY",
] as const;
export type CustomerEvent = (typeof customerEvents)[number];
/**
 * Customer email outbox. One row per (order, event), created in the same
 * transaction as the state transition that caused it. The rendered email is
 * frozen at that moment so a later retry sends exactly what was decided.
 */
export type CustomerNotification = {
  /** Event ID; also the provider idempotency key. */
  id: string;
  event: CustomerEvent;
  channel: "email";
  orderId: string;
  publicOrderNumber?: number;
  recipient: string;
  subject: string;
  body: string;
  /**
   * pending: recorded, not yet handed to a provider (also the resting state
   * while no provider is configured). sending: claimed by a dispatcher.
   */
  status: "pending" | "sending" | "sent" | "failed";
  attemptCount: number;
  createdAt: string;
  /** Which provider handled the last attempt; absent until one is tried. */
  provider?: string;
  providerMessageId?: string;
  lastAttemptAt?: string;
  sentAt?: string;
  lastError?: string;
};
export type OperationsEmailNotification = Omit<
  CustomerNotification,
  "event"
> & {
  event: "ORDER_PAID";
  paymentId: string;
};
export type Payment = {
  supersededAt?: string;
  checkoutFlow?: "web";
  webReturnUrl?: string;
  directAttempt?: "ready" | "submitted" | "resolved" | "unknown";
  providerDiagnostics?: Array<{
    orderId: string;
    requestId: string;
    endpointClass: "payment/debit" | "payment/get" | "other";
    classification:
      | "PROVIDER_RESPONSE_ACCEPTED"
      | "PROVIDER_HTTP_ERROR"
      | "PROVIDER_PAYMENT_REJECTED"
      | "PROVIDER_TIMEOUT"
      | "PROVIDER_NETWORK_ERROR"
      | "PROVIDER_MALFORMED_RESPONSE";
    providerHttpStatus?: number;
    safeProviderCode?: string;
    safeProviderMessage?: string;
    providerPaymentId?: string;
    providerStatus?: string;
    redirectUrlPresent: boolean;
    at: string;
    latencyMs: number;
    attemptState: "submitted" | "resolved" | "unknown";
  }>;
  id: string;
  orderId: string;
  amountFils: number;
  currency: "AED";
  status:
    | "creating"
    | "pending"
    | "authorized"
    | "pending_confirmation"
    | "paid"
    | "failed"
    | "expired"
    | "cancelled"
    | "refunded"
    | "partially_refunded"
    | "chargeback";
  url?: string;
  providerReference?: string;
  provider?: "mock" | "paymennt";
  providerCheckoutId?: string;
  providerRawStatus?: string;
  paidAt?: string;
  lastReconciledAt?: string;
  transactionId?: string;
  createdAt: string;
  updatedAt: string;
  timeline: Audit[];
};
export type Job = {
  correlationId?: string;
  id: string;
  kind: "message" | "payment";
  entityId: string;
  status: "pending" | "processing" | "done" | "failed" | "unknown";
  attempts: number;
  nextAt: number;
  leaseUntil?: number;
  lastError?: string;
};
export type InboundDelivery = {
  id: string;
  event: unknown;
  hash: string;
  status: "pending" | "done" | "failed";
  attempts: number;
  nextAt: number;
};
export type CatalogItem = {
  id: string;
  name: string;
  category?: string;
  description?: string;
  priceFils: number;
  active?: boolean;
  availability?: "available" | "unavailable";
  image?: string;
  whatsappPrefill?: string;
};
export type NotificationReceipt = {
  id: string;
  checkoutId: string;
  status: string;
  receivedAt: string;
  completedAt?: string;
  /**
   * `external`: the provider confirmed this checkout was created outside this
   * system (another channel on the same merchant account). Acknowledged and
   * closed without touching any order or payment.
   */
  outcome?: "external";
  nextAt: number;
  attempts: number;
};
export type State = {
  /** Last public order number issued. Only ever increases. */
  orderNumberSequence?: number;
  customerNotifications?: CustomerNotification[];
  operationsEmailNotifications?: OperationsEmailNotification[];
  operationsNotifications?: OperationsNotification[];
  webCheckouts?: Record<
    string,
    {
      inputHash: string;
      orderId: string;
      createdAt: string;
      cartHash?: string;
      supersededAt?: string;
      replacements?: Record<string, string>;
    }
  >;
  ai?: import("../agents/model").AgentData;
  catalog?: CatalogItem[];
  catalogFoundation?: import("../catalog/contract").CatalogFoundation;
  /** Product Hub V2 editing session: draft, history and command receipts. Never a price authority. */
  productHub?: import("../catalog/product-hub").HubState;
  paymentNotifications?: NotificationReceipt[];
  uatScenarios?: {
    id: number;
    title: string;
    status: "BLOCKED";
    reason: string;
  }[];
  inboundDeliveries?: InboundDelivery[];
  zones: DeliveryZone[];
  conversations: Conversation[];
  orders: Order[];
  payments: Payment[];
  jobs: Job[];
  events: Record<string, string>;
  commands: Record<string, { hash: string; result: unknown }>;
  audit: Audit[];
};
export const catalog: { id: string; name: string; priceFils: number }[] = [];
export const numbers = ["wa1", "wa2", "wa3"].map((id) => ({
  id,
  label: id.toUpperCase(),
  phone: "NOT CONFIGURED",
}));
export type Actor = {
  id: string;
  role: "admin" | "manager" | "operator" | "agent";
};
export class DomainError extends Error {
  constructor(
    public status: number,
    message: string,
    public publicCode?: string,
  ) {
    super(message);
  }
}
export function requireThat(
  value: unknown,
  message: string,
  status = 409,
): asserts value {
  if (!value) throw new DomainError(status, message);
}
export const now = () => new Date().toISOString();
