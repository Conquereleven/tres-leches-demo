import { acceptedLinePrice } from "../../shared/pack-pricing";
import {
  distinctLines,
  validPackSnapshot,
} from "../../shared/pack-composition";
import { requireThat, type Order, type Payment } from "./model";

/** Validate the commercial record committed by requestPayment, never live catalog. */
export function frozenCheckout(order: Order, payment: Payment) {
  const held =
    "Frozen checkout incomplete or inconsistent; payment review required";
  const quote = order.quote;
  requireThat(
    payment.orderId === order.id &&
      order.paymentId === payment.id &&
      payment.currency === "AED" &&
      quote?.eligible &&
      order.lines.length > 0 &&
      order.catalogSnapshot &&
      distinctLines(order.lines) &&
      order.lines.every(validPackSnapshot),
    held,
    409,
  );
  const items = order.lines.map((line) => {
    const matches = order.catalogSnapshot!.filter(
      (p) => p.id === line.productId,
    );
    const product = matches[0];
    requireThat(
      matches.length === 1 &&
        product &&
        product.name.trim() &&
        Number.isSafeInteger(product.priceFils) &&
        product.priceFils > 0 &&
        Number.isSafeInteger(line.quantity) &&
        line.quantity > 0,
      held,
      409,
    );
    const unitPriceFils = acceptedLinePrice(line, product.priceFils);
    requireThat(unitPriceFils !== null, held, 409);
    return {
      sku: product.id,
      ...(line.color ? { color: line.color } : {}),
      ...(line.packSnapshot ? { packSnapshot: line.packSnapshot } : {}),
      ...(line.composition
        ? { composition: line.composition, packSnapshot: line.packSnapshot }
        : {}),
      name: product.name,
      quantity: line.quantity,
      unitPriceFils,
    };
  });
  const subtotal = items.reduce((n, i) => n + i.quantity * i.unitPriceFils, 0);
  requireThat(
    Number.isSafeInteger(subtotal) &&
      subtotal === quote.subtotalFils &&
      Number.isSafeInteger(quote.feeFils) &&
      quote.feeFils! >= 0 &&
      Number.isSafeInteger(quote.totalFils) &&
      quote.totalFils === subtotal + quote.feeFils! &&
      payment.amountFils === quote.totalFils,
    held,
    409,
  );
  return {
    items,
    subtotalFils: subtotal,
    feeFils: quote.feeFils!,
    totalFils: quote.totalFils!,
  };
}
