import { useEffect, useState } from "react";
import type { AnalyticsReport } from "../../server/analytics/contract";
import { money } from "./api";
import { useOps } from "./ops-i18n";
import { ReportPanel } from "./ReportingPrimitives";
/** Financial figures come exclusively from the authorized, read-only reporting API. */
export function DailyFinanceSummary({
  today,
  userId,
}: {
  today: string;
  userId: string;
}) {
  const { t, formatDate } = useOps();
  const [report, setReport] = useState<AnalyticsReport | null>(null),
    [error, setError] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    let active = true;
    const timeout = setTimeout(() => c.abort(), 15000);
    setReport(null);
    setError(false);
    void fetch(
      `/api/analytics/summary?${new URLSearchParams({ from: today, to: today })}`,
      { signal: c.signal, cache: "no-store" },
    )
      .then(async (r) => {
        if (!r.ok) throw Error();
        const body: AnalyticsReport = await r.json();
        if (
          body?.range?.from !== today ||
          body.range.to !== today ||
          !body.current ||
          !Number.isSafeInteger(body.current.paidOrders) ||
          body.current.paidOrders < 0 ||
          !Number.isSafeInteger(body.current.capturedFils) ||
          body.current.capturedFils < 0 ||
          (body.current.averageFils !== null &&
            (!Number.isSafeInteger(body.current.averageFils) ||
              body.current.averageFils < 0)) ||
          !["internally_consistent", "partial"].includes(body.quality) ||
          !Number.isFinite(Date.parse(body.generatedAt))
        )
          throw Error();
        if (active) setReport(body);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      c.abort();
    };
  }, [today, userId, revision]);
  return (
    <ReportPanel
      title={t("Today · confirmed payments")}
      subtitle={t("Captured payments, not net sales")}
      action={
        <a href={`/operations/analytics?from=${today}&to=${today}`}>
          {t("Open today's report")}
        </a>
      }
    >
      {error ? (
        <p role="status">
          {t("Financial summary unavailable")}{" "}
          <button onClick={() => setRevision((r) => r + 1)}>
            {t("Retry")}
          </button>
        </p>
      ) : !report ? (
        <p role="status">{t("Loading financial reports…")}</p>
      ) : (
        <>
          <dl className="ops-v2-finance">
            {[
              ["Paid orders", String(report.current.paidOrders)],
              ["Confirmed captured volume", money(report.current.capturedFils)],
              [
                "Average captured order",
                report.current.averageFils === null
                  ? t("Unavailable")
                  : money(report.current.averageFils),
              ],
            ].map(([key, value]) => (
              <div key={key}>
                <dt>{t(key!)}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="ops-v2-note">
            {t(
              report.quality === "partial"
                ? "Partial data · review warnings"
                : "Internally consistent financial records",
            )}{" "}
            · {t("Updated")} {formatDate(report.generatedAt)}
          </p>
        </>
      )}
      <p className="ops-v2-note">
        {t(
          "Historical LIVE/TEST provenance is unverified. This report is not independently LIVE-certified.",
        )}
      </p>
    </ReportPanel>
  );
}
