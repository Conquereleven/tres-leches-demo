/** Framework-independent CornerTech reporting contracts. No 3L State or customer data. */
export type ReportingLine = {
  sku: string;
  name: string;
  category: string | null;
  quantity: number;
  unitFils: number;
};
export type CaptureFact = {
  day: string;
  amountFils: number;
  state: string;
  fulfillment: string;
  paymentState: string;
  lines: ReportingLine[] | null;
  feeFils: number | null;
};
export type ReportingFacts = {
  captures: CaptureFact[];
  attempts: { day: string; status: string }[];
  issues: Record<string, number>;
  source: {
    tenant: string;
    system: string;
    currency: "AED";
    timezone: "Asia/Dubai";
  };
};
export type ReportingSource = { readFacts(): ReportingFacts };
export type ReportRange = { from: string; to: string };
export type ProductReport = {
  sku: string;
  name: string;
  category: string | null;
  units: number;
  amountFils: number;
};
export type PeriodReport = {
  paidOrders: number;
  capturedFils: number;
  averageFils: number | null;
  units: number | null;
  productFils: number;
  feeFils: number;
  unallocatedOrders: number;
  unallocatedFils: number;
  adjustments: Record<string, number>;
  daily: { day: string; paidOrders: number; capturedFils: number }[];
  products: ProductReport[];
  states: Record<string, number>;
  fulfillment: Record<string, number>;
  attempts: Record<string, number>;
};
export type AnalyticsReport = {
  version: 1;
  generatedAt: string;
  source: ReportingFacts["source"];
  range: ReportRange;
  previousRange: ReportRange;
  current: PeriodReport;
  previous: PeriodReport;
  changePercent: number | null;
  issues: Record<string, number>;
  quality: "reliable" | "partial";
  limitations: string[];
};
