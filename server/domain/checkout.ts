import type { Payment } from "./model";
export type AuthoritativeCheckout = {
  checkoutId: string;
  requestId: string;
  orderId: string;
  amountFils: number;
  currency: string;
  status: Payment["status"];
  rawStatus: string;
  url?: string;
};
