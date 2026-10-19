import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChartLine,
  Receipt,
  ShoppingBag,
  WarningCircle,
  DownloadSimple,
} from "@phosphor-icons/react";
import type { AnalyticsReport } from "../../server/analytics/contract";
import { addDays, dubaiDay } from "../../server/analytics/engine";
import type { Workspace } from "./api";
import { api, money } from "./api";
import { OperationsShell } from "./OperationsShell";
import { Login } from "./Login";
import { useOps } from "./ops-i18n";
import { operationalProductName } from "./product-names";
import "./analytics.css";
type Session = Pick<Workspace, "actor" | "agents" | "environment" | "mode">;
class ReportError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/api/analytics/${path}`, {
    signal,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new ReportError(response.status, data.error ?? "Report unavailable");
  return data;
}
export function AnalyticsWorkspace() {
  const { t, language, setUser, formatDate } = useOps();
  const today = dubaiDay(new Date().toISOString())!;
  const [from, setFrom] = useState(
    () =>
      new URLSearchParams(location.search).get("from") ?? addDays(today, -29),
  );
  const [to, setTo] = useState(
    () => new URLSearchParams(location.search).get("to") ?? today,
  );
  const [session, setSession] = useState<Session | null>(null),
    [report, setReport] = useState<AnalyticsReport | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [auth, setAuth] = useState(false);
  const setUserRef = useRef(setUser);
  setUserRef.current = setUser;
  const sequence = useRef(0),
    controller = useRef<AbortController | null>(null);
  const load = useCallback(async (start: string, end: string) => {
    const seq = ++sequence.current;
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    const timeout = setTimeout(() => c.abort(), 15000);
    setBusy(true);
    setError("");
    try {
      const identity = await get<Session>("session", c.signal);
      if (seq !== sequence.current) return;
      setSession(identity);
      setUserRef.current(identity.actor.id);
      setAuth(false);
      const next = await get<AnalyticsReport>(
        `summary?${new URLSearchParams({ from: start, to: end })}`,
        c.signal,
      );
      if (seq !== sequence.current) return;
      setReport(next);
      history.replaceState(
        null,
        "",
        `/operations/analytics?${new URLSearchParams(next.range)}`,
      );
    } catch (e) {
      if (seq !== sequence.current) return;
      if (e instanceof ReportError && e.status === 401) {
        setAuth(true);
        setSession(null);
        setReport(null);
      } else {
        setReport(null);
        setError(
          e instanceof ReportError && e.status === 403
            ? "Analytics access is restricted to administrators and managers."
            : "Report unavailable. Check the dates and connection, then retry.",
        );
      }
    } finally {
      clearTimeout(timeout);
      if (seq === sequence.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load(from, to);
    return () => {
      sequence.current++;
      controller.current?.abort();
    };
  }, [load]); // filters are submitted explicitly
  if (auth) return <Login onLogin={() => load(from, to)} />;
  const body = (
    <section className="analytics" aria-label={t("Financial reporting")}>
      <div className="an-disclaimer">
        <WarningCircle size={22} aria-hidden="true" />
        <div>
          <strong>{t("Captured payments, not net sales")}</strong>
          <p>
            {t(
              "Read-only reports from verified payment records and accepted order snapshots. Refund amounts, profit and conversion are unavailable.",
            )}
          </p>
          <p>
            {t(
              "Historical LIVE/TEST provenance is unverified. This report is not independently LIVE-certified.",
            )}
          </p>
        </div>
      </div>
      <form
        className="an-filters"
        onSubmit={(e) => {
          e.preventDefault();
          void load(from, to);
        }}
      >
        <div className="an-presets" aria-label={t("Date presets")}>
          {[
            ["Today", 1],
            ["7 days", 7],
            ["30 days", 30],
          ].map(([label, days]) => (
            <button
              type="button"
              key={label}
              disabled={busy}
              onClick={() => {
                const start = addDays(today, 1 - Number(days));
                setFrom(start);
                setTo(today);
                void load(start, today);
              }}
            >
              {t(String(label))}
            </button>
          ))}
        </div>
        <label>
          {t("From")}
          <input
            type="date"
            required
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          {t("To")}
          <input
            type="date"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy}>
          {t("Apply dates")}
        </button>
        <small>{t("Asia/Dubai · up to 366 days")}</small>
      </form>
      {busy && <p role="status">{t("Loading verified reports…")}</p>}
      {error && (
        <div role="alert" className="an-warning">
          {t(error)}{" "}
          <button onClick={() => void load(from, to)}>{t("Retry")}</button>
        </div>
      )}
      {report && !busy && (
        <>
          <div className="an-meta">
            <span>
              {formatDate(report.range.from, false)} –{" "}
              {formatDate(report.range.to, false)}
            </span>
            <span>
              {t(
                report.quality === "partial"
                  ? "Partial data · review warnings"
                  : "Internally consistent financial records",
              )}{" "}
              · {t("Updated")} {formatDate(report.generatedAt)}
            </span>
          </div>
          <div className="an-kpis">
            {[
              [
                "Confirmed captured volume",
                money(report.current.capturedFils),
                ChartLine,
              ],
              ["Paid orders", String(report.current.paidOrders), Receipt],
              [
                "Average captured order",
                report.current.averageFils === null
                  ? t("Unavailable")
                  : money(report.current.averageFils),
                ShoppingBag,
              ],
              [
                "Allocated units / boxes",
                report.current.units === null
                  ? t("Unavailable")
                  : String(report.current.units),
                ShoppingBag,
              ],
            ].map(([label, value, Icon]) => {
              const I = Icon as typeof ChartLine;
              return (
                <article key={String(label)}>
                  <I size={22} aria-hidden="true" />
                  <h2>{t(String(label))}</h2>
                  <strong>{String(value)}</strong>
                </article>
              );
            })}
          </div>
          <p className="an-comparison">
            {t("Compared with")} {formatDate(report.previousRange.from, false)}{" "}
            – {formatDate(report.previousRange.to, false)}:{" "}
            <strong>
              {report.changePercent === null
                ? t("No comparison baseline")
                : `${report.changePercent > 0 ? "+" : ""}${report.changePercent}%`}
            </strong>{" "}
            · {t("Previous captured volume")}:{" "}
            {money(report.previous.capturedFils)}
          </p>
          {!report.current.paidOrders && (
            <div className="an-empty">
              <Receipt size={32} />
              <h2>{t("No verified paid orders in this period")}</h2>
              <p>
                {t(
                  "Try a different date range. Unconfirmed attempts never count as captured payments.",
                )}
              </p>
            </div>
          )}
          <article className="an-panel">
            <div className="an-title">
              <div>
                <h2>{t("Daily captured payments")}</h2>
                <p>{t("Payment confirmation date · Asia/Dubai")}</p>
              </div>
              <Export report={report} kind="sales" />
            </div>
            <div
              className="an-chart"
              role="img"
              aria-label={t(
                "Daily captured payment trend. Exact values follow in the table.",
              )}
            >
              {report.current.daily.map((d) => (
                <div key={d.day} title={`${d.day}: ${money(d.capturedFils)}`}>
                  <span
                    style={{
                      height: `${Math.max(2, (d.capturedFils / Math.max(1, ...report.current.daily.map((x) => x.capturedFils))) * 100)}%`,
                    }}
                  />
                </div>
              ))}
            </div>
            <div
              className="an-table-scroll"
              tabIndex={0}
              role="region"
              aria-label={t("Daily report table")}
            >
              <table>
                <caption>{t("Daily totals in AED")}</caption>
                <thead>
                  <tr>
                    <th>{t("Dubai date")}</th>
                    <th>{t("Paid orders")}</th>
                    <th>{t("Captured volume")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.current.daily.map((d) => (
                    <tr key={d.day}>
                      <th scope="row">{formatDate(d.day, false)}</th>
                      <td>{d.paidOrders}</td>
                      <td>{money(d.capturedFils)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
          <article className="an-panel">
            <div className="an-title">
              <div>
                <h2>{t("Historical product performance")}</h2>
                <p>
                  {t(
                    "Packs count as boxes; their contents are not extra products. Different recorded definitions remain separate.",
                  )}
                </p>
              </div>
              <Export report={report} kind="products" />
            </div>
            <div
              className="an-table-scroll"
              tabIndex={0}
              role="region"
              aria-label={t("Product report table")}
            >
              <table>
                <caption>
                  {t(
                    "Accepted product allocations · not current catalog prices",
                  )}
                </caption>
                <thead>
                  <tr>
                    <th>{t("Product / SKU")}</th>
                    <th>{t("Historical category")}</th>
                    <th>{t("Units / boxes")}</th>
                    <th>{t("Allocated amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.current.products.map((p, i) => {
                    const name = operationalProductName(p.sku, p.name);
                    return (
                      <tr key={i}>
                        <th scope="row">
                          {name.name}
                          <small>{p.sku}</small>
                          {name.reviewRequired && (
                            <small>
                              {t("Product translation requires review")}
                            </small>
                          )}
                        </th>
                        <td>{p.category ?? t("Unclassified")}</td>
                        <td>{p.units}</td>
                        <td>{money(p.amountFils)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!report.current.products.length && (
              <p>{t("No allocatable historical product snapshots.")}</p>
            )}
            <div className="an-allocation">
              <span>
                {t("Allocated products")}: {money(report.current.productFils)}
              </span>
              <span>
                {t("Recorded delivery fees")}: {money(report.current.feeFils)}
              </span>
              <span>
                {t("Unallocated captures")}:{" "}
                {money(report.current.unallocatedFils)} (
                {report.current.unallocatedOrders} {t("orders")})
              </span>
            </div>
          </article>
          <div className="an-breakdowns">
            {(
              [
                ["Current order states", report.current.states],
                ["Fulfillment", report.current.fulfillment],
                ["Unconfirmed payment attempts", report.current.attempts],
                ["Refund / dispute records", report.current.adjustments],
              ] as [string, Record<string, number>][]
            ).map(([title, entries]) => (
              <article className="an-panel" key={String(title)}>
                <h2>{t(String(title))}</h2>
                <p>
                  {t(
                    title === "Unconfirmed payment attempts"
                      ? "Attempts created during the period; not captured payments."
                      : title === "Refund / dispute records"
                        ? "Current status of paid-date cohort. Adjustment amounts unavailable."
                        : "Current state of orders confirmed paid during the period.",
                  )}
                </p>
                <dl>
                  {Object.entries(entries).map(([label, count]) => (
                    <div key={label}>
                      <dt>{t(label)}</dt>
                      <dd>{count}</dd>
                    </div>
                  ))}
                </dl>
                {!Object.keys(entries).length && <p>{t("No records")}</p>}
              </article>
            ))}
          </div>
          <details className="an-panel" open={report.quality === "partial"}>
            <summary>{t("Data quality & calculation rules")}</summary>
            <p>
              {t(
                "Missing or ambiguous payment evidence is excluded. Captures with inconsistent snapshots remain in captured volume but are unallocated. Quality counts cover the complete source, not only this period.",
              )}
            </p>
            <ul>
              {Object.entries(report.issues).map(([key, count]) => (
                <li key={key}>
                  {t(key)}: <strong>{count}</strong>
                </li>
              ))}
            </ul>
            <p>
              {t(
                "Historical payment rows have no explicit LIVE/TEST marker. Known mock and TEST records are excluded; unknown provenance cannot be independently verified.",
              )}
            </p>
            <p>
              {t(
                "Refund amounts, net sales, profit, conversion and repeat customers are unavailable. No current catalog prices are used.",
              )}
            </p>
          </details>
        </>
      )}
    </section>
  );
  if (!session)
    return (
      <main className="commerce ops-shell ops-auth" lang={language}>
        <h1>{t("Analytics & Reports")}</h1>
        {body}
      </main>
    );
  return (
    <OperationsShell
      data={session}
      view="analytics"
      busy={busy}
      onNavigate={(id) => location.assign(`/operations/${id}`)}
      onRefresh={() => void load(from, to)}
      onLogout={() => {
        void api("logout", {}).then(() => load(from, to));
      }}
    >
      {body}
    </OperationsShell>
  );
}
function Export({
  report,
  kind,
}: {
  report: AnalyticsReport;
  kind: "sales" | "products";
}) {
  const { t } = useOps();
  return (
    <a
      className="an-export"
      href={`/api/analytics/export?${new URLSearchParams({ ...report.range, report: kind })}`}
      download
    >
      <DownloadSimple size={18} aria-hidden="true" />
      {t("Export CSV")}
    </a>
  );
}
