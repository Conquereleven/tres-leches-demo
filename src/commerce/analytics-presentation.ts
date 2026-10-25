import type {
  AnalyticsReport,
  PeriodReport,
} from "../../server/analytics/contract";
import { safeAdd } from "../../server/analytics/engine";
export type Granularity = "day" | "week" | "month";
/** Presentation buckets of the existing authoritative daily report, never a new ledger. */
export function trendBuckets(
  daily: PeriodReport["daily"],
  granularity: Granularity,
) {
  const buckets = new Map<string, PeriodReport["daily"][number]>();
  for (const row of daily) {
    let key = row.day;
    if (granularity === "month") key = row.day.slice(0, 7) + "-01";
    if (granularity === "week") {
      const d = new Date(row.day + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      key = d.toISOString().slice(0, 10);
    }
    const bucket = buckets.get(key) ?? {
      day: key,
      paidOrders: 0,
      capturedFils: 0,
    };
    bucket.paidOrders = safeAdd(bucket.paidOrders, row.paidOrders);
    bucket.capturedFils = safeAdd(bucket.capturedFils, row.capturedFils);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.day.localeCompare(b.day));
}
export function categoryRanking(products: PeriodReport["products"]) {
  const categories = new Map<
    string | null,
    { category: string | null; units: number; amountFils: number }
  >();
  for (const product of products) {
    const row = categories.get(product.category) ?? {
      category: product.category,
      units: 0,
      amountFils: 0,
    };
    row.units = safeAdd(row.units, product.units);
    row.amountFils = safeAdd(row.amountFils, product.amountFils);
    categories.set(product.category, row);
  }
  return [...categories.values()].sort(
    (a, b) =>
      b.amountFils - a.amountFils ||
      String(a.category).localeCompare(String(b.category)),
  );
}
export function periodComparisons(report: AnalyticsReport) {
  return [
    {
      label: "Confirmed captured volume",
      current: report.current.capturedFils,
      previous: report.previous.capturedFils,
      monetary: true,
    },
    {
      label: "Paid orders",
      current: report.current.paidOrders,
      previous: report.previous.paidOrders,
      monetary: false,
    },
    {
      label: "Average captured order",
      current: report.current.averageFils,
      previous: report.previous.averageFils,
      monetary: true,
    },
  ].map((row) => ({
    ...row,
    change:
      row.current === null || row.previous === null || row.previous === 0
        ? null
        : row.label === "Confirmed captured volume"
          ? report.changePercent
          : Math.round((row.current / row.previous - 1) * 10000) / 100,
  }));
}
