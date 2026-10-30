import { paidEmailLabel } from "./customer-email-status";
import { Login } from "./Login";
import { AnalyticsWorkspace } from "./Analytics";
import { lineKey, preparationText } from "../../shared/pack-composition";
import {
  orderProductName,
  productOptionLabel,
  setPublishedProductNames,
} from "./product-names";
import { OperationalProductName } from "./OperationalProductName";
import { OperationsOverview, OperationsSettings } from "./OperationsOverview";
import { ProductHub } from "./ProductHub";
import { PrintCenter } from "./PrintCenter";
import { OpsProvider, useOps } from "./ops-i18n";
import { OperationsShell } from "./OperationsShell";
import { ChatsCircle, Receipt, Oven, Truck } from "@phosphor-icons/react";
import { AgentPanel, AgentKnowledgeEditor } from "./AgentPanel";
import { useCallback, useEffect, useState, useRef } from "react";
import type {
  Conversation,
  Order,
  DeliveryZone,
  OrderState,
} from "../../server/domain/model";
import { api, ApiError, money, type Workspace as Data } from "./api";
import { OrderCard } from "./OrdersBoard";
import { OrdersList } from "./OrdersList";
import { OrderDetailsPage, OrderPageHeading } from "./OrderDetails";
import {
  orderPath,
  orderLines,
  parseListQuery,
  parseOperationsPath,
  serializeListQuery,
  type ListQuery,
} from "./order-view";
import { byDue, dubaiDate } from "./orders-board";
import { orderReference } from "../../shared/order-number";
import "./commerce.css";
import "./operations-shell.css";
import "./oms.css";
type Run = (body: Record<string, unknown>, path?: string) => Promise<boolean>;
const LIST_SCROLL = "3l-oms-list-scroll";
/** Current view and order from the address bar; old `?order=` links are upgraded in place. */
function readRoute() {
  const route = parseOperationsPath(location.pathname, location.search);
  if (route.legacy)
    history.replaceState(history.state, "", orderPath(route.orderId));
  return { view: route.view, orderId: route.orderId };
}
export function CommerceWorkspace() {
  return (
    <OpsProvider>
      {location.pathname === "/operations/analytics" ? (
        <AnalyticsWorkspace />
      ) : (
        <WorkspaceInner />
      )}
    </OpsProvider>
  );
}
function WorkspaceInner() {
  const { t, formatDate, setUser, language, errorText } = useOps();
  const [data, setData] = useState<Data | null>(null),
    [sessionExpired, setSessionExpired] = useState(false),
    [offline, setOffline] = useState(() => !navigator.onLine),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [route, setRoute] = useState(readRoute),
    [listQuery, setListQuery] = useState<ListQuery>(() =>
      parseListQuery(location.search),
    ),
    [selected, setSelected] = useState(""),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [unread, setUnread] = useState(false),
    [agent, setAgent] = useState("all"),
    [status, setStatus] = useState("all");
  const view = route.view;
  // One place reads the address bar, so Back, Forward and direct links agree.
  const sync = useCallback(() => {
    const next = readRoute();
    setRoute(next);
    if (next.view === "orders" && !next.orderId)
      setListQuery(parseListQuery(location.search));
  }, []);
  const go = useCallback(
    (path: string, state: Record<string, unknown> = {}) => {
      history.pushState(state, "", path);
      sync();
    },
    [sync],
  );
  useEffect(() => {
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [sync]);
  // Returning to the list puts the operator back where they were.
  const onList = view === "orders" && !route.orderId;
  useEffect(() => {
    if (!onList) return;
    let top: string | null = null;
    try {
      top = sessionStorage.getItem(LIST_SCROLL);
      sessionStorage.removeItem(LIST_SCROLL);
    } catch {
      /* Scroll restore is a convenience only. */
    }
    if (top) requestAnimationFrame(() => window.scrollTo(0, Number(top)));
  }, [onList]);
  useEffect(() => {
    setUser(data?.actor.id ?? null);
  }, [data?.actor.id, setUser]);
  const pending = useRef(new Map<string, string>());
  const mutationActive = useRef(false);
  const expired = useRef(false);
  const generation = useRef(0);
  const reading = useRef<{
    controller: AbortController;
    promise: Promise<void>;
  } | null>(null);
  const readError = useRef("");
  const invalidateRead = useCallback(() => {
    generation.current++;
    reading.current?.controller.abort();
    reading.current = null;
  }, []);
  const refresh = useCallback((afterMutation = false): Promise<void> => {
    if (
      (!afterMutation && mutationActive.current) ||
      !navigator.onLine ||
      document.visibilityState === "hidden"
    )
      return Promise.resolve();
    if (reading.current) return reading.current.promise;
    const controller = new AbortController();
    const current = ++generation.current;
    const promise = (async () => {
      try {
        const next = await api<Data>("workspace", undefined, undefined, {
          signal: controller.signal,
        });
        if (current !== generation.current || controller.signal.aborted) return;
        // Before rendering: names approved in Product Hub for staff screens and tickets.
        setPublishedProductNames(next.productNames);
        setData(next);
        const wasExpired = expired.current;
        expired.current = false;
        setSessionExpired(false);
        // Clear recovered transport errors, never hide a rejected command.
        const previousReadError = readError.current;
        setError((previous) =>
          wasExpired || previous === previousReadError ? "" : previous,
        );
        readError.current = "";
      } catch (e) {
        if (current !== generation.current || controller.signal.aborted) return;
        if (e instanceof ApiError && e.status === 401) {
          expired.current = true;
          setSessionExpired(true);
          setData(null);
        } else {
          readError.current =
            e instanceof Error ? e.message : "Unable to connect. Try again.";
          setError(readError.current);
        }
      } finally {
        if (current === generation.current) reading.current = null;
      }
    })();
    reading.current = { controller, promise };
    return promise;
  }, []);
  const resumeAfterLogin = useCallback(async () => {
    // The login response may arrive while hidden/offline. Release the expired
    // session latch so foreground/reconnect can fetch the authorized workspace.
    // Private data still renders only after a successful workspace response.
    expired.current = false;
    setSessionExpired(false);
    setError("");
    await refresh();
  }, [refresh]);
  useEffect(() => {
    void refresh();
    const tick = () => {
      if (!expired.current) void refresh();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") invalidateRead();
      else tick();
    };
    const connection = () => {
      setOffline(!navigator.onLine);
      if (navigator.onLine) tick();
      else invalidateRead();
    };
    const timer = setInterval(tick, 3000);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      document.removeEventListener("visibilitychange", visibility);
      invalidateRead();
    };
  }, [refresh, invalidateRead]);
  const run: Run = async (body, path = "commands") => {
    // A ref closes the same-event double-tap window before React re-renders.
    if (mutationActive.current || expired.current || !navigator.onLine)
      return false;
    mutationActive.current = true;
    invalidateRead();
    setBusy(true);
    setError("");
    const signature = path + JSON.stringify(body);
    const key = pending.current.get(signature) ?? crypto.randomUUID();
    pending.current.set(signature, key);
    try {
      await api(path, body, key);
      pending.current.delete(signature);
      await refresh(true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      if (e instanceof ApiError && e.status === 401) {
        expired.current = true;
        setSessionExpired(true);
        setData(null);
      } else await refresh(true);
      return false;
    } finally {
      mutationActive.current = false;
      setBusy(false);
    }
  };
  if (!data && sessionExpired) return <Login onLogin={resumeAfterLogin} />;
  if (!data)
    return (
      <main className="commerce ops-shell ops-auth" lang={language}>
        <h1>{t("Workspace de operaciones")}</h1>
        {error || offline ? (
          <div role="alert">
            {offline
              ? t(
                  "Offline. Showing the last received data. Reconnect before changing orders.",
                )
              : errorText(error)}
            <button onClick={() => void refresh()}>
              {t("Reintentar conexión")}
            </button>
          </div>
        ) : (
          <div aria-busy="true" className="co-skeleton">
            {t("Cargando conversaciones y pedidos…")}
          </div>
        )}
      </main>
    );
  const c = data.conversations.find((c) => c.id === selected),
    orders = data.orders.filter((o) => o.conversationId === selected);
  const shown = data.conversations.filter(
    (c) =>
      // Website orders have no chat to answer; they live on the orders board,
      // and only become actionable once paid.
      c.sourceNumberId !== "web" &&
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
    <OperationsShell
      data={data}
      view={view}
      busy={busy}
      onNavigate={(id) =>
        id === "analytics"
          ? location.assign("/operations/analytics")
          : go(`/operations/${id}`)
      }
      onRefresh={() => void refresh()}
      onLogout={() => void run({}, "logout")}
      heading={
        view === "orders" && route.orderId ? (
          <OrderPageHeading
            data={data}
            orderId={route.orderId}
            onBack={() => {
              // Came from the list: Back restores its filters and position.
              if ((history.state as { omsList?: boolean } | null)?.omsList)
                history.back();
              else go(`/operations/orders${serializeListQuery(listQuery)}`);
            }}
          />
        ) : undefined
      }
    >
      {offline && (
        <p className="co-error" role="status">
          {t(
            "Offline. Showing the last received data. Reconnect before changing orders.",
          )}
        </p>
      )}
      {data.integrationHealth?.inboundFailed ? (
        <p className="co-error" role="alert">
          {t("Hay")} {data.integrationHealth.inboundFailed}{" "}
          {t("notificaciones pendientes de revisión técnica.")}
        </p>
      ) : null}
      {error && (
        <div className="co-error" role="alert">
          {errorText(error)}
          <button
            onClick={() => {
              setError("");
              void refresh();
            }}
          >
            {t("Actualizar datos")}
          </button>
        </div>
      )}
      <fieldset className="co-fieldset" disabled={busy || offline}>
        {view === "overview" ? (
          <OperationsOverview
            data={data}
            onNavigate={(id) =>
              id === "analytics"
                ? location.assign("/operations/analytics")
                : go(`/operations/${id}`)
            }
          />
        ) : view === "products" ? (
          <ProductHub actor={data.actor} />
        ) : view === "print" ? (
          <PrintCenter data={data} />
        ) : view === "settings" ? (
          <OperationsSettings data={data} />
        ) : (
          <>
            {view === "readiness" &&
            data.environment === "staging" &&
            data.actor.role === "admin" ? (
              <ReadinessPanel data={data} run={run} />
            ) : view === "zones" ? (
              <Zones key="zones" data={data} run={run} />
            ) : view === "inbox" ? (
              <div className="co-grid">
                <aside
                  aria-label={t("Conversaciones")}
                  className={`co-list${shown.length ? "" : " co-list-empty"}`}
                >
                  <div className="co-filters">
                    <div className="co-number-tabs">
                      {["all", ...data.numbers.map((n) => n.id)].map((id) => (
                        <button
                          key={id}
                          aria-pressed={filter === id}
                          onClick={() => setFilter(id)}
                        >
                          {id === "all" ? t("All") : id.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <label>
                      {t("Buscar conversación")}
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t("Cliente, teléfono o mensaje")}
                      />
                    </label>
                    <div className="co-two">
                      <label>
                        {t("Agente")}
                        <select
                          value={agent}
                          onChange={(e) => setAgent(e.target.value)}
                        >
                          <option value="all">{t("Todos")}</option>
                          <option value="none">{t("Sin asignar")}</option>
                          {data.agents.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t("Estado")}
                        <select
                          value={status}
                          onChange={(e) => setStatus(e.target.value)}
                        >
                          <option value="all">{t("Todos")}</option>
                          <option value="open">{t("Abierta")}</option>
                          <option value="closed">{t("Cerrada")}</option>
                        </select>
                      </label>
                    </div>
                    <label className="co-check">
                      <input
                        type="checkbox"
                        checked={unread}
                        onChange={(e) => setUnread(e.target.checked)}
                      />
                      {t("Solo no leídas")}
                    </label>
                  </div>
                  {shown.length === 0 && (
                    <p className="co-empty">
                      {data.conversations.length
                        ? t("Sin conversaciones para estos filtros.")
                        : t(
                            "No conversations yet. Las conversaciones aparecerán aquí al recibir mensajes en los números conectados.",
                          )}
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
                        {item.messages.at(-1)?.text ||
                          t("Ubicación compartida")}
                      </span>
                      <small>
                        {item.assignedAgent ?? t("Sin asignar")} ·{" "}
                        {item.unread ? t("● No leída") : t("Leída")} ·{" "}
                        {t(
                          data.orders.find(
                            (o) =>
                              o.conversationId === item.id &&
                              !["Delivered", "Cancelled"].includes(o.state),
                          )?.state ?? item.status,
                        )}
                      </small>
                    </button>
                  ))}
                </aside>
                {c ? (
                  <>
                    <ConversationPanel key={c.id} c={c} data={data} run={run} />
                    <aside
                      aria-label={t("Pedido y cliente")}
                      className="co-order-side"
                    >
                      <div className="co-section">
                        <p className="eyebrow">{t("PEDIDOS VINCULADOS")}</p>
                        <h2>{t("Pedido y entrega")}</h2>
                        <p>
                          {c.customer} · {c.phone}
                        </p>
                        <button
                          className="primary"
                          disabled={
                            !c.assignedAgent ||
                            c.assignedAgent !== data.actor.id ||
                            orders.some(
                              (o) =>
                                !["Delivered", "Cancelled"].includes(o.state),
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
                          {t("Crear pedido")}
                        </button>
                      </div>
                      {orders.length === 0 ? (
                        <p className="co-empty">
                          {t("Toma la conversación y crea el primer pedido.")}
                        </p>
                      ) : (
                        orders.map((o) => (
                          <OrderPanel
                            key={o.id}
                            order={o}
                            data={data}
                            run={run}
                          />
                        ))
                      )}
                      <div className="ops-copilot-slot">
                        <AgentPanel key={c.id} c={c} data={data} run={run} />
                      </div>
                      <div className="co-section">
                        <h3>{t("Actividad de conversación")}</h3>
                        <ul className="co-audit">
                          {c.audit.map((a, i) => (
                            <li key={i}>
                              {a.action}
                              <small>
                                {a.actor} · {formatDate(a.at)}
                              </small>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </aside>
                  </>
                ) : (
                  <div className="ops-inbox-welcome">
                    <span className="ops-empty-icon">
                      <ChatsCircle size={32} aria-hidden="true" />
                    </span>
                    <p className="ops-kicker">{t("TU ESPACIO DE ATENCIÓN")}</p>
                    <h2>{t("Cada conversación, bien atendida.")}</h2>
                    <p>
                      {t(
                        "Selecciona una conversación para gestionar mensajes, pedidos y asistencia de AI Copilot en un solo lugar.",
                      )}
                    </p>
                    <div className="ops-welcome-foot">
                      {t("Conversación · Pedido · Seguimiento")}
                    </div>
                  </div>
                )}
              </div>
            ) : view === "orders" && route.orderId ? (
              <OrderDetailsPage
                data={data}
                orderId={route.orderId}
                run={run}
                busy={busy}
                openConversation={(id) => {
                  setSelected(id);
                  go("/operations/inbox");
                }}
                builder={(o) => <OrderPanel order={o} data={data} run={run} />}
              />
            ) : view === "orders" ? (
              <OrdersList
                data={data}
                query={listQuery}
                onQuery={(next) => {
                  history.replaceState(
                    history.state,
                    "",
                    `/operations/orders${serializeListQuery(next)}`,
                  );
                  setListQuery(next);
                }}
                onOpen={(id) => {
                  try {
                    sessionStorage.setItem(LIST_SCROLL, String(window.scrollY));
                  } catch {
                    /* Scroll restore is a convenience only. */
                  }
                  go(orderPath(id), { omsList: true });
                  window.scrollTo(0, 0);
                }}
              />
            ) : (
              <div className="co-board">
                {boardOrders(data, view).length > 0 && (
                  <ul className="ops-order-list" aria-label={t("Pedidos")}>
                    {boardOrders(data, view).map((o) => (
                      <li key={o.id}>
                        <OrderCard
                          order={o}
                          data={data}
                          run={run}
                          today={dubaiDate()}
                          details={(o) => (
                            <OrderPanel order={o} data={data} run={run} />
                          )}
                          openConversation={(id) => {
                            setSelected(id);
                            go("/operations/inbox");
                          }}
                          openOrder={(id) => go(orderPath(id))}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {boardOrders(data, view).length === 0 && (
                  <div className="ops-board-empty">
                    <span className="ops-empty-icon">
                      {view === "production" ? (
                        <Oven size={30} />
                      ) : view === "delivery" ? (
                        <Truck size={30} />
                      ) : (
                        <Receipt size={30} />
                      )}
                    </span>
                    <h2>
                      {view === "production"
                        ? t("La cocina está al día")
                        : view === "delivery"
                          ? t("Las próximas entregas, aquí")
                          : t("Todo listo para el primer pedido")}
                    </h2>
                    <p className="co-empty">
                      {view === "production"
                        ? t(
                            "No production items yet. Los pedidos confirmados aparecerán aquí al pasar a producción.",
                          )
                        : t(
                            "No orders yet. Los pedidos aparecerán aquí cuando el equipo los registre.",
                          )}
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </fieldset>
    </OperationsShell>
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
  const { t, formatDate } = useOps();
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
          {owned ? t("Liberar conversación") : t("Tomar conversación")}
        </button>
      </header>
      <div className="co-two co-chat-tools">
        <label>
          {t("Asignar agente")}
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
            <option value="">{t("Sin asignar")}</option>
            {data.agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Conversación")}
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
            <option value="open">{t("Abierta")}</option>
            <option value="closed">{t("Cerrada")}</option>
          </select>
        </label>
      </div>
      <div className="co-messages">
        <button
          className="co-link"
          onClick={() => setTranslation(!translation)}
        >
          {translation ? t("Ocultar traducción") : t("Ver traducción")}
        </button>
        {c.messages.map((m) => (
          <div key={m.id} className={"co-message " + m.direction}>
            <p>{m.text}</p>
            {m.media && (
              <p>
                {t("Archivo recibido; revisar en WhatsApp")} · {m.media.type}
                {m.media.filename ? ` · ${m.media.filename}` : ""}
              </p>
            )}
            {m.location && (
              <p>
                {t("GPS ·")} {m.location.lat}, {m.location.lng}
              </p>
            )}
            {translation && m.translation && (
              <p className="co-translation">
                {t("Internal English ·")} {m.translation}
              </p>
            )}
            <small>
              {m.origin === "business-app" &&
                `${t("Enviado desde WhatsApp Business App")} · `}
              {m.origin === "history" && `${t("Historial importado")} · `}
              {formatDate(m.at)} · {t(m.status)}{" "}
              {m.direction === "out" && `· ${c.sourceNumberId.toUpperCase()}`}
            </small>
          </div>
        ))}
      </div>
      <div className="co-chat-bottom">
        <div className="co-compose">
          <label className="sr-only" htmlFor="co-draft">
            {t("Mensaje")}
          </label>
          <textarea
            id="co-draft"
            value={draft}
            disabled={!owned || c.status === "closed"}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t(
              owned
                ? "Escribe tu respuesta…"
                : "Toma la conversación para responder",
            )}
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
            {t("Enviar")}
          </button>
        </div>
        <p className="co-muted">
          {t("Las respuestas salen desde")} {c.sourceNumberId.toUpperCase()}{" "}
          {t(". Traducciones solo para uso interno.")}
        </p>

        {data.jobs
          .filter(
            (j) =>
              c.messages.some((m) => m.id === j.entityId) &&
              ["failed", "unknown"].includes(j.status),
          )
          .map((j) => (
            <p className="co-error" key={j.id}>
              {t("Operation needs review")}{" "}
              <details>
                <summary>{t("Technical details")}</summary>
                {j.lastError}
              </details>
              {j.status === "failed" && (
                <button
                  onClick={() => void run({ type: "retryJob", id: j.id })}
                >
                  {t("Reintentar envío")}
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
  const { t, formatDate } = useOps();
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
    Ready: o.fulfillmentMethod === "pickup" ? "Delivered" : "Out for Delivery",
    "Out for Delivery": "Delivered",
  };
  return (
    <section className="co-order" data-testid="order-panel">
      <div className="co-row">
        <h3>{orderReference(o)}</h3>
        <span className="co-state">
          {o.fulfillmentMethod === "pickup" ? t("PICKUP") : t("DELIVERY")} ·{" "}
          {t(o.state)}
        </span>
      </div>
      {o.publicOrderNumber && (
        <p className="co-internal-ref">
          {t("Referencia interna:")} {o.id}
        </p>
      )}
      <OrderNotifications order={o} data={data} />
      {p?.provider === "paymennt" &&
        (owned || ["admin", "manager"].includes(data.actor.role)) && (
          <button
            onClick={() => void run({ paymentId: p.id }, "payments/reconcile")}
          >
            {t("Check Status · conciliar pago")}
          </button>
        )}
      <fieldset className="co-fieldset" disabled={!owned}>
        <ul className="co-lines">
          {o.lines.map((l) => (
            <li key={lineKey(l)}>
              <span>
                {l.quantity} ×{" "}
                <OperationalProductName
                  product={orderProductName(o, l.productId, data.catalog)}
                  id={l.productId}
                />
                {preparationText(l) && (
                  <small lang="en">{preparationText(l)}</small>
                )}
              </span>
              <span>
                {(() => {
                  const price =
                    orderLines(data, o).find(
                      (line) => lineKey(line) === lineKey(l),
                    )?.unitFils ?? null;
                  return price === null
                    ? t("Review required")
                    : t(money(price * l.quantity));
                })()}
              </span>
              {editable && (
                <button
                  aria-label={t("Remove item") + " " + l.productId}
                  onClick={() =>
                    void run({
                      type: "editOrder",
                      id: o.id,
                      version: o.version,
                      lines: o.lines.filter((x) => lineKey(x) !== lineKey(l)),
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
                {t("Producto")}
                <select
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                >
                  {data.catalog.map((p) => (
                    <option value={p.id} key={p.id}>
                      {productOptionLabel(p.id, p.name)} ·{" "}
                      {t(money(p.priceFils))}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("Cantidad")}
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
                {t(
                  "Catálogo pendiente de aprobación. Los productos estarán disponibles cuando se configure el catálogo oficial.",
                )}
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
              {t("Guardar producto")}
            </button>
            {o.fulfillmentMethod !== "pickup" && (
              <>
                <label>
                  {t("Dirección / zona manual")}
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder={t("Zona, edificio y apartamento")}
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
                  {t("Resolver dirección")}
                </button>
                <details>
                  <summary>{t("Revisar y seleccionar zona")}</summary>
                  <p>
                    {t(
                      "Confirma la ubicación con el cliente. La selección queda registrada.",
                    )}
                  </p>
                  <label>
                    {t("Zona confirmada")}
                    <select
                      value={manualZone}
                      onChange={(e) => setManualZone(e.target.value)}
                    >
                      <option value="">{t("Seleccionar zona")}</option>
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
                    {t("Motivo de la selección")}
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
                    {t("Confirmar zona manual")}
                  </button>
                </details>
              </>
            )}
          </>
        )}
        <div className={"co-quote " + (o.quote?.eligible ? "eligible" : "")}>
          <b>
            {o.fulfillmentMethod === "pickup"
              ? t("Pickup · Pastelerías 3L")
              : (o.quote?.zoneName ?? t("Ubicación pendiente"))}
          </b>
          <p>
            {o.fulfillmentMethod === "pickup"
              ? `${o.pickup?.pickupDate ? formatDate(o.pickup.pickupDate, false) : t("Sin fecha")} · ${o.pickup?.preferredTime}`
              : o.location
                ? `GPS ${o.location.lat}, ${o.location.lng}`
                : (o.address ??
                  t("Espera la ubicación del cliente o ingresa su dirección."))}
          </p>
          <dl>
            <dt>
              {o.fulfillmentMethod === "pickup"
                ? t("Mínimo de zona")
                : o.quote?.deliveryRule?.mode === "flexible"
                  ? t("Free delivery threshold AED")
                  : t("Mínimo de compra")}
            </dt>
            <dd>
              {t(
                money(
                  o.quote?.minOrderAed == null
                    ? null
                    : o.quote.minOrderAed * 100,
                ),
              )}
            </dd>
            <dt>{t("Delivery")}</dt>
            <dd>{t(money(o.quote?.feeFils))}</dd>
            <dt>{t("Productos")}</dt>
            <dd>{t(money(o.quote?.subtotalFils))}</dd>
            <dt>{t("Total")}</dt>
            <dd>{t(money(o.quote?.totalFils))}</dd>
          </dl>
          <strong>
            {editable
              ? (o.quote?.reason ?? t("Agrega productos y ubicación"))
              : t("Regla aplicada al pedido")}
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
            {t("Request Payment")}
          </button>
        )}
        {!p && (
          <p className="co-empty">
            {t(
              "No payments yet. El estado aparecerá aquí al solicitar el pago del pedido.",
            )}
          </p>
        )}
        {p && (
          <div className="co-payment">
            <h4>
              {t("Pago ·")} {t(p.status)}
            </h4>
            <p>
              {t(money(p.amountFils))} · {p.currency}
            </p>
            {p.url && (
              <p className="co-payment-url">
                {t("Enlace generado y encolado por")}{" "}
                {c.sourceNumberId.toUpperCase()}.
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
                  {t("Reenviar enlace")}
                </button>
              </>
            )}
            {p.provider === "paymennt" && (
              <>
                <p>
                  {t("Última conciliación:")}{" "}
                  {p.lastReconciledAt
                    ? formatDate(p.lastReconciledAt)
                    : t("Pendiente")}
                </p>
              </>
            )}
            <ul className="co-audit">
              {p.timeline.map((a, i) => (
                <li key={i}>
                  {a.action}
                  <small>
                    {a.actor} · {formatDate(a.at)}
                  </small>
                </li>
              ))}
            </ul>
            {p.transactionId && (
              <small>
                {t("Transacción:")} {p.transactionId}
              </small>
            )}
            {data.jobs
              .filter((j) => j.entityId === p.id && j.status === "unknown")
              .map((j) => (
                <p key={j.id} className="co-error">
                  {t("Operation needs review")}{" "}
                  <details>
                    <summary>{t("Technical details")}</summary>
                    {j.lastError}
                  </details>{" "}
                  {t(". Usa Check Status para buscar el checkout existente.")}
                </p>
              ))}
            {data.jobs
              .filter((j) => j.entityId === p.id && j.status === "failed")
              .map((j) => (
                <button
                  key={j.id}
                  onClick={() => void run({ type: "retryJob", id: j.id })}
                >
                  {t("Reintentar creación del enlace")}
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
            {t("Avanzar a")} {t(next[o.state] ?? "")}
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
            {t("Cancelar pedido")}
          </button>
        )}
      </fieldset>
      <details className="co-history">
        <summary>
          {t("Historial del pedido ·")} {o.audit.length} {t("eventos")}
        </summary>
        <ol className="co-audit">
          {o.audit.map((a, i) => (
            <li key={i}>
              {a.action}
              <small>
                {a.actor} · {formatDate(a.at)}
              </small>
            </li>
          ))}
        </ol>
      </details>
      {!owned && (
        <p className="co-muted">
          {t("Toma o reabre la conversación para gestionar este pedido.")}
        </p>
      )}
    </section>
  );
}
function Zones({ data, run }: { data: Data; run: Run }) {
  const { t } = useOps();
  const [search, setSearch] = useState(""),
    [id, setId] = useState("jvc");
  const [newZone, setNewZone] = useState<DeliveryZone | null>(null);
  const zone = newZone ?? data.zones.find((z) => z.id === id) ?? data.zones[0];
  return (
    <section className="co-zones">
      <aside>
        <h2>{t("Zonas de entrega")}</h2>
        {data.actor.role === "admin" && (
          <button
            type="button"
            disabled={!!newZone}
            onClick={() =>
              setNewZone({
                id: crypto.randomUUID(),
                name: "",
                aliases: [],
                minOrderAed: null,
                deliveryFeeAed: 0,
                freeDelivery: true,
                active: false,
                priority: 10,
                version: 0,
              })
            }
          >
            {t("New delivery area")}
          </button>
        )}
        <p>
          {t("Tabla aprobada ·")} {data.zones.length}{" "}
          {t("configurable delivery rules.")}
        </p>
        <label>
          {t("Buscar zona")}
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
                onClick={() => {
                  setNewZone(null);
                  setId(z.id);
                }}
              >
                <span>{z.name}</span>
                <b>
                  {z.deliveryPolicy
                    ? t(money(z.deliveryPolicy.freeDeliveryThresholdFils))
                    : z.minOrderAed === null
                      ? t("Revisar mínimo")
                      : t(money(z.minOrderAed * 100))}
                </b>
                <small>
                  {z.deliveryPolicy
                    ? `${t("Delivery fee below threshold")}: ${t(money(z.deliveryPolicy.belowThresholdFeeFils))} · `
                    : t("Sin cargo adicional ·")}{" "}
                  {z.active ? t("Activa") : t("Inactiva")}
                </small>
              </button>
            ))}
        </div>
      </aside>
      {zone ? (
        <ZoneEditor
          key={`${zone.id}-${zone.version}`}
          zone={zone}
          disabled={data.actor.role !== "admin"}
          run={run}
          creating={!!newZone}
          onCreated={(createdId) => {
            setId(createdId);
            setNewZone(null);
          }}
          onCancel={() => setNewZone(null)}
        />
      ) : (
        <p className="co-empty">{t("No delivery areas configured")}</p>
      )}
    </section>
  );
}
function ZoneEditor({
  zone,
  disabled,
  run,
  creating = false,
  onCreated,
  onCancel,
}: {
  zone: DeliveryZone;
  disabled: boolean;
  run: Run;
  creating?: boolean;
  onCreated?: (id: string) => void;
  onCancel?: () => void;
}) {
  const { t, errorText } = useOps();
  const [draft, setDraft] = useState(zone),
    [polygon, setPolygon] = useState(
      zone.polygon ? JSON.stringify(zone.polygon) : "",
    ),
    [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="co-zone-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (saving) return;
        try {
          const parsed: unknown = polygon.trim()
            ? JSON.parse(polygon)
            : undefined;
          setError("");
          setSaving(true);
          void run({
            type: creating ? "createZone" : "updateZone",
            zone: {
              ...draft,
              aliases: draft.aliases.map((a) => a.trim()).filter(Boolean),
              polygon: parsed,
            },
          })
            .then((ok) => {
              if (ok && creating) onCreated?.(draft.id);
            })
            .finally(() => setSaving(false));
        } catch {
          setError(
            "Polígono inválido: usa una lista JSON de coordenadas lat/lng.",
          );
        }
      }}
    >
      <p className="eyebrow">{t("REGLA CONFIGURABLE")}</p>
      <h2>{creating ? t("New delivery area") : zone.name}</h2>
      {zone.minOrderAed == null && (
        <p className="ops-rule-warning">
          {t(
            "Regla pendiente de revisión. Esta zona no permite solicitar el pago hasta confirmar los valores comerciales.",
          )}
        </p>
      )}
      <fieldset className="co-fieldset" disabled={disabled || saving}>
        <label>
          {t("Nombre")}
          <input
            required
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label>
          {t("Aliases · uno por línea")}
          <textarea
            value={draft.aliases.join("\n")}
            onChange={(e) =>
              setDraft({ ...draft, aliases: e.target.value.split("\n") })
            }
          />
        </label>
        <div className="co-two">
          <label>
            {draft.deliveryPolicy
              ? t("Free delivery threshold AED")
              : t("Mínimo AED")}
            <input
              type="number"
              required={creating}
              min="0"
              step="0.01"
              value={
                draft.deliveryPolicy
                  ? draft.deliveryPolicy.freeDeliveryThresholdFils / 100
                  : (draft.minOrderAed ?? "")
              }
              onChange={(e) =>
                setDraft({
                  ...draft,
                  ...(draft.deliveryPolicy
                    ? {
                        deliveryPolicy: {
                          ...draft.deliveryPolicy,
                          freeDeliveryThresholdFils: Math.round(
                            Number(e.target.value) * 100,
                          ),
                        },
                      }
                    : {
                        minOrderAed:
                          e.target.value === "" ? null : Number(e.target.value),
                      }),
                })
              }
            />
          </label>
        </div>
        <label className="co-check">
          <input
            type="checkbox"
            checked={!!draft.deliveryPolicy}
            onChange={(e) => {
              const { deliveryPolicy: _previous, ...legacy } = draft;
              setDraft(
                e.target.checked
                  ? {
                      ...draft,
                      deliveryPolicy: {
                        mode: "flexible",
                        freeDeliveryThresholdFils: Math.round(
                          (draft.minOrderAed ?? 0) * 100,
                        ),
                        belowThresholdFeeFils: 0,
                      },
                    }
                  : legacy,
              );
            }}
          />
          {t("Allow delivery below threshold with a fee")}
        </label>
        {draft.deliveryPolicy && (
          <label>
            {t("Delivery fee below threshold AED")}
            <input
              type="number"
              required
              min="0"
              max="10000"
              step="0.01"
              value={draft.deliveryPolicy.belowThresholdFeeFils / 100}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  deliveryPolicy: {
                    ...draft.deliveryPolicy!,
                    belowThresholdFeeFils: Math.round(
                      Number(e.target.value) * 100,
                    ),
                  },
                })
              }
            />
          </label>
        )}
        <p>
          {t(
            "Flexible delivery changes only new quotes. Accepted orders keep their stored fee.",
          )}
        </p>
        <label className="co-check">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
          />
          {t("Zona activa")}
        </label>
        <label>
          {t("Prioridad")}
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
          {t("Nota de revisión")}
          <textarea
            value={draft.review ?? ""}
            onChange={(e) => setDraft({ ...draft, review: e.target.value })}
          />
        </label>
        <details>
          <summary>{t("Límites geográficos · configuración avanzada")}</summary>
          <label>
            {t("Identificadores geográficos verificados · uno por línea")}
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
            {t("Polígono JSON · puntos lat/lng")}
            <textarea
              value={polygon}
              onChange={(e) => setPolygon(e.target.value)}
              placeholder={t("Polígono aprobado en formato JSON")}
            />
          </label>
          <p>
            {t(
              "La ubicación se verificará con el proveedor geográfico o con límites aprobados. Sin cobertura verificada, se requiere revisión del operador.",
            )}
          </p>
        </details>
        {error && <p role="alert">{errorText(error)}</p>}
        <button className="primary" type="submit">
          {t(creating ? "Create area" : "Guardar regla")}
        </button>
        {creating && (
          <button type="button" onClick={onCancel}>
            {t("Cancel new area")}
          </button>
        )}
      </fieldset>
    </form>
  );
}

function ReadinessPanel({ data, run }: { data: Data; run: Run }) {
  const { t, formatDate } = useOps();
  const [latitude, setLatitude] = useState(""),
    [longitude, setLongitude] = useState("");
  const labels: Record<string, string> = {
    database: "Base de datos",
    authentication: "Acceso y roles",
    PaymenntNotification: "Firma Paymennt",
    PaymenntWebhook: "Registro webhook",
    PaymenntLastNotification: "Última notificación",
    PaymenntReconciliation: "Conciliación",
    PaymenntPending: "Notificaciones pendientes",
    MetaAccount: "Cuenta Meta",
    GeoProvider: "Conexión Mapbox",
    GeoMapping: "Cobertura GPS",
    Commercial: "Reglas de entrega",
    Catalog: "Catálogo aprobado",
    backup: "Copias de seguridad",
    APP_ENV: "Entorno",
    UAT: "Aceptación con Lisa",
  };
  return (
    <section className="co-zone-editor co-readiness-panel">
      <p className="eyebrow">{t("STAGING / TEST")}</p>
      <h2>
        {t("Preparación y UAT ·")} {data.readiness?.overall ?? t("NOT READY")}
      </h2>
      <p>
        {t(
          "Los estados indican lo comprobado. Una configuración presente no confirma onboarding ni aceptación del cliente.",
        )}
      </p>
      {[
        ["Infraestructura", /^(APP_ENV|HTTPS|authentication|UAT)$/],
        ["Meta WhatsApp", /^(Meta|WA[123])/i],
        ["Paymennt", /^Paymennt/i],
        ["AI Copilot", /^AI/i],
        ["Catálogo", /^Catalog/i],
        ["Ubicación y reglas", /^(Geo|Commercial)/i],
        ["Storage y backups", /^(database|backup)$/],
        ["Otros sistemas", /./],
      ].map(([group, pattern], index, groups) => {
        const checks = Object.entries(data.readiness?.components ?? {}).filter(
          ([name]) =>
            (pattern as RegExp).test(name) &&
            !groups
              .slice(0, index)
              .some(([, previous]) => (previous as RegExp).test(name)),
        );
        return checks.length ? (
          <section className="ops-readiness-group" key={t(String(group))}>
            <h2>{t(String(group))}</h2>
            <div className="co-readiness-grid">
              {checks.map(([name, check]) => (
                <article className="co-quote" key={name}>
                  <h3>{t(labels[name] ?? name)}</h3>
                  <strong data-status={check.status}>{t(check.status)}</strong>
                  <p>{check.detail}</p>
                  {check.checkedAt && (
                    <small>{formatDate(check.checkedAt)}</small>
                  )}
                </article>
              ))}
            </div>
          </section>
        ) : null;
      })}
      {data.actor.role === "admin" && (
        <div className="co-readiness-actions">
          <button
            onClick={() =>
              void run({ provider: "paymennt" }, "admin/diagnostics")
            }
          >
            {t("Comprobar Paymennt TEST")}
          </button>
          <button
            onClick={() => void run({ provider: "meta" }, "admin/diagnostics")}
          >
            {t("Validar configuración Meta")}
          </button>
          <label>
            {t("Latitud real")}
            <input
              aria-label={t("Latitud real")}
              inputMode="decimal"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
            />
          </label>
          <label>
            {t("Longitud real")}
            <input
              aria-label={t("Longitud real")}
              inputMode="decimal"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
            />
          </label>
          <button
            onClick={() =>
              void run(
                {
                  provider: "geo",
                  ...(latitude && longitude
                    ? {
                        location: {
                          lat: Number(latitude),
                          lng: Number(longitude),
                        },
                      }
                    : {}),
                },
                "admin/diagnostics",
              )
            }
          >
            {t("Comprobar Mapbox")}
          </button>
        </div>
      )}
      <p>
        {t(
          "Solo lectura: estas comprobaciones no crean cobros ni envían mensajes. Pueden consumir una consulta del proveedor.",
        )}
      </p>
      <AgentKnowledgeEditor data={data} run={run} />
      <h3>{t("Validación con Lisa")}</h3>
      <p>
        {t(
          "Completa las pruebas con cuentas reales siguiendo el runbook de activación. Esta pantalla no acredita aceptación del cliente.",
        )}
      </p>
      <ol className="co-audit">
        {data.uatScenarios?.map((s) => (
          <li key={s.id}>
            {s.title}
            <strong> · {t(s.status)}</strong>
            <p>{s.reason}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function boardOrders(data: Data, view: string) {
  return data.orders
    .filter((o) =>
      (view === "production"
        ? ["Confirmed", "Production", "Ready"]
        : ["Ready", "Out for Delivery", "Delivered"]
      ).includes(o.state),
    )
    .sort(byDue);
}

const EMAIL_EVENT: Record<string, string> = {
  ORDER_PAID: "Payment confirmation",
  ORDER_PRODUCTION_STARTED: "En producción",
  ORDER_READY_FOR_PICKUP: "Listo para pickup",
  ORDER_OUT_FOR_DELIVERY: "En camino",
};
/**
 * What was recorded for this order and what actually happened to it. A row is
 * only ever "Enviado" when a provider confirmed it; otherwise it says why not.
 */
function OrderNotifications({ order, data }: { order: Order; data: Data }) {
  const { t } = useOps();
  const whatsapp = (data.operationsNotifications ?? []).filter(
    (n) => n.orderId === order.id,
  );
  const emails = (data.customerNotifications ?? []).filter(
    (n) => n.orderId === order.id,
  );
  const internalEmails = (data.operationsEmailNotifications ?? []).filter(
    (n) => n.orderId === order.id,
  );
  if (!whatsapp.length && !emails.length && !internalEmails.length) return null;
  return (
    <ul className="co-notifications" aria-label={t("Notificaciones")}>
      {whatsapp.map((n) => (
        <li key={n.id} data-status={n.status}>
          <b>
            {t("WhatsApp interno ·")} {n.recipient.name}
          </b>{" "}
          {n.status === "accepted"
            ? t("WhatsApp API accepted")
            : n.status === "delivered"
              ? t("Entregado")
              : n.status === "read"
                ? t("WhatsApp receipt read")
                : n.status === "suppressed"
                  ? t("WhatsApp alert not eligible")
                  : n.status === "sending"
                    ? t("WhatsApp sending requires review")
                    : n.status === "sent"
                      ? t("Enviado")
                      : n.status === "failed"
                        ? t("Falló · revisar")
                        : data.operationsOutboundEnabled
                          ? t("Pendiente")
                          : t("Pendiente · envío de WhatsApp desactivado")}
        </li>
      ))}
      {internalEmails.map((n) => (
        <li key={n.id} data-status={n.status}>
          <b>{t("Internal email · new paid order")}</b>{" "}
          {n.status === "sent"
            ? t("Enviado")
            : n.status === "failed"
              ? t("Falló · revisar")
              : n.status === "sending"
                ? t("Enviando")
                : data.operationsEmailProvider
                  ? t("Pendiente")
                  : t("Pendiente · proveedor de email no configurado")}
        </li>
      ))}
      {emails.map((n) => (
        <li key={n.id} data-status={n.status}>
          <b>
            {t("Email al cliente ·")} {t(EMAIL_EVENT[n.event] ?? n.event)}
          </b>{" "}
          {n.event === "ORDER_PAID"
            ? t(paidEmailLabel(n))
            : n.status === "sent"
              ? t("Enviado")
              : n.status === "failed"
                ? n.lastError?.startsWith("Expired")
                  ? t("No enviado · caducó")
                  : t("Falló · revisar")
                : n.status === "sending"
                  ? t("Enviando")
                  : data.customerEmailProvider
                    ? t("Pendiente")
                    : t("Pendiente · proveedor de email no configurado")}
        </li>
      ))}
    </ul>
  );
}
