import type { IncomingMessage, ServerResponse } from "node:http";
import { DomainError, type Actor, type State } from "../domain/model";
import { ThreeLReportingSource } from "./three-l-source";
import {
  addDays,
  calculateReport,
  dubaiDay,
  reportCsv,
  reportRange,
} from "./engine";
export function serveAnalytics(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  read: () => State,
  actor: Actor,
  environment: string,
): boolean {
  if (!path.startsWith("/api/analytics/")) return false;
  if (!["admin", "manager"].includes(actor.role))
    throw new DomainError(403, "Analytics requires admin or manager access");
  if (req.method !== "GET")
    throw new DomainError(405, "Analytics is read-only");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Robots-Tag", "noindex");
  const json = (data: unknown) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
    return true;
  };
  // Staff identity only, no raw workspace, business records or customer details.
  if (path === "/api/analytics/session")
    return json({ actor, environment, mode: "integration", agents: [] });
  if (
    !["summary", "sales", "products", "operations", "export"].some(
      (x) => path === `/api/analytics/${x}`,
    )
  )
    throw new DomainError(404, "Unknown analytics report");
  const params = new URL(req.url!, "http://internal").searchParams,
    today = dubaiDay(new Date().toISOString())!;
  let range;
  try {
    range = reportRange(
      params.get("from") ?? addDays(today, -29),
      params.get("to") ?? today,
    );
  } catch (e) {
    throw new DomainError(
      400,
      e instanceof Error ? e.message : "Invalid dates",
    );
  }
  const kind = params.get("report");
  if (path.endsWith("/export") && kind !== "sales" && kind !== "products")
    throw new DomainError(400, "Choose sales or products export");
  let report;
  try {
    report = calculateReport(
      new ThreeLReportingSource(read).readFacts(),
      range,
    );
  } catch {
    throw new DomainError(503, "Reporting data requires integrity review");
  }
  if (path.endsWith("/export")) {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="3l-${kind}-${range.from}-${range.to}.csv"`,
    );
    res.end(reportCsv(report, kind as "sales" | "products"));
    return true;
  }
  if (path.endsWith("/sales"))
    return json({
      range: report.range,
      daily: report.current.daily,
      quality: report.quality,
      qualityScope: report.qualityScope,
      provenance: report.provenance,
      issues: report.issues,
    });
  if (path.endsWith("/products"))
    return json({
      range: report.range,
      products: report.current.products,
      unallocatedOrders: report.current.unallocatedOrders,
      unallocatedFils: report.current.unallocatedFils,
      quality: report.quality,
      qualityScope: report.qualityScope,
      provenance: report.provenance,
    });
  if (path.endsWith("/operations"))
    return json({
      range: report.range,
      states: report.current.states,
      fulfillment: report.current.fulfillment,
      attempts: report.current.attempts,
      adjustments: report.current.adjustments,
      quality: report.quality,
      qualityScope: report.qualityScope,
      provenance: report.provenance,
    });
  return json(report);
}
