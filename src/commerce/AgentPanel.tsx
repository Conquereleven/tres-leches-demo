import { useOps } from "./ops-i18n";
import { useEffect, useState } from "react";
import type { Conversation } from "../../server/domain/model";
import type { Mode } from "../../server/agents/model";
import { faqKeys } from "./agent-labels";
import type { Workspace } from "./api";
import { money } from "./api";
type Run = (body: Record<string, unknown>, path?: string) => Promise<boolean>;
const toolLabels: Record<string, string> = {
  search_catalog: "Consultar catálogo",
  get_product: "Consultar producto",
  get_current_order: "Revisar pedido",
  create_draft_order: "Crear borrador",
  add_order_item: "Añadir producto",
  remove_order_item: "Quitar producto",
  set_delivery_location: "Guardar dirección",
  resolve_delivery_zone: "Resolver zona",
  check_order_eligibility: "Validar pedido",
  get_payment_status: "Consultar pago",
  prepare_payment_request: "Preparar enlace de pago",
  get_business_faq: "Consultar información aprobada",
  request_human_handoff: "Pedir ayuda humana",
};
export function AgentPanel({
  c,
  data,
  run,
}: {
  c: Conversation;
  data: Workspace;
  run: Run;
}) {
  const { t } = useOps();
  const session = data.ai?.sessions[c.id];
  const latest = data.ai?.runs.filter((r) => r.conversationId === c.id).at(-1);
  const [text, setText] = useState(""),
    [mode, setMode] = useState<Mode>(
      session?.mode ?? data.ai?.defaultMode ?? "copilot",
    );
  useEffect(() => {
    setText(latest?.suggestion ?? "");
  }, [latest?.id, latest?.suggestion]);
  const owned = c.assignedAgent === data.actor.id;
  const suggest = latest?.status === "suggested";
  const ready = !!data.ai?.configured && !!data.ai.enabled;
  const pending = latest?.actions[latest.approvedActions];
  const args = pending
    ? (JSON.parse(pending.arguments) as {
        productId?: string;
        quantity?: number;
        address?: string;
      })
    : {};
  const product = data.catalog.find((p) => p.id === args.productId);
  const payment = latest?.tools.find(
    (t) => t.name === "prepare_payment_request",
  );
  const invoke = (action: "send" | "reject" | "action", edit = false) =>
    run(
      {
        id: c.id,
        runId: latest?.id,
        version: c.version,
        action,
        ...(edit ? { text } : {}),
      },
      "ai/approve",
    );
  return (
    <section
      className="co-ai-panel"
      aria-label={t("Asistente de conversación")}
    >
      <div className="co-ai-heading">
        <h3>{t("Asistente 3L")}</h3>
        <span>
          {t(session?.state ?? "AI_ACTIVE")} · {t(session?.mode ?? "copilot")}
        </span>
      </div>
      {!ready && (
        <p>
          {t(
            "AI NOT CONFIGURED · Configura el proveedor y el modelo para generar sugerencias. No se enviará nada automáticamente.",
          )}
        </p>
      )}
      <p className="co-ai-caption">
        {t(
          "Copilot propone; el equipo aprueba. Importes, catálogo y pagos vienen del sistema.",
        )}
      </p>
      <div className="co-ai-controls">
        <button
          onClick={() =>
            void run(
              { id: c.id, version: c.version, action: "takeover" },
              "ai/control",
            )
          }
        >
          {t("Tomar control humano")}
        </button>
        <button
          onClick={() =>
            void run(
              { id: c.id, version: c.version, action: "pause" },
              "ai/control",
            )
          }
        >
          {t("Pausar IA")}
        </button>
        <label>
          {t("Modo de asistencia")}
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
          >
            <option value="copilot">{t("Copilot")}</option>
            <option value="supervised_auto">
              {t("Automático supervisado")}
            </option>
            {data.ai?.autonomousAllowed && (
              <option value="autonomous_bounded">
                {t("Autonomía limitada")}
              </option>
            )}
          </select>
        </label>
        <button
          disabled={!ready}
          onClick={() =>
            void run(
              { id: c.id, version: c.version, action: "return", mode },
              "ai/control",
            )
          }
        >
          {t("Devolver a IA")}
        </button>
      </div>
      {(session?.handoffReason || latest?.handoffReason) && (
        <p className="co-ai-handoff" role="status">
          {t("Revisión humana:")}{" "}
          {session?.handoffReason ?? latest?.handoffReason}
        </p>
      )}
      {latest?.status === "running" && (
        <p role="status">{t("Preparando una sugerencia privada…")}</p>
      )}
      {latest?.intent && (
        <p>
          {t("Intención:")}
          <strong>{latest.intent}</strong>
          {t("· Confianza:")} {Math.round((latest.confidence ?? 0) * 100)}{" "}
          {t("% ·")} {latest.disposition}
        </p>
      )}
      {latest?.suggestion && (
        <>
          <label>
            {t("Sugerencia privada")}
            <textarea
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="co-ai-controls">
            <button
              disabled={!owned || !suggest || latest?.responseApproved}
              onClick={() => void invoke("send")}
            >
              {t("Aprobar y enviar")}
            </button>
            <button
              disabled={
                !owned || !suggest || !!latest?.responseApproved || !text.trim()
              }
              onClick={() => void invoke("send", true)}
            >
              {t("Enviar texto editado")}
            </button>
            <button
              disabled={!owned || !suggest}
              onClick={() => void invoke("reject")}
            >
              {t("Rechazar sugerencia")}
            </button>
          </div>
        </>
      )}
      <button
        disabled={!ready || latest?.status === "running"}
        onClick={() =>
          void run({ id: c.id, version: c.version }, "ai/generate")
        }
      >
        {latest ? t("Regenerar sugerencia") : t("Generar sugerencia")}
      </button>
      {latest?.tools.length ? (
        <details>
          <summary>
            {t("Consultas y acciones (")} {latest.tools.length})
          </summary>
          <ul>
            {latest.tools.map((tool, i) => (
              <li key={i}>
                {t(toolLabels[tool.name] ?? tool.name)} · {tool.code}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {pending && (
        <div className="co-ai-action">
          <h4>{t(toolLabels[pending.name] ?? pending.name)}</h4>
          <p>
            {t("Acción")} {latest!.approvedActions + 1} {t("de")}{" "}
            {latest!.actions.length}{" "}
            {t(". Requiere aprobación del responsable.")}
          </p>
          {args.productId && (
            <p>
              {args.quantity ? `${args.quantity} × ` : ""}
              {product?.name ?? args.productId}
              {product
                ? ` · ${t(money(product.priceFils))} / ${t("unidad")}`
                : ""}
            </p>
          )}
          {args.address && (
            <p>
              {t("Dirección propuesta:")} {args.address}
            </p>
          )}
          {pending.name === "prepare_payment_request" && (
            <dl>
              <dt>{t("Total del pedido")}</dt>
              <dd>{t(money(payment?.quote?.totalFils))}</dd>
              <dt>{t("Zona")}</dt>
              <dd>{payment?.quote?.zoneName ?? t("Por resolver")}</dd>
              <dt>{t("Mínimo")}</dt>
              <dd>
                {payment?.quote?.minOrderAed == null
                  ? t("Por confirmar")
                  : t(money(payment.quote.minOrderAed * 100))}
              </dd>
              <dt>{t("Entrega")}</dt>
              <dd>{t(money(payment?.quote?.feeFils))}</dd>
              <dt>{t("Validación")}</dt>
              <dd>
                {payment?.code} · {payment?.quote?.reason}
              </dd>
            </dl>
          )}
          <button
            disabled={!owned || !suggest}
            onClick={() => void invoke("action")}
          >
            {pending.name === "prepare_payment_request"
              ? t("Aprobar enlace de pago")
              : t("Aprobar acción")}
          </button>
        </div>
      )}
      {data.ai?.enquiries
        .filter((e) => e.conversationId === c.id)
        .slice(-1)
        .map((e) => (
          <div className="co-ai-action" key={e.inboundId}>
            <h4>{t("Consulta personalizada · cotización humana")}</h4>
            <p>
              {e.occasion ?? t("Ocasión por confirmar")} ·{" "}
              {e.servings
                ? `${e.servings} personas`
                : t("Porciones por confirmar")}{" "}
              · {e.desiredDate ?? t("Fecha por confirmar")}
            </p>
            <p>{e.referenceNotes}</p>
          </div>
        ))}
      {!owned && (
        <p className="co-ai-caption">
          {t(
            "Toma la conversación y regenera antes de aprobar. Una sugerencia desactualizada nunca se envía.",
          )}
        </p>
      )}
    </section>
  );
}
export function AgentKnowledgeEditor({
  data,
  run,
}: {
  data: Workspace;
  run: Run;
}) {
  const { t } = useOps();
  const [key, setKey] = useState("ordering"),
    [language, setLanguage] = useState("en"),
    [content, setContent] = useState(""),
    [approved, setApproved] = useState(false);
  const current = data.ai?.knowledge?.find(
    (k) => k.key === key && k.language === language,
  );
  useEffect(() => {
    setContent(current?.content ?? "");
    setApproved(current?.approved ?? false);
  }, [key, language, current?.version, current?.content, current?.approved]);
  if (data.actor.role !== "admin") return null;
  return (
    <details className="co-ai-knowledge">
      <summary>{t("Conocimiento aprobado para el asistente")}</summary>
      <p>
        {t(
          "Vacío significa información no disponible. Solo publica contenido confirmado por 3L.",
        )}
      </p>
      <div className="co-ai-controls">
        <label>
          {t("Tema")}
          <select value={key} onChange={(e) => setKey(e.target.value)}>
            {faqKeys.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          {t("Idioma")}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="en">{t("English")}</option>
            <option value="es">{t("Español")}</option>
          </select>
        </label>
      </div>
      <label>
        {t("Contenido del negocio")}
        <textarea
          value={content}
          maxLength={3000}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
        />
      </label>
      <label className="co-check">
        <input
          type="checkbox"
          checked={approved}
          onChange={(e) => setApproved(e.target.checked)}
        />
        {t("Aprobado para responder a clientes")}
      </label>
      <button
        onClick={() =>
          void run(
            {
              key,
              language,
              content: content.trim() || null,
              approved,
              version: current?.version ?? 0,
            },
            "ai/knowledge",
          )
        }
      >
        {t("Guardar conocimiento")}
      </button>
    </details>
  );
}
