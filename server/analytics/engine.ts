import type {
  AnalyticsReport,
  PeriodReport,
  ReportRange,
  ReportingFacts,
} from "./contract";
const DAY = 86400000;
export function dubaiDay(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    return null;
  try {
    date(value.slice(0, 10));
  } catch {
    return null;
  }
  const at = Date.parse(value);
  return Number.isFinite(at)
    ? new Date(at + 4 * 3600000).toISOString().slice(0, 10)
    : null;
}
function date(value: string) {
  const ms = Date.parse(value + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(ms) ||
    new Date(ms).toISOString().slice(0, 10) !== value
  )
    throw new Error("Invalid reporting date");
  return ms;
}
export function reportRange(from: string, to: string): ReportRange {
  const days = (date(to) - date(from)) / DAY + 1;
  if (days < 1 || days > 366)
    throw new Error("Reporting range must be 1–366 days");
  return { from, to };
}
export function addDays(value: string, days: number) {
  return new Date(date(value) + days * DAY).toISOString().slice(0, 10);
}
export function safeAdd(a: number, b: number) {
  const n = a + b;
  if (!Number.isSafeInteger(n))
    throw new Error("Reporting total exceeds safe integer precision");
  return n;
}
function period(facts: ReportingFacts, range: ReportRange): PeriodReport {
  const r: PeriodReport = {
    paidOrders: 0,
    capturedFils: 0,
    averageFils: null,
    units: null,
    productFils: 0,
    feeFils: 0,
    unallocatedOrders: 0,
    unallocatedFils: 0,
    adjustments: Object.create(null) as Record<string, number>,
    daily: [],
    products: [],
    states: Object.create(null) as Record<string, number>,
    fulfillment: Object.create(null) as Record<string, number>,
    attempts: Object.create(null) as Record<string, number>,
  };
  const days = new Map<string, PeriodReport["daily"][number]>();
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
    const row = { day: d, paidOrders: 0, capturedFils: 0 };
    days.set(d, row);
    r.daily.push(row);
  }
  const products = new Map<string, PeriodReport["products"][number]>();
  const count = (map: Record<string, number>, key: string) => {
    map[key] = safeAdd(map[key] ?? 0, 1);
  };
  for (const f of facts.captures) {
    const d = days.get(f.day);
    if (!d) continue;
    r.paidOrders++;
    r.capturedFils = safeAdd(r.capturedFils, f.amountFils);
    d.paidOrders++;
    d.capturedFils = safeAdd(d.capturedFils, f.amountFils);
    count(r.states, f.state);
    count(r.fulfillment, f.fulfillment);
    if (f.paymentState !== "paid") count(r.adjustments, f.paymentState);
    if (!f.lines) {
      r.unallocatedOrders++;
      r.unallocatedFils = safeAdd(r.unallocatedFils, f.amountFils);
      continue;
    }
    r.units ??= 0;
    r.feeFils = safeAdd(r.feeFils, f.feeFils!);
    for (const l of f.lines) {
      const amount = l.quantity * l.unitFils;
      if (!Number.isSafeInteger(amount)) throw new Error("Invalid allocation");
      r.units = safeAdd(r.units, l.quantity);
      r.productFils = safeAdd(r.productFils, amount);
      const key = JSON.stringify([l.sku, l.name, l.category]);
      const p = products.get(key) ?? {
        sku: l.sku,
        name: l.name,
        category: l.category,
        units: 0,
        amountFils: 0,
      };
      p.units = safeAdd(p.units, l.quantity);
      p.amountFils = safeAdd(p.amountFils, amount);
      products.set(key, p);
    }
  }
  for (const a of facts.attempts)
    if (days.has(a.day)) count(r.attempts, a.status);
  r.averageFils = r.paidOrders
    ? Math.round(r.capturedFils / r.paidOrders)
    : null;
  r.products = [...products.values()].sort(
    (a, b) =>
      b.amountFils - a.amountFils ||
      a.sku.localeCompare(b.sku) ||
      a.name.localeCompare(b.name),
  );
  return r;
}
export function calculateReport(
  facts: ReportingFacts,
  input: ReportRange,
  now = new Date(),
): AnalyticsReport {
  const range = reportRange(input.from, input.to),
    length = (date(range.to) - date(range.from)) / DAY + 1;
  const previousRange = {
    from: addDays(range.from, -length),
    to: addDays(range.from, -1),
  };
  const current = period(facts, range),
    previous = period(facts, previousRange);
  return {
    version: 1,
    generatedAt: now.toISOString(),
    source: facts.source,
    range,
    previousRange,
    current,
    previous,
    changePercent: previous.capturedFils
      ? Math.round((current.capturedFils / previous.capturedFils - 1) * 10000) /
        100
      : null,
    issues: facts.issues,
    qualityScope: "financial_consistency",
    provenance: "unverified",
    quality:
      Object.values(facts.issues).some(Boolean) || current.unallocatedOrders > 0
        ? "partial"
        : "internally_consistent",
    limitations: [
      "Captured volume is not net sales, settlement or profit.",
      "Refund and dispute amounts, conversion, repeat customers and preparation duration are unavailable.",
      "State breakdown reflects current fulfillment state of the paid-date cohort.",
      "Historical rows have no explicit LIVE/TEST marker; unknown provenance cannot be independently verified.",
      "Data-quality counts cover the complete source snapshot, including records outside this period.",
    ],
  };
}
export function reportCsv(
  report: AnalyticsReport,
  kind: "sales" | "products",
): string {
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const quality = [
    report.quality,
    report.provenance,
    "Gross confirmed captures, not net sales. Financial consistency does not independently certify LIVE origin; historical LIVE/TEST provenance is unverified. Product allocations exclude inconsistent snapshots.",
  ];
  const rows: unknown[][] =
    kind === "sales"
      ? [
          [
            "Dubai date",
            "Paid orders",
            "Captured AED fils",
            "Financial consistency",
            "LIVE/TEST provenance",
            "Scope note",
          ],
          ...report.current.daily.map((d) => [
            d.day,
            d.paidOrders,
            d.capturedFils,
            ...quality,
          ]),
        ]
      : [
          [
            "SKU",
            "Historical product name",
            "Historical category",
            "Purchased units / boxes",
            "Allocated AED fils",
            "Financial consistency",
            "LIVE/TEST provenance",
            "Scope note",
          ],
          ...report.current.products.map((p) => [
            p.sku,
            p.name,
            p.category ?? "Unclassified",
            p.units,
            p.amountFils,
            ...quality,
          ]),
        ];
  return (
    "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n"
  );
}
