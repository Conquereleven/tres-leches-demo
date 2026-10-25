import type { ReactNode } from "react";
/** Presentational reporting components: no tenant, provider or customer-data dependency. */
export function ReportPanel({
  title,
  subtitle,
  action,
  children,
  id,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="ops-v2-panel" id={id}>
      <header className="ops-v2-section-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
export function Distribution({
  rows,
  label,
}: {
  rows: Array<{
    label: string;
    count: number;
    href?: string;
    valueLabel?: string;
  }>;
  label: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="ops-v2-distribution" aria-label={label}>
      {rows.map((r) => (
        <li key={r.label}>
          <div>
            {r.href ? <a href={r.href}>{r.label}</a> : <span>{r.label}</span>}
            <strong>{r.valueLabel ?? r.count}</strong>
          </div>
          <span className="ops-v2-track" aria-hidden>
            <span style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
