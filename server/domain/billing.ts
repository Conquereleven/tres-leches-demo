/**
 * Billing and delivery addresses for Paymennt direct payments.
 *
 * The customer either confirms "billing address is the same as delivery
 * address" (the default) or enters a separate billing address. Either way the
 * result must pass the adapter's CheckoutAddress schema before an order can be
 * created or a payment attempted — nothing is sent to Paymennt as null, and no
 * address field is invented.
 */
import { z } from "zod";
import {
  paymenntAddressSchema,
  type PaymenntAddress,
} from "../adapters/paymennt";
import { DomainError, type DeliveryDetails } from "./model";

/**
 * 3L delivers only inside its configured Dubai delivery zones, so a confirmed
 * delivery address is in Dubai, United Arab Emirates. Shown to the customer on
 * the review screen before payment.
 */
export const SERVICE_AREA = { city: "Dubai", country: "AE" } as const;

const text = (max: number) => z.string().trim().min(1).max(max);
export const billingInputSchema = z.discriminatedUnion("sameAsDelivery", [
  z.object({ sameAsDelivery: z.literal(true) }).strict(),
  z
    .object({
      sameAsDelivery: z.literal(false),
      name: text(100),
      address1: text(200),
      address2: text(300).optional(),
      city: text(100),
      state: text(100).optional(),
      zip: text(20).optional(),
      country: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{2}$/),
    })
    .strict(),
]);
export type BillingInput = z.infer<typeof billingInputSchema>;
/** What the order keeps: the customer's choice and the exact address sent. */
export type OrderBilling = {
  sameAsDelivery: boolean;
  address: PaymenntAddress;
};

function checked(address: unknown, message: string): PaymenntAddress {
  const parsed = paymenntAddressSchema.safeParse(address);
  if (!parsed.success)
    throw new DomainError(422, message, "BILLING_ADDRESS_INVALID");
  return parsed.data;
}

export function toPaymenntDeliveryAddress(
  name: string,
  delivery: DeliveryDetails,
): PaymenntAddress {
  return checked(
    {
      name,
      address1: [delivery.unit && `Unit ${delivery.unit}`, delivery.building]
        .filter(Boolean)
        .join(", "),
      address2: delivery.address,
      city: SERVICE_AREA.city,
      country: SERVICE_AREA.country,
    },
    "Please complete your delivery address.",
  );
}

export function toPaymenntBillingAddress(input: {
  billing: BillingInput | undefined;
  name: string;
  delivery: DeliveryDetails | undefined;
}): OrderBilling {
  const { billing, delivery } = input;
  if (!billing)
    throw new DomainError(
      422,
      "Please confirm your billing address.",
      "BILLING_ADDRESS_REQUIRED",
    );
  if (billing.sameAsDelivery) {
    if (!delivery)
      throw new DomainError(
        422,
        "Please complete your delivery address.",
        "BILLING_ADDRESS_REQUIRED",
      );
    return {
      sameAsDelivery: true,
      address: toPaymenntDeliveryAddress(input.name, delivery),
    };
  }
  const { sameAsDelivery: _same, ...address } = billing;
  return {
    sameAsDelivery: false,
    address: checked(address, "Please complete your billing address."),
  };
}

/** The stored billing address, re-validated before every payment attempt. */
export function orderBillingAddress(billing: OrderBilling | undefined) {
  if (!billing)
    throw new DomainError(
      409,
      "Please complete your delivery and billing details.",
      "BILLING_ADDRESS_REQUIRED",
    );
  return checked(billing.address, "Please complete your billing address.");
}
