import type { State, Payment } from "../domain/model";
import { frozenCheckout } from "../domain/frozen-checkout";
import type { ReportingFacts, ReportingSource } from "./contract";
import { dubaiDay } from "./engine";
function isTestCheckout(url: string | undefined) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      /(^|\.)(test|sandbox)(\.|$)/i.test(host)
    );
  } catch {
    return true;
  }
}
const settled = new Set([
  "paid",
  "refunded",
  "partially_refunded",
  "chargeback",
]);
/** Only the adapter sees 3L records. Never return customer/order/provider identifiers. */
export class ThreeLReportingSource implements ReportingSource {
  constructor(private read: () => State) {}
  readFacts(): ReportingFacts {
    const s = this.read();
    const facts: ReportingFacts = {
      captures: [],
      attempts: [],
      issues: {},
      source: {
        tenant: "3l",
        system: "3l-sqlite",
        currency: "AED",
        timezone: "Asia/Dubai",
      },
    };
    const issue = (key: string) => {
      facts.issues[key] = (facts.issues[key] ?? 0) + 1;
    };
    const orders = new Map(s.orders.map((o) => [o.id, o]));
    const ambiguousOrders = new Set<string>();
    const seenOrders = new Set<string>();
    for (const o of s.orders) {
      if (seenOrders.has(o.id)) ambiguousOrders.add(o.id);
      seenOrders.add(o.id);
    }
    const payments = new Map<string, Payment>();
    const conflicts = new Set<string>();
    for (const p of s.payments) {
      const old = payments.get(p.id);
      if (old) {
        issue("duplicate_payment_records");
        if (JSON.stringify(old) !== JSON.stringify(p)) conflicts.add(p.id);
      } else payments.set(p.id, p);
    }
    const eligible: Payment[] = [];
    for (const p of payments.values()) {
      if (p.provider !== "paymennt" || isTestCheckout(p.url)) {
        issue("excluded_mock_test_or_unknown_provider");
        continue;
      }
      const order = orders.get(p.orderId);
      if (!order || conflicts.has(p.id) || ambiguousOrders.has(p.orderId)) {
        issue("ambiguous_or_missing_record");
        continue;
      }
      if (!settled.has(p.status)) {
        const day = dubaiDay(p.createdAt);
        if (day) facts.attempts.push({ day, status: p.status });
        else issue("invalid_attempt_date");
        continue;
      }
      if (
        !Number.isSafeInteger(p.amountFils) ||
        p.amountFils <= 0 ||
        p.currency !== "AED" ||
        !p.lastReconciledAt ||
        !dubaiDay(p.lastReconciledAt) ||
        !(p.providerCheckoutId || p.providerReference)
      ) {
        issue("capture_missing_verification");
        continue;
      }
      if (!dubaiDay(p.paidAt) && !dubaiDay(order.paidAt)) {
        issue("capture_missing_paid_timestamp");
        continue;
      }
      eligible.push(p);
    }
    const counts = new Map<string, number>(),
      references = new Map<string, number>();
    for (const p of eligible) {
      counts.set(p.orderId, (counts.get(p.orderId) ?? 0) + 1);
      const ref = p.providerCheckoutId ?? p.providerReference!;
      references.set(ref, (references.get(ref) ?? 0) + 1);
    }
    for (const p of eligible) {
      if (
        counts.get(p.orderId) !== 1 ||
        references.get(p.providerCheckoutId ?? p.providerReference!) !== 1
      ) {
        issue("multiple_or_reused_capture_requires_review");
        continue;
      }
      if (p.status !== "paid") issue("adjustment_amount_unavailable");
      const o = orders.get(p.orderId)!;
      const day = dubaiDay(p.paidAt) ?? dubaiDay(o.paidAt)!;
      if (!dubaiDay(p.paidAt)) issue("order_paid_timestamp_fallback");
      let lines: ReportingFacts["captures"][number]["lines"] = null;
      let feeFils: number | null = null;
      try {
        const frozen = frozenCheckout(o, p);
        lines = frozen.items.map((l) => {
          const stored = o.catalogSnapshot!.find((x) => x.id === l.sku)!;
          return {
            sku: l.sku,
            name: l.name,
            category: stored.category?.trim() || null,
            quantity: l.quantity,
            unitFils: l.unitPriceFils,
          };
        });
        feeFils = frozen.feeFils;
      } catch {
        issue("inconsistent_or_missing_financial_snapshot");
      }
      facts.captures.push({
        day,
        amountFils: p.amountFils,
        state: o.state,
        fulfillment: o.fulfillmentMethod ?? "unknown",
        paymentState: p.status,
        lines,
        feeFils,
      });
    }
    return facts;
  }
}
