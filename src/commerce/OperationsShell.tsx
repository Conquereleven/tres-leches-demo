import { useEffect, useRef, useState, type ReactNode } from "react";
import {
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

const navigation = [
  {
    id: "inbox",
    label: "Inbox unificado",
    title: "Inbox",
    description:
      "Gestiona las conversaciones de todos tus números de WhatsApp.",
    group: "OPERACIÓN",
    icon: ChatsCircle,
  },
  {
    id: "orders",
    label: "Pedidos",
    title: "Pedidos",
    description: "Cada pedido, desde la primera conversación hasta la entrega.",
    group: "OPERACIÓN",
    icon: Receipt,
  },
  {
    id: "production",
    label: "Producción",
    title: "Producción",
    description: "Organiza los pedidos confirmados, en preparación y listos.",
    group: "OPERACIÓN",
    icon: Oven,
  },
  {
    id: "delivery",
    label: "Entregas",
    title: "Entregas",
    description: "Sigue los pedidos listos, en camino y entregados.",
    group: "OPERACIÓN",
    icon: Truck,
  },
  {
    id: "zones",
    label: "Zonas y tarifas",
    title: "Zonas de entrega",
    description: "Cobertura en Dubai, mínimos de compra y reglas comerciales.",
    group: "COMERCIO",
    icon: MapPin,
  },
  {
    id: "readiness",
    label: "Preparación y UAT",
    title: "Preparación y UAT",
    description: "Estado verificado de los sistemas y requisitos pendientes.",
    group: "SISTEMA",
    icon: ShieldCheck,
  },
];

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
      item.id !== "readiness" ||
      (data.environment === "staging" && data.actor.role === "admin"),
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
          aria-label="Pastelerías 3L · Ir a la tienda"
        >
          <img src="/brand/icon.png" alt="" />
          <span>
            Pastelerías 3L<small>OPERATIONS</small>
          </span>
        </a>
        <nav aria-label="Operaciones" className="ops-navigation">
          {["OPERACIÓN", "COMERCIO", "SISTEMA"].map((group) => {
            const items = visible.filter((item) => item.group === group);
            return items.length ? (
              <div className="ops-nav-section" key={group}>
                <p>{group}</p>
                {items.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    title={label}
                    aria-label={label}
                    onFocus={(event) => {
                      if (!mobile)
                        setHint({
                          label,
                          top: event.currentTarget.getBoundingClientRect().top,
                        });
                    }}
                    onBlur={() => setHint(null)}
                    onMouseEnter={(event) => {
                      if (!mobile)
                        setHint({
                          label,
                          top: event.currentTarget.getBoundingClientRect().top,
                        });
                    }}
                    onMouseLeave={() => setHint(null)}
                    aria-current={view === id ? "page" : undefined}
                    onClick={() => navigate(id)}
                  >
                    <Icon size={21} aria-hidden="true" />
                    <span>{label}</span>
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
            aria-label="Ver tienda"
            title="Ver tienda"
          >
            <ArrowUpRight size={19} aria-hidden="true" />
            <span>Ver tienda</span>
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
              <small>{data.actor.role}</small>
            </div>
          </div>
          {data.mode === "integration" && (
            <button
              className="ops-logout"
              onClick={onLogout}
              title="Cerrar sesión"
            >
              <SignOut size={19} aria-hidden="true" />
              <span>Cerrar sesión</span>
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
            aria-label={
              collapsed ? "Expandir barra lateral" : "Contraer barra lateral"
            }
            aria-expanded={!collapsed}
            title={
              collapsed ? "Expandir barra lateral" : "Contraer barra lateral"
            }
          >
            {collapsed ? (
              <CaretRight size={18} />
            ) : (
              <>
                <CaretLeft size={18} />
                <span>Contraer menú</span>
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
      lang="es"
    >
      <a className="ops-skip" href="#operations-content">
        Saltar al contenido
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
        aria-label="Menú de operaciones"
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
            aria-label="Cerrar menú"
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
            aria-label="Abrir menú"
            aria-haspopup="dialog"
            onClick={() => drawer.current?.showModal()}
          >
            <List size={22} />
          </button>
          <span className="ops-breadcrumb">
            Operaciones <span>/</span> <strong>{current.title}</strong>
          </span>
          <span className="ops-environment">
            {data.environment === "staging"
              ? "Staging"
              : data.environment === "test"
                ? "Test"
                : "Operations"}
          </span>
        </header>
        <main
          id="operations-content"
          tabIndex={-1}
          className={`ops-content ops-view-${view}`}
        >
          <header className="ops-page-header">
            <div>
              <p className="ops-kicker">PASTELERÍAS 3L / {current.group}</p>
              <h1>{current.title}</h1>
              <p>{current.description}</p>
            </div>
            <button className="ops-refresh" onClick={onRefresh} disabled={busy}>
              <ArrowClockwise size={18} aria-hidden="true" />
              Actualizar
            </button>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
