import { useOps } from "./ops-i18n";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  House,
  Package,
  Printer,
  Gear,
  ChatsCircle,
  Receipt,
  Oven,
  Truck,
  MapPin,
  ShieldCheck,
  List,
  X,
  ArrowClockwise,
  SignOut,
  CaretLeft,
  CaretRight,
  ArrowUpRight,
} from "@phosphor-icons/react";
import type { Workspace } from "./api";

export const operationsNavigation = [
  {
    id: "overview",
    label: "Overview",
    title: "Overview",
    description: "Your operation at a glance",
    group: "Workspace",
    icon: House,
  },
  {
    id: "orders",
    label: "Orders",
    title: "Orders",
    description: "Manage orders from payment to fulfillment",
    group: "Workspace",
    icon: Receipt,
  },
  {
    id: "production",
    label: "Kitchen / Production",
    title: "Kitchen / Production",
    description: "Confirmed, preparing and ready orders",
    group: "Workspace",
    icon: Oven,
  },
  {
    id: "products",
    label: "Products",
    title: "Products",
    description: "Product Hub integration",
    group: "Workspace",
    icon: Package,
  },
  {
    id: "delivery",
    label: "Deliveries",
    title: "Deliveries",
    description: "Ready, out for delivery and delivered orders",
    group: "Workspace",
    icon: Truck,
  },
  {
    id: "inbox",
    label: "Inbox",
    title: "Inbox",
    description: "Conversations across your connected WhatsApp numbers",
    group: "Workspace",
    icon: ChatsCircle,
  },
  {
    id: "print",
    label: "Print Center",
    title: "Print Center",
    description: "Ticket previews and future printer connections",
    group: "Administration",
    icon: Printer,
  },
  {
    id: "zones",
    label: "Delivery areas",
    title: "Delivery areas",
    description: "Coverage and authoritative minimum-order rules",
    group: "Administration",
    icon: MapPin,
  },
  {
    id: "settings",
    label: "Settings",
    title: "Settings",
    description: "Workspace access and preferences",
    group: "Administration",
    icon: Gear,
  },
  {
    id: "readiness",
    label: "Diagnostics / UAT",
    title: "Diagnostics / UAT",
    description: "Verified integration checks and pending requirements",
    group: "Administration",
    icon: ShieldCheck,
  },
];
const navigation = operationsNavigation;

type Props = {
  data: Workspace;
  view: string;
  busy: boolean;
  onNavigate: (id: string) => void;
  onRefresh: () => void;
  onLogout: () => void;
  children: ReactNode;
};
export function OperationsShell({
  data,
  view,
  busy,
  onNavigate,
  onRefresh,
  onLogout,
  children,
}: Props) {
  const { t, language, setLanguage } = useOps();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("3l-sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [hint, setHint] = useState<{ label: string; top: number } | null>(null);
  const drawer = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const current = navigation.find((item) => item.id === view) ?? navigation[0]!;
  const visible = navigation.filter(
    (item) =>
      (item.id !== "readiness" ||
        (data.environment === "staging" && data.actor.role === "admin")) &&
      (item.id !== "settings" ||
        ["admin", "manager"].includes(data.actor.role)),
  );
  useEffect(() => {
    const media = matchMedia("(min-width: 768px)");
    const close = () => {
      if (media.matches) drawer.current?.close();
    };
    media.addEventListener("change", close);
    return () => media.removeEventListener("change", close);
  }, []);
  const navigate = (id: string) => {
    onNavigate(id);
    setHint(null);
    drawer.current?.close();
  };
  function sidebar(mobile = false) {
    return (
      <>
        <a
          className="ops-brand"
          href="/"
          aria-label={t("Pastelerías 3L · Ir a la tienda")}
        >
          <img src="/brand/icon.png" alt="" />
          <span>
            {t("Pastelerías 3L")}
            <small>{t("OPERATIONS")}</small>
          </span>
        </a>
        <nav aria-label={t("Operaciones")} className="ops-navigation">
          {["Workspace", "Administration"].map((group) => {
            const items = visible.filter((item) => item.group === group);
            return items.length ? (
              <div className="ops-nav-section" key={t(group)}>
                <p>{t(group)}</p>
                {items.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    title={t(label)}
                    aria-label={t(label)}
                    onFocus={(event) => {
                      if (!mobile)
                        setHint({
                          label: t(label),
                          top: event.currentTarget.getBoundingClientRect().top,
                        });
                    }}
                    onBlur={() => setHint(null)}
                    onMouseEnter={(event) => {
                      if (!mobile)
                        setHint({
                          label: t(label),
                          top: event.currentTarget.getBoundingClientRect().top,
                        });
                    }}
                    onMouseLeave={() => setHint(null)}
                    aria-current={view === id ? "page" : undefined}
                    onClick={() => navigate(id)}
                  >
                    <Icon size={21} aria-hidden="true" />
                    <span>{t(label)}</span>
                  </button>
                ))}
              </div>
            ) : null;
          })}
        </nav>
        <div className="ops-sidebar-bottom">
          <a
            className="ops-store-link"
            href="/"
            aria-label={t("Ver tienda")}
            title={t("Ver tienda")}
          >
            <ArrowUpRight size={19} aria-hidden="true" />
            <span>{t("Ver tienda")}</span>
          </a>
          <div className="ops-user">
            <span className="ops-avatar" aria-hidden="true">
              {data.actor.id.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>
                {data.agents.find((a) => a.id === data.actor.id)?.name ??
                  data.actor.id}
              </strong>
              <small>{t(data.actor.role)}</small>
            </div>
          </div>
          {data.mode === "integration" && (
            <button
              className="ops-logout"
              onClick={onLogout}
              title={t("Cerrar sesión")}
            >
              <SignOut size={19} aria-hidden="true" />
              <span>{t("Cerrar sesión")}</span>
            </button>
          )}
        </div>
        {!mobile && (
          <button
            className="ops-collapse"
            onClick={() =>
              setCollapsed((previous) => {
                const next = !previous;
                try {
                  localStorage.setItem("3l-sidebar-collapsed", String(next));
                } catch {
                  /* Optional preference; navigation remains usable. */
                }
                return next;
              })
            }
            aria-label={t(
              collapsed ? "Expandir barra lateral" : "Contraer barra lateral",
            )}
            aria-expanded={!collapsed}
            title={t(
              collapsed ? "Expandir barra lateral" : "Contraer barra lateral",
            )}
          >
            {collapsed ? (
              <CaretRight size={18} />
            ) : (
              <>
                <CaretLeft size={18} />
                <span>{t("Contraer menú")}</span>
              </>
            )}
          </button>
        )}
      </>
    );
  }
  return (
    <div
      className={`commerce ops-shell${collapsed ? " ops-collapsed" : ""}`}
      aria-busy={busy}
      lang={language}
    >
      <a className="ops-skip" href="#operations-content">
        {t("Saltar al contenido")}
      </a>
      <aside className="ops-sidebar">{sidebar()}</aside>
      {hint && (
        <span
          className="ops-nav-tooltip"
          role="tooltip"
          style={{ top: hint.top }}
        >
          {hint.label}
        </span>
      )}
      <dialog
        ref={drawer}
        className="ops-drawer"
        aria-label={t("Menú de operaciones")}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const targets = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              "a[href], button:not([disabled])",
            ),
          );
          const first = targets[0],
            last = targets.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onClose={() => menuButton.current?.focus()}
        onClick={(event) => {
          if (event.target === drawer.current) drawer.current.close();
        }}
      >
        <div className="ops-drawer-inner">
          <button
            className="ops-drawer-close"
            aria-label={t("Cerrar menú")}
            onClick={() => drawer.current?.close()}
          >
            <X size={22} />
          </button>
          {sidebar(true)}
        </div>
      </dialog>
      <div className="ops-workspace">
        <header className="ops-topbar">
          <button
            ref={menuButton}
            className="ops-menu"
            aria-label={t("Abrir menú")}
            aria-haspopup="dialog"
            onClick={() => drawer.current?.showModal()}
          >
            <List size={22} />
          </button>
          <span className="ops-breadcrumb">
            {t("Operaciones")}
            <span>{t("/")}</span> <strong>{t(current.title)}</strong>
          </span>
          <label className="ops-language">
            {t("Dashboard language")}
            <select
              aria-label={t("Dashboard language")}
              value={language}
              onChange={(e) =>
                setLanguage(e.target.value as "en" | "tl", data.actor.id)
              }
            >
              <option value="en">English</option>
              <option value="tl">Filipino / Tagalog</option>
            </select>
          </label>
          <span className="ops-environment">
            {data.environment === "staging"
              ? t("Staging")
              : data.environment === "test"
                ? t("Test")
                : t("Operations")}
          </span>
        </header>
        <main
          id="operations-content"
          tabIndex={-1}
          className={`ops-content ops-view-${view}`}
        >
          <header className="ops-page-header">
            <div>
              <p className="ops-kicker">
                {t("PASTELERÍAS 3L /")} {t(current.group)}
              </p>
              <h1>{t(current.title)}</h1>
              <p>{t(current.description)}</p>
            </div>
            <button className="ops-refresh" onClick={onRefresh} disabled={busy}>
              <ArrowClockwise size={18} aria-hidden="true" />
              {t("Actualizar")}
            </button>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
