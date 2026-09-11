import { useCallback, useEffect, useState, useRef } from "react";
import type {
  Conversation,
  Order,
  DeliveryZone,
  OrderState,
} from "../../server/domain/model";
import { api, money, type Workspace as Data } from "./api";
import "./commerce.css";
type Run = (body: Record<string, unknown>, path?: string) => Promise<boolean>;
export function CommerceWorkspace() {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [view, setView] = useState(location.pathname.split("/")[2] || "inbox"),
    [selected, setSelected] = useState(""),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [unread, setUnread] = useState(false),
    [agent, setAgent] = useState("all"),
    [status, setStatus] = useState("all");
  useEffect(() => {
    const sync = () => setView(location.pathname.split("/")[2] || "inbox");
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const pending = useRef(new Map<string, string>());
  const refresh = useCallback(async () => {
    try {
      setData(await api<Data>("workspace"));
      setError((previous) =>
        previous.includes("Inicia sesión") ? "" : previous,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión");
      if (e instanceof Error && e.message.includes("Inicia sesión"))
        setData(null);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh]);
  const run: Run = async (body, path = "commands") => {
    if (busy) return false;
    setBusy(true);
    setError("");
    const signature = path + JSON.stringify(body);
    const key = pending.current.get(signature) ?? crypto.randomUUID();
    pending.current.set(signature, key);
    try {
      await api(path, body, key);
      pending.current.delete(signature);
      await refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      await refresh();
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!data && error.includes("Inicia sesión"))
    return <Login onLogin={refresh} />;
  if (!data)
    return (
      <main className="commerce">
        <h1>Workspace de operaciones</h1>
        {error ? (
          <div role="alert">
            {error}
            <button onClick={() => void refresh()}>Reintentar conexión</button>
          </div>
        ) : (
          <div aria-busy="true" className="co-skeleton">
            Cargando conversaciones y pedidos…
          </div>
        )}
      </main>
    );
  const c = data.conversations.find((c) => c.id === selected),
    orders = data.orders.filter((o) => o.conversationId === selected);
  const shown = data.conversations.filter(
    (c) =>
      (filter === "all" || c.sourceNumberId === filter) &&
      (!unread || c.unread) &&
      (agent === "all" ||
        c.assignedAgent === agent ||
        (agent === "none" && !c.assignedAgent)) &&
      (status === "all" || c.status === status) &&
      `${c.customer} ${c.phone} ${c.messages.at(-1)?.text ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <main className="commerce" aria-busy={busy}>
      <header className="co-heading">
        <div>
          <p className="eyebrow">TRES LECHES · OPERACIONES</p>
          <h1>Todo empieza con una conversación.</h1>
        </div>
        <span className="co-pill">
          {data.environment === "staging"
            ? "Staging · conexiones pendientes de activación"
            : "Operaciones"}
        </span>
      </header>
      <nav className="co-tabs" aria-label="Operaciones">
        {[
          ["inbox", "Inbox unificado"],
          ["orders", "Pedidos"],
          ["production", "Producción"],
          ["delivery", "Entregas"],
          ["zones", "Zonas y tarifas"],
          ...(data.environment === "staging"
            ? [["readiness", "Preparación y UAT"]]
            : []),
        ].map(([id, label]) => (
          <button
            key={id}
            aria-current={view === id ? "page" : undefined}
            onClick={() => {
              history.pushState({}, "", `/operations/${id}`);
              setView(id!);
            }}
          >
            {label}
          </button>
        ))}
        {data.mode === "integration" && (
          <button onClick={() => void run({}, "logout")}>Cerrar sesión</button>
        )}
        <button className="co-refresh" onClick={() => void refresh()}>
          Actualizar
        </button>
      </nav>
      {data.integrationHealth?.inboundFailed ? (
        <p className="co-error" role="alert">
          Hay {data.integrationHealth.inboundFailed} notificaciones pendientes
          de revisión técnica.
        </p>
      ) : null}
      {error && (
        <div className="co-error" role="alert">
          {error}
          <button
            onClick={() => {
              setError("");
              void refresh();
            }}
          >
            Actualizar datos
          </button>
        </div>
      )}
      <fieldset className="co-fieldset" disabled={busy}>
        {view === "readiness" ? (
          <ReadinessPanel data={data} run={run} />
        ) : view === "zones" ? (
          <Zones key="zones" data={data} run={run} />
        ) : view === "inbox" ? (
          <div className="co-grid">
            <aside className={`co-list${shown.length ? "" : " co-list-empty"}`}>
              <div className="co-filters">
                <div className="co-number-tabs">
                  {["all", ...data.numbers.map((n) => n.id)].map((id) => (
                    <button
                      key={id}
                      aria-pressed={filter === id}
                      onClick={() => setFilter(id)}
                    >
                      {id === "all" ? "All" : id.toUpperCase()}
                    </button>
                  ))}
                </div>
                <label>
                  Buscar conversación
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cliente, teléfono o mensaje"
                  />
                </label>
                <div className="co-two">
                  <label>
                    Agente
                    <select
                      value={agent}
                      onChange={(e) => setAgent(e.target.value)}
                    >
                      <option value="all">Todos</option>
                      <option value="none">Sin asignar</option>
                      {data.agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Estado
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="all">Todos</option>
                      <option value="open">Abierta</option>
                      <option value="closed">Cerrada</option>
                    </select>
                  </label>
                </div>
                <label className="co-check">
                  <input
                    type="checkbox"
                    checked={unread}
                    onChange={(e) => setUnread(e.target.checked)}
                  />
                  Solo no leídas
                </label>
              </div>
              {shown.length === 0 && (
                <p className="co-empty">
                  {data.conversations.length
                    ? "Sin conversaciones para estos filtros."
                    : "No conversations yet. Las conversaciones aparecerán aquí al recibir mensajes en los números conectados."}
                </p>
              )}
              {shown.map((item) => (
                <button
                  className={
                    "co-conversation " +
                    (item.id === selected ? "selected" : "")
                  }
                  key={item.id}
                  onClick={() => {
                    setSelected(item.id);
                    if (item.unread)
                      void run({
                        type: "read",
                        id: item.id,
                        version: item.version,
                      });
                  }}
                >
                  <span className="co-row">
                    <b>{item.customer}</b>
                    <span className="co-source">
                      {item.sourceNumberId.toUpperCase()}
                    </span>
                  </span>
                  <span>
                    {item.messages.at(-1)?.text || "Ubicación compartida"}
                  </span>
                  <small>
                    {item.assignedAgent ?? "Sin asignar"} ·{" "}
                    {item.unread ? "● No leída" : "Leída"} ·{" "}
                    {data.orders.find(
                      (o) =>
                        o.conversationId === item.id &&
                        !["Delivered", "Cancelled"].includes(o.state),
                    )?.state ?? item.status}
                  </small>
                </button>
              ))}
            </aside>
            {c ? (
              <>
                <ConversationPanel key={c.id} c={c} data={data} run={run} />
                <aside className="co-order-side">
                  <div className="co-section">
                    <p className="eyebrow">PEDIDOS VINCULADOS</p>
                    <h2>Pedido y entrega</h2>
                    <p>
                      {c.customer} · {c.phone}
                    </p>
                    <button
                      className="primary"
                      disabled={
                        !c.assignedAgent ||
                        c.assignedAgent !== data.actor.id ||
                        orders.some(
                          (o) => !["Delivered", "Cancelled"].includes(o.state),
                        )
                      }
                      onClick={() =>
                        void run({
                          type: "createOrder",
                          id: c.id,
                          version: c.version,
                        })
                      }
                    >
                      Crear pedido
                    </button>
                  </div>
                  {orders.length === 0 ? (
                    <p className="co-empty">
                      Toma la conversación y crea el primer pedido.
                    </p>
                  ) : (
                    orders.map((o) => (
                      <OrderPanel key={o.id} order={o} data={data} run={run} />
                    ))
                  )}
                  <div className="co-section">
                    <h3>Actividad de conversación</h3>
                    <ul className="co-audit">
                      {c.audit.map((a, i) => (
                        <li key={i}>
                          {a.action}
                          <small>
                            {a.actor} · {new Date(a.at).toLocaleString()}
                          </small>
                        </li>
                      ))}
                    </ul>
                  </div>
                </aside>
              </>
            ) : (
              <p className="co-empty">Selecciona una conversación.</p>
            )}
          </div>
        ) : (
          <div className="co-board">
            {data.orders
              .filter(
                (o) =>
                  view === "orders" ||
                  (view === "production"
                    ? ["Confirmed", "Production", "Ready"]
                    : ["Ready", "Out for Delivery", "Delivered"]
                  ).includes(o.state),
              )
              .map((o) => (
                <article key={o.id} className="co-board-card">
                  <button
                    className="co-link"
                    onClick={() => {
                      setSelected(o.conversationId);
                      setView("inbox");
                    }}
                  >
                    Abrir conversación ·{" "}
                    {data.conversations
                      .find((c) => c.id === o.conversationId)
                      ?.sourceNumberId.toUpperCase()}
                  </button>
                  <OrderPanel order={o} data={data} run={run} />
                </article>
              ))}
            {data.orders.filter(
              (o) =>
                view === "orders" ||
                (view === "production"
                  ? ["Confirmed", "Production", "Ready"]
                  : ["Ready", "Out for Delivery", "Delivered"]
                ).includes(o.state),
            ).length === 0 && (
              <p className="co-empty">
                {view === "production"
                  ? "No production items yet. Los pedidos confirmados aparecerán aquí al pasar a producción."
                  : "No orders yet. Los pedidos aparecerán aquí cuando el equipo los registre."}
              </p>
            )}
          </div>
        )}
      </fieldset>
    </main>
  );
}
function ConversationPanel({
  c,
  data,
  run,
}: {
  c: Conversation;
  data: Data;
  run: Run;
}) {
  const [draft, setDraft] = useState(""),
    [translation, setTranslation] = useState(true);
  const owned = c.assignedAgent === data.actor.id;
  return (
    <section className="co-chat">
      <header>
        <div>
          <h2>{c.customer}</h2>
          <p>
            <span className="co-source">{c.sourceNumberId.toUpperCase()}</span>{" "}
            {c.sourcePhoneNumber}
          </p>
        </div>
        <button
          onClick={() =>
            void run({
              type: "assign",
              id: c.id,
              version: c.version,
              agent: owned ? null : data.actor.id,
            })
          }
        >
          {owned ? "Liberar conversación" : "Tomar conversación"}
        </button>
      </header>
      <div className="co-two co-chat-tools">
        <label>
          Asignar agente
          <select
            value={c.assignedAgent ?? ""}
            onChange={(e) =>
              void run({
                type: "assign",
                id: c.id,
                version: c.version,
                agent: e.target.value || null,
              })
            }
          >
            <option value="">Sin asignar</option>
            {data.agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Conversación
          <select
            disabled={!owned}
            value={c.status}
            onChange={(e) =>
              void run({
                type: "conversationStatus",
                id: c.id,
                version: c.version,
                status: e.target.value,
              })
            }
          >
            <option value="open">Abierta</option>
            <option value="closed">Cerrada</option>
          </select>
        </label>
      </div>
      <div className="co-messages">
        <button
          className="co-link"
          onClick={() => setTranslation(!translation)}
        >
          {translation ? "Ocultar traducción" : "Ver traducción"}
        </button>
        {c.messages.map((m) => (
          <div key={m.id} className={"co-message " + m.direction}>
            <p>{m.text}</p>
            {m.location && (
              <p>
                GPS · {m.location.lat}, {m.location.lng}
              </p>
            )}
            {translation && m.translation && (
              <p className="co-translation">
                Internal English · {m.translation}
              </p>
            )}
            <small>
              {new Date(m.at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              · {m.status}{" "}
              {m.direction === "out" && `· ${c.sourceNumberId.toUpperCase()}`}
            </small>
          </div>
        ))}
      </div>
      <div className="co-chat-bottom">
        <div className="co-compose">
          <label className="sr-only" htmlFor="co-draft">
            Mensaje
          </label>
          <textarea
            id="co-draft"
            value={draft}
            disabled={!owned || c.status === "closed"}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              owned
                ? "Escribe tu respuesta…"
                : "Toma la conversación para responder"
            }
          />
          <button
            className="primary"
            disabled={!owned || !draft.trim() || c.status === "closed"}
            onClick={() => {
              void run({
                type: "send",
                id: c.id,
                version: c.version,
                text: draft,
              }).then((ok) => {
                if (ok) setDraft("");
              });
            }}
          >
            Enviar
          </button>
        </div>
        <p className="co-muted">
          Las respuestas salen desde {c.sourceNumberId.toUpperCase()}.
          Traducciones solo para uso interno.
        </p>

        {data.jobs
          .filter(
            (j) =>
              c.messages.some((m) => m.id === j.entityId) &&
              ["failed", "unknown"].includes(j.status),
          )
          .map((j) => (
            <p className="co-error" key={j.id}>
              {j.lastError}
              {j.status === "failed" && (
                <button
                  onClick={() => void run({ type: "retryJob", id: j.id })}
                >
                  Reintentar envío
                </button>
              )}
            </p>
          ))}
      </div>
    </section>
  );
}
function OrderPanel({
  order: o,
  data,
  run,
}: {
  order: Order;
  data: Data;
  run: Run;
}) {
  const [address, setAddress] = useState(""),
    [product, setProduct] = useState(data.catalog[0]?.id ?? ""),
    [quantity, setQuantity] = useState(1),
    [manualZone, setManualZone] = useState(""),
    [manualReason, setManualReason] = useState("");
  const p = data.payments.find((p) => p.id === o.paymentId),
    c = data.conversations.find((c) => c.id === o.conversationId)!,
    editable = ["Building", "Awaiting Location", "Minimum Check"].includes(
      o.state,
    ),
    owned = c.assignedAgent === data.actor.id && c.status === "open";
  const next: Partial<Record<OrderState, OrderState>> = {
    Confirmed: "Production",
    Production: "Ready",
    Ready: "Out for Delivery",
    "Out for Delivery": "Delivered",
  };
  return (
    <section className="co-order" data-testid="order-panel">
      <div className="co-row">
        <h3>{o.id}</h3>
        <span className="co-state">{o.state}</span>
      </div>
      {p?.provider === "paymennt" &&
        (owned || ["admin", "manager"].includes(data.actor.role)) && (
          <button
            onClick={() => void run({ paymentId: p.id }, "payments/reconcile")}
          >
            Check Status · conciliar pago
          </button>
        )}
      <fieldset className="co-fieldset" disabled={!owned}>
        <ul className="co-lines">
          {o.lines.map((l) => (
            <li key={l.productId}>
              <span>
                {l.quantity} ×{" "}
                {data.catalog.find((p) => p.id === l.productId)?.name}
              </span>
              <span>
                {money(
                  data.catalog.find((p) => p.id === l.productId)!.priceFils *
                    l.quantity,
                )}
              </span>
              {editable && (
                <button
                  aria-label={"Quitar " + l.productId}
                  onClick={() =>
                    void run({
                      type: "editOrder",
                      id: o.id,
                      version: o.version,
                      lines: o.lines.filter((x) => x.productId !== l.productId),
                    })
                  }
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        {editable && (
          <>
            <div className="co-two">
              <label>
                Producto
                <select
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                >
                  {data.catalog.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name} · {money(p.priceFils)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cantidad
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
              </label>
            </div>
            {!data.catalog.length && (
              <p className="co-empty">
                Catálogo pendiente de aprobación. Los productos estarán
                disponibles cuando se configure el catálogo oficial.
              </p>
            )}
            <button
              disabled={!data.catalog.some((p) => p.id === product)}
              onClick={() => {
                const lines = o.lines.filter((l) => l.productId !== product);
                void run({
                  type: "editOrder",
                  id: o.id,
                  version: o.version,
                  lines: [...lines, { productId: product, quantity }],
                });
              }}
            >
              Guardar producto
            </button>
            <label>
              Dirección / zona manual
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Zona, edificio y apartamento"
              />
            </label>
            <button
              disabled={!address.trim()}
              onClick={() =>
                void run({
                  type: "location",
                  id: o.id,
                  version: o.version,
                  address,
                })
              }
            >
              Resolver dirección
            </button>
            <details>
              <summary>Revisar y seleccionar zona</summary>
              <p>
                Confirma la ubicación con el cliente. La selección queda
                registrada.
              </p>
              <label>
                Zona confirmada
                <select
                  value={manualZone}
                  onChange={(e) => setManualZone(e.target.value)}
                >
                  <option value="">Seleccionar zona</option>
                  {data.zones
                    .filter((z) => z.active)
                    .map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Motivo de la selección
                <input
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                />
              </label>
              <button
                disabled={!manualZone || manualReason.trim().length < 5}
                onClick={() =>
                  void run({
                    type: "manualZone",
                    id: o.id,
                    version: o.version,
                    zoneId: manualZone,
                    reason: manualReason,
                  })
                }
              >
                Confirmar zona manual
              </button>
            </details>
          </>
        )}
        <div className={"co-quote " + (o.quote?.eligible ? "eligible" : "")}>
          <b>{o.quote?.zoneName ?? "Ubicación pendiente"}</b>
          <p>
            {o.location
              ? `GPS ${o.location.lat}, ${o.location.lng}`
              : (o.address ??
                "Espera la ubicación del cliente o ingresa su dirección.")}
          </p>
          <dl>
            <dt>Mínimo de compra</dt>
            <dd>
              {money(
                o.quote?.minOrderAed == null ? null : o.quote.minOrderAed * 100,
              )}
            </dd>
            <dt>Productos</dt>
            <dd>{money(o.quote?.subtotalFils)}</dd>
            <dt>Entrega</dt>
            <dd>
              {o.quote?.feeFils === 0
                ? "Free delivery"
                : money(o.quote?.feeFils)}
            </dd>
            <dt>Total</dt>
            <dd>{money(o.quote?.totalFils)}</dd>
          </dl>
          <strong>
            {editable
              ? (o.quote?.reason ?? "Agrega productos y ubicación")
              : "Regla aplicada al pedido"}
          </strong>
        </div>
        {editable && (
          <button
            className="primary co-full"
            disabled={!o.quote?.eligible || o.state !== "Minimum Check"}
            onClick={() =>
              void run({ type: "requestPayment", id: o.id, version: o.version })
            }
          >
            Request Payment
          </button>
        )}
        {!p && (
          <p className="co-empty">
            No payments yet. El estado aparecerá aquí al solicitar el pago del
            pedido.
          </p>
        )}
        {p && (
          <div className="co-payment">
            <h4>Pago · {p.status}</h4>
            <p>
              {money(p.amountFils)} · {p.currency}
            </p>
            {p.url && (
              <p className="co-payment-url">
                Enlace generado y encolado por {c.sourceNumberId.toUpperCase()}.
                <br />
                <code>{p.url}</code>
              </p>
            )}
            {p.status === "pending" && (
              <>
                <button
                  onClick={() =>
                    void run({
                      type: "resendPayment",
                      id: o.id,
                      version: o.version,
                    })
                  }
                >
                  Reenviar enlace
                </button>
              </>
            )}
            {p.provider === "paymennt" && (
              <>
                <p>
                  Última conciliación:{" "}
                  {p.lastReconciledAt
                    ? new Date(p.lastReconciledAt).toLocaleString()
                    : "Pendiente"}
                </p>
              </>
            )}
            <ul className="co-audit">
              {p.timeline.map((a, i) => (
                <li key={i}>
                  {a.action}
                  <small>
                    {a.actor} · {new Date(a.at).toLocaleString()}
                  </small>
                </li>
              ))}
            </ul>
            {p.transactionId && <small>Transacción: {p.transactionId}</small>}
            {data.jobs
              .filter((j) => j.entityId === p.id && j.status === "unknown")
              .map((j) => (
                <p key={j.id} className="co-error">
                  {j.lastError}. Usa Check Status para buscar el checkout
                  existente.
                </p>
              ))}
            {data.jobs
              .filter((j) => j.entityId === p.id && j.status === "failed")
              .map((j) => (
                <button
                  key={j.id}
                  onClick={() => void run({ type: "retryJob", id: j.id })}
                >
                  Reintentar creación del enlace
                </button>
              ))}
          </div>
        )}
        {next[o.state] && (
          <button
            className="primary co-full"
            onClick={() =>
              void run({
                type: "transition",
                id: o.id,
                version: o.version,
                state: next[o.state],
              })
            }
          >
            Avanzar a {next[o.state]}
          </button>
        )}
        {editable && (
          <button
            className="co-link"
            onClick={() =>
              void run({
                type: "transition",
                id: o.id,
                version: o.version,
                state: "Cancelled",
              })
            }
          >
            Cancelar pedido
          </button>
        )}
      </fieldset>
      <details className="co-history">
        <summary>Historial del pedido · {o.audit.length} eventos</summary>
        <ol className="co-audit">
          {o.audit.map((a, i) => (
            <li key={i}>
              {a.action}
              <small>
                {a.actor} · {new Date(a.at).toLocaleString()}
              </small>
            </li>
          ))}
        </ol>
      </details>
      {!owned && (
        <p className="co-muted">
          Toma o reabre la conversación para gestionar este pedido.
        </p>
      )}
    </section>
  );
}
function Zones({ data, run }: { data: Data; run: Run }) {
  const [search, setSearch] = useState(""),
    [id, setId] = useState("jvc");
  const zone = data.zones.find((z) => z.id === id)!;
  return (
    <section className="co-zones">
      <aside>
        <h2>Zonas de entrega</h2>
        <p>
          Tabla original · {data.zones.length} reglas. Las tarifas no indicadas
          requieren revisión.
        </p>
        <label>
          Buscar zona
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <div className="co-zone-list">
          {data.zones
            .filter((z) =>
              `${z.name} ${z.aliases.join(" ")}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((z) => (
              <button
                key={z.id}
                className={z.id === id ? "selected" : ""}
                onClick={() => setId(z.id)}
              >
                <span>{z.name}</span>
                <b>
                  {z.minOrderAed === null
                    ? "Revisar mínimo"
                    : money(z.minOrderAed * 100)}
                </b>
                <small>
                  {z.freeDelivery
                    ? "Free delivery"
                    : z.deliveryFeeAed === null
                      ? "Tarifa pendiente"
                      : money(z.deliveryFeeAed * 100)}{" "}
                  · {z.active ? "Activa" : "Inactiva"}
                </small>
              </button>
            ))}
        </div>
      </aside>
      <ZoneEditor
        key={`${zone.id}-${zone.version}`}
        zone={zone}
        disabled={data.actor.role !== "admin"}
        run={run}
      />
    </section>
  );
}
function ZoneEditor({
  zone,
  disabled,
  run,
}: {
  zone: DeliveryZone;
  disabled: boolean;
  run: Run;
}) {
  const [draft, setDraft] = useState(zone),
    [polygon, setPolygon] = useState(
      zone.polygon ? JSON.stringify(zone.polygon) : "",
    ),
    [error, setError] = useState("");
  return (
    <form
      className="co-zone-editor"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const parsed: unknown = polygon.trim()
            ? JSON.parse(polygon)
            : undefined;
          setError("");
          void run({
            type: "updateZone",
            zone: {
              ...draft,
              aliases: draft.aliases.map((a) => a.trim()).filter(Boolean),
              polygon: parsed,
            },
          });
        } catch {
          setError(
            "Polígono inválido: usa una lista JSON de coordenadas lat/lng.",
          );
        }
      }}
    >
      <p className="eyebrow">REGLA CONFIGURABLE</p>
      <h2>{zone.name}</h2>
      <fieldset className="co-fieldset" disabled={disabled}>
        <label>
          Nombre
          <input
            required
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label>
          Aliases · uno por línea
          <textarea
            value={draft.aliases.join("\n")}
            onChange={(e) =>
              setDraft({ ...draft, aliases: e.target.value.split("\n") })
            }
          />
        </label>
        <div className="co-two">
          <label>
            Mínimo AED
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.minOrderAed ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  minOrderAed:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Tarifa AED
            <input
              type="number"
              min="0"
              step="0.01"
              disabled={draft.freeDelivery}
              value={draft.deliveryFeeAed ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  deliveryFeeAed:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </label>
        </div>
        <label className="co-check">
          <input
            type="checkbox"
            checked={draft.freeDelivery}
            onChange={(e) =>
              setDraft({
                ...draft,
                freeDelivery: e.target.checked,
                deliveryFeeAed: e.target.checked ? 0 : null,
              })
            }
          />
          Free delivery
        </label>
        <label className="co-check">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
          />
          Zona activa
        </label>
        <label>
          Prioridad
          <input
            type="number"
            min="0"
            max="100"
            value={draft.priority}
            onChange={(e) =>
              setDraft({ ...draft, priority: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Nota de revisión
          <textarea
            value={draft.review ?? ""}
            onChange={(e) => setDraft({ ...draft, review: e.target.value })}
          />
        </label>
        <details>
          <summary>Límites geográficos · configuración avanzada</summary>
          <label>
            Identificadores geográficos verificados · uno por línea
            <textarea
              value={(draft.canonicalIds ?? []).join("\n")}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  canonicalIds: e.target.value
                    .split("\n")
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <label>
            Polígono JSON · puntos lat/lng
            <textarea
              value={polygon}
              onChange={(e) => setPolygon(e.target.value)}
              placeholder="Polígono aprobado en formato JSON"
            />
          </label>
          <p>
            La ubicación se verificará con el proveedor geográfico o con límites
            aprobados. Sin cobertura verificada, se requiere revisión del
            operador.
          </p>
        </details>
        {error && <p role="alert">{error}</p>}
        <button className="primary" type="submit">
          Guardar regla
        </button>
      </fieldset>
    </form>
  );
}

function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const [id, setId] = useState("liza"),
    [password, setPassword] = useState(""),
    [error, setError] = useState("");
  return (
    <main className="commerce">
      <form
        className="co-zone-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void api("login", { id, password })
            .then(() => onLogin())
            .catch((e) =>
              setError(
                e instanceof Error ? e.message : "No se pudo iniciar sesión",
              ),
            );
        }}
      >
        <h1>Inicia sesión</h1>
        <label>
          Agente
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="primary">Entrar al workspace</button>
      </form>
    </main>
  );
}

function ReadinessPanel({ data, run }: { data: Data; run: Run }) {
  return (
    <section className="co-zone-editor">
      <p className="eyebrow">STAGING / TEST</p>
      <h2>Preparación y UAT · {data.readiness?.overall ?? "NOT READY"}</h2>
      <p>
        Los estados indican lo comprobado. Una configuración presente no
        confirma onboarding ni aceptación del cliente.
      </p>
      <div className="co-readiness-grid">
        {Object.entries(data.readiness?.components ?? {}).map(
          ([name, check]) => (
            <article className="co-quote" key={name}>
              <h3>{name}</h3>
              <strong>{check.status}</strong>
              <p>{check.detail}</p>
              {check.checkedAt && (
                <small>{new Date(check.checkedAt).toLocaleString()}</small>
              )}
            </article>
          ),
        )}
      </div>
      {data.actor.role === "admin" && (
        <div className="co-row">
          <button
            onClick={() =>
              void run({ provider: "paymennt" }, "admin/diagnostics")
            }
          >
            Comprobar Paymennt TEST
          </button>
          <button
            onClick={() => void run({ provider: "geo" }, "admin/diagnostics")}
          >
            Comprobar Mapbox
          </button>
        </div>
      )}
      <p>
        Solo lectura: estas comprobaciones no crean cobros ni envían mensajes.
        Pueden consumir una consulta del proveedor.
      </p>
      <h3>Diez escenarios de aceptación</h3>
      <ol className="co-audit">
        {data.uatScenarios?.map((s) => (
          <li key={s.id}>
            {s.title}
            <strong> · {s.status}</strong>
            <p>{s.reason}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
