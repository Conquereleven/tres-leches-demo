import { acceptedPackPricesCurrent } from "./pack-pricing";
import {
  applyWhatsAppContact,
  applyWhatsAppHistoryMedia,
  applyWhatsAppMessage,
  latestCustomerInbound,
} from "./whatsapp-inbound";
import { validatePackLines, snapshotPackLines } from "./packs";
import { distinctLines } from "../../shared/pack-composition";
import { frozenCheckout } from "./frozen-checkout";
import { PaymenntProvider } from "../adapters/paymennt";
import { orderBillingAddress, toPaymenntDeliveryAddress } from "./billing";
import {
  notificationIdentity,
  type PaymenntNotification,
} from "../adapters/paymennt-notification";
import { agentFingerprint } from "./agent-state";
import { trace, safeLog } from "../observability";
import { ProviderFailure } from "../adapters/failure";
import type { AuthoritativeCheckout } from "./checkout";
import { createHash, randomUUID } from "node:crypto";
import {
  type Actor,
  type State,
  type Conversation,
  type Order,
  type Payment,
  type Job,
  type NotificationReceipt,
  requireThat,
  now,
  numbers,
  DomainError,
} from "./model";
import {
  type Command,
  commandSchema,
  inboundSchema,
  paymentEventSchema,
} from "./commands";
import { type GeoService, quoteOrder } from "./zones";
import { normalizeAreaName } from "./delivery-areas";
import { recordPaidOperationsEmail } from "./operations-email";
import { recordOrderPaid, applyOperationsReceipt } from "./notifications";
import {
  recordCustomerEvent,
  recordPaidCustomerConfirmation,
} from "./customer-notifications";
import { assignPublicOrderNumber } from "./order-number";
import { recordCustomerEmailV2 } from "./customer-email-v2";
import { transition } from "./workflow";
import { Store } from "../db/store";
import {
  type WhatsAppProvider,
  type PaymentProvider,
  sourceOf,
} from "../adapters/providers";
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const at = () => ({ at: now() });
export class CommerceService {
  agentAutomationAllowed = false;
  deliveryAddressMode: "legacy" | "google" = "google";
  enqueueAgentReply(runId: string) {
    return this.store.write((s) => {
      const run = s.ai?.runs.find((r) => r.id === runId);
      requireThat(
        run &&
          run.status === "suggested" &&
          run.suggestion &&
          run.disposition === "AUTOMATED_LOW_RISK",
        "AI proposal unavailable",
        409,
      );
      const c = this.conversation(s, run.conversationId),
        session = s.ai!.sessions[c.id]!;
      requireThat(
        this.agentAutomationAllowed &&
          c.version === run.version &&
          c.assignedAgent === run.owner &&
          session.epoch === run.epoch &&
          session.state === "AI_ACTIVE" &&
          session.activeRunId === run.id &&
          c.sourceNumberId === run.sourceNumberId &&
          c.status === "open" &&
          agentFingerprint(s, c) === run.fingerprint,
        "AI send aborted: context changed",
        409,
      );
      const inbound = latestCustomerInbound(c);
      requireThat(
        inbound &&
          Date.now() - Date.parse(inbound.at) < 86400000 &&
          Date.parse(inbound.at) <= Date.now(),
        "AI service window blocked",
        409,
      );
      this.message(s, c, run.suggestion);
      c.messages.at(-1)!.agentGuard = {
        runId,
        version: c.version,
        owner: c.assignedAgent,
        epoch: session.epoch,
        sourceNumberId: c.sourceNumberId,
      };
      run.status = "queued";
      c.audit.push({
        at: now(),
        actor: "ai-agent",
        action: "Approved low-risk AI response queued",
      });
    });
  }

  constructor(
    public store: Store,
    public wa: WhatsAppProvider,
    public payment: PaymentProvider,
    public geo: GeoService = { resolve: () => null },
    private timeoutMs = 10000,
    public operationalNumbers = numbers,
    public agentIds = ["liza", "andrea"],
  ) {}
  /** Public site origin, used only to build internal links in team alerts. */
  operationsOrigin?: string;
  /** Private configuration; absent until the manager's number is supplied. */
  operationsManagerPhone?: string;
  operationsEmailRecipients: string[] = [];
  /** Explicit new-only customer paid-confirmation epoch; absent means disabled. */
  customerPaidEmailSince?: string;
  /** Customer email flow V2 epoch (confirmation + window email); absent means disabled. */
  customerEmailV2Since?: string;
  /** Opt-in subset of Operations recipients; empty means original email for all. */
  operationsEmailCompactRecipients: string[] = [];
  /**
   * Activation timestamp for external-only Paymennt acknowledgements.
   * When absent, no unmatched checkout can be auto-closed as external.
   * Historical receipts received before this cutoff stay open for a separately
   * approved reconciliation, even when Paymennt retries their signatures.
   */
  externalCheckoutAcknowledgementSince?: number;
  private async bounded<T>(work: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Provider timeout")),
            this.timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  private conversation(s: State, id: string) {
    const c = s.conversations.find((c) => c.id === id);
    requireThat(c, "Conversación no encontrada", 404);
    return c;
  }
  private order(s: State, id: string) {
    const o = s.orders.find((o) => o.id === id);
    requireThat(o, "Pedido no encontrado", 404);
    return o;
  }
  private version(entity: { version: number }, version: number) {
    requireThat(
      entity.version === version,
      "Otro operador actualizó este registro. Actualiza e intenta de nuevo.",
    );
  }
  private owned(c: Conversation, actor: Actor) {
    requireThat(
      c.assignedAgent === actor.id,
      "Toma la conversación antes de actuar",
    );
    requireThat(c.status === "open", "Reabre la conversación para continuar");
  }
  private quote(s: State, o: Order) {
    o.quote = quoteOrder(
      s.zones,
      o.lines,
      o.address,
      o.location,
      this.geo,
      o.manualZoneId,
      s.catalog ?? [],
      o.fulfillmentMethod,
    );
  }
  private enqueue(s: State, kind: Job["kind"], entityId: string) {
    s.jobs.push({
      id: randomUUID(),
      correlationId: trace.getStore() ?? randomUUID(),
      kind,
      entityId,
      status: "pending",
      attempts: 0,
      nextAt: Date.now(),
    });
  }
  private message(
    s: State,
    c: Conversation,
    text: string,
    paymentContext?: { amountAed: string; url: string },
  ) {
    // Public web orders have no WhatsApp origin. Never route them through a default number.
    if (c.sourceNumberId === "web") return;
    const id = randomUUID();
    c.messages.push({
      id,
      direction: "out",
      paymentContext,
      text,
      at: now(),
      status: "queued",
    });
    c.version++;
    this.enqueue(s, "message", id);
  }
  command(raw: unknown, key: string, actor: Actor): unknown {
    const cmd = commandSchema.parse(raw);
    requireThat(
      /^[a-zA-Z0-9_-]{8,120}$/.test(key),
      "Idempotency-Key requerido",
      400,
    );
    return this.store.write((s) => {
      const commandKey = `${actor.id}:${key}`,
        digest = hash(cmd);
      const previous = s.commands[commandKey];
      if (previous) {
        requireThat(
          previous.hash === digest,
          "Idempotency key reutilizada con datos distintos",
        );
        return previous.result;
      }
      const entity = this.apply(s, cmd, actor) as {
        id: string;
        version?: number;
        state?: string;
      };
      // Receipts must not duplicate entire conversation histories on every command.
      const result = {
        id: entity.id,
        version: entity.version,
        state: entity.state,
      };
      s.commands[commandKey] = { hash: digest, result };
      return result;
    });
  }
  private apply(s: State, cmd: Command, actor: Actor): unknown {
    if (cmd.type === "createZone") {
      requireThat(
        actor.role === "admin",
        "Only administrators can create delivery areas",
        403,
      );
      requireThat(
        /^[a-z0-9][a-z0-9-]{0,99}$/.test(cmd.zone.id),
        "Invalid delivery area ID",
        422,
      );
      requireThat(
        cmd.zone.version === 0,
        "A new delivery area must start at version zero",
        422,
      );
      requireThat(
        cmd.zone.minOrderAed !== null,
        "Confirm the approved minimum before creating an area",
        422,
      );
      requireThat(
        cmd.zone.deliveryFeeAed === 0 && cmd.zone.freeDelivery,
        "Delivery has no separate charge; edit only the area minimum",
        422,
      );
      const zone = {
        ...cmd.zone,
        name: cmd.zone.name.trim(),
        aliases: [
          ...new Set(cmd.zone.aliases.map((a) => a.trim()).filter(Boolean)),
        ],
        version: 1,
      };
      const labels = [zone.name, ...zone.aliases].map(normalizeAreaName);
      requireThat(
        labels.every(Boolean),
        "Delivery area names must contain letters or numbers",
        422,
      );
      requireThat(
        !s.zones.some(
          (existing) =>
            existing.id === zone.id ||
            [existing.name, ...existing.aliases].some((label) =>
              labels.includes(normalizeAreaName(label)),
            ),
        ),
        "A delivery area with this ID, name or alias already exists",
        409,
      );
      s.zones.push(zone);
      s.audit.push({
        ...at(),
        actor: actor.id,
        action: `Delivery area ${zone.id} created: ${JSON.stringify(zone)}`,
      });
      return zone;
    }
    if (cmd.type === "updateZone") {
      requireThat(
        actor.role === "admin",
        "Solo administradores pueden editar zonas",
        403,
      );
      requireThat(
        cmd.zone.deliveryFeeAed === 0 && cmd.zone.freeDelivery,
        "Delivery has no separate charge; edit only the area minimum",
        422,
      );
      const index = s.zones.findIndex((z) => z.id === cmd.zone.id);
      requireThat(index >= 0, "Zona no encontrada", 404);
      this.version(s.zones[index]!, cmd.zone.version);
      s.zones[index] = { ...cmd.zone, version: cmd.zone.version + 1 };
      s.audit.push({
        ...at(),
        actor: actor.id,
        action: `Zona ${cmd.zone.id} actualizada: ${JSON.stringify(cmd.zone)}`,
      });
      return s.zones[index];
    }
    if (cmd.type === "retryJob") {
      const j = s.jobs.find((j) => j.id === cmd.id);
      requireThat(j, "Envío no encontrado", 404);
      requireThat(
        j.status === "failed",
        "Solo se pueden reintentar fallos definitivos",
      );
      const c = s.conversations.find((c) =>
        c.messages.some((m) => m.id === j.entityId),
      );
      if (c) this.owned(c, actor);
      else {
        const p = s.payments.find((p) => p.id === j.entityId);
        requireThat(p, "Pago no encontrado");
        this.owned(
          this.conversation(s, this.order(s, p.orderId).conversationId),
          actor,
        );
      }
      j.attempts = 0;
      j.status = "pending";
      j.nextAt = Date.now();
      return { id: j.id };
    }
    if (
      ["assign", "conversationStatus", "read", "send", "createOrder"].includes(
        cmd.type,
      )
    ) {
      const c = this.conversation(s, cmd.id);
      this.version(c, cmd.version);
      if (cmd.type === "assign") {
        requireThat(
          ["admin", "manager"].includes(actor.role) ||
            cmd.agent === actor.id ||
            cmd.agent === null,
          "Asignación no permitida",
          403,
        );
        requireThat(
          !c.assignedAgent ||
            c.assignedAgent === actor.id ||
            ["admin", "manager"].includes(actor.role),
          "Ya asignada a otro agente",
        );
        requireThat(
          cmd.agent === null || this.agentIds.includes(cmd.agent),
          "Agente desconocido",
          400,
        );
        c.assignedAgent = cmd.agent;
        const ai = s.ai?.sessions[c.id];
        if (ai) {
          ai.state = "HUMAN_ACTIVE";
          ai.epoch++;
        }
        c.version++;
        c.audit.push({
          ...at(),
          actor: actor.id,
          action: `Asignación: ${cmd.agent ?? "sin agente"}`,
        });
        return c;
      }
      if (cmd.type === "read") {
        c.unread = false;
        c.version++;
        return c;
      }
      if (cmd.type === "conversationStatus") {
        requireThat(
          c.assignedAgent === actor.id,
          "Toma la conversación antes de actuar",
        );
        c.status = cmd.status;
        c.version++;
        return c;
      }
      this.owned(c, actor);
      if (cmd.type === "send") {
        const ai = s.ai?.sessions[c.id];
        if (ai) {
          ai.state = "HUMAN_ACTIVE";
          ai.epoch++;
        }
        this.message(s, c, cmd.text);
        return c;
      }
      if (cmd.type === "createOrder") {
        requireThat(
          !s.orders.some(
            (o) =>
              o.conversationId === c.id &&
              !["Delivered", "Cancelled"].includes(o.state),
          ),
          "Ya existe un pedido abierto",
        );
        const o: Order = {
          id: `TL-${randomUUID().slice(0, 8).toUpperCase()}`,
          conversationId: c.id,
          state: "New",
          version: 0,
          lines: [],
          quote: null,
          audit: [{ ...at(), actor: actor.id, action: "New" }],
          location: c.location,
          address: c.address,
        };
        s.orders.push(o);
        transition(o, "Building", actor.id);
        c.version++;
        return o;
      }
    }
    // The discriminated branches above exhaust conversation commands.
    if (
      cmd.type === "assign" ||
      cmd.type === "conversationStatus" ||
      cmd.type === "read" ||
      cmd.type === "send" ||
      cmd.type === "createOrder"
    )
      throw new DomainError(400, "Comando inválido");
    const o = this.order(s, cmd.id);
    this.version(o, cmd.version);
    const c = this.conversation(s, o.conversationId);
    this.owned(c, actor);
    if (cmd.type === "manualZone") {
      requireThat(
        o.fulfillmentMethod !== "pickup",
        "Pickup orders cannot have a delivery zone",
        422,
      );
      requireThat(
        ["Building", "Awaiting Location", "Minimum Check"].includes(o.state),
        "Pedido bloqueado",
      );
      requireThat(
        s.zones.some((z) => z.id === cmd.zoneId && z.active),
        "Zona inválida",
        400,
      );
      o.manualZoneId = cmd.zoneId;
      o.audit.push({
        ...at(),
        actor: actor.id,
        action: `Zona manual ${cmd.zoneId}: ${cmd.reason}`,
      });
      this.quote(s, o);
      if (o.state !== "Minimum Check") transition(o, "Minimum Check", actor.id);
      else o.version++;
      return o;
    }
    if (cmd.type === "editOrder" || cmd.type === "location") {
      requireThat(
        ["Building", "Awaiting Location", "Minimum Check"].includes(o.state),
        "Pedido bloqueado: existe un cobro o ya está en operación",
      );
      if (o.state !== "Building") transition(o, "Building", actor.id);
      if (cmd.type === "editOrder") {
        requireThat(distinctLines(cmd.lines), "Productos duplicados", 400);
        requireThat(
          cmd.lines.every((l) =>
            (s.catalog ?? []).some(
              (p) =>
                p.id === l.productId &&
                p.active !== false &&
                p.availability !== "unavailable",
            ),
          ),
          "Producto no disponible en catálogo aprobado",
          400,
        );
        validatePackLines(s, cmd.lines);
        o.lines = cmd.lines;
        o.catalogSnapshot = undefined;
      } else {
        requireThat(
          o.fulfillmentMethod !== "pickup",
          "Pickup orders cannot have a delivery location",
          422,
        );
        o.manualZoneId = undefined;
        o.address = cmd.address;
        o.location = cmd.location;
        c.address = cmd.address;
        c.location = cmd.location;
        c.version++;
      }
      this.quote(s, o);
      transition(
        o,
        o.fulfillmentMethod === "pickup" || o.address || o.location
          ? "Minimum Check"
          : "Awaiting Location",
        actor.id,
      );
      return o;
    }
    if (cmd.type === "requestPayment") {
      requireThat(
        o.state === "Minimum Check",
        "Completa productos y ubicación primero",
      );
      validatePackLines(s, o.lines);
      this.quote(s, o);
      requireThat(o.quote?.eligible, o.quote?.reason ?? "Ubicación requerida");
      requireThat(
        !s.payments.some(
          (p) =>
            p.orderId === o.id &&
            [
              "creating",
              "pending",
              "authorized",
              "pending_confirmation",
              "paid",
              "partially_refunded",
              "refunded",
              "chargeback",
            ].includes(p.status),
        ),
        "Ya existe una solicitud de pago activa",
      );
      const p: Payment = {
        id: randomUUID(),
        orderId: o.id,
        amountFils: o.quote!.totalFils!,
        currency: "AED",
        provider: this.payment.name,
        status: "creating",
        createdAt: now(),
        updatedAt: now(),
        timeline: [
          { ...at(), actor: actor.id, action: "Solicitud de pago creada" },
        ],
      };
      o.lines = snapshotPackLines(s, o.lines);
      o.catalogSnapshot = structuredClone(
        (s.catalog ?? []).filter((p) =>
          o.lines.some((l) => l.productId === p.id),
        ),
      );
      s.payments.push(p);
      o.paymentId = p.id;
      transition(o, "Awaiting Payment", actor.id);
      this.enqueue(s, "payment", p.id);
      return o;
    }
    if (cmd.type === "resendPayment") {
      const p = s.payments.find((p) => p.id === o.paymentId);
      requireThat(
        p?.url &&
          !p.supersededAt &&
          p.status === "pending" &&
          o.state === "Awaiting Payment",
        "No hay un enlace pendiente",
      );
      requireThat(
        this.payment.capabilities.resend,
        "El proveedor no admite reenvío",
      );
      this.message(
        s,
        c,
        `Your order total is AED ${(p.amountFils / 100).toFixed(2)}. Complete your payment here: ${p.url}`,
        { amountAed: (p.amountFils / 100).toFixed(2), url: p.url },
      );
      p.timeline.push({
        ...at(),
        actor: actor.id,
        action: "Reenvío solicitado",
      });
      o.version++;
      return o;
    }
    if (cmd.type === "transition") {
      if (
        ["Production", "Ready", "Out for Delivery", "Delivered"].includes(
          cmd.state,
        )
      )
        requireThat(
          s.payments.find((p) => p.id === o.paymentId)?.status === "paid",
          "Pago requiere revisión antes de fulfillment",
        );
      requireThat(
        !["Paid", "Confirmed", "Awaiting Payment"].includes(cmd.state),
        "Este estado solo puede ser aplicado por el flujo de pago",
      );
      if (cmd.state === "Cancelled" || cmd.state === "Building")
        requireThat(
          !s.payments.some(
            (p) =>
              p.orderId === o.id &&
              [
                "creating",
                "pending",
                "authorized",
                "pending_confirmation",
                "paid",
                "partially_refunded",
                "refunded",
                "chargeback",
              ].includes(p.status),
          ),
          "Resuelve o cancela el cobro con el proveedor antes de modificar el pedido",
        );
      const from = o.state;
      transition(o, cmd.state, actor.id);
      // Same transaction as the state change: the event exists if and only
      // if the transition committed, and at most once per order.
      recordCustomerEvent(s, o, from, cmd.state, this.customerEmailV2Since);
      return o;
    }
    throw new DomainError(400, "Comando no soportado");
  }
  acceptInboundBatch(rawEvents: unknown[]) {
    const events = rawEvents.map((e) => inboundSchema.parse(e));
    return this.store.write((s) => {
      s.inboundDeliveries ??= [];
      for (const event of events) {
        const previous = s.inboundDeliveries.find(
          (d) => d.id === event.eventId,
        );
        const digest = hash(event);
        if (previous)
          requireThat(
            previous.hash === digest,
            "Evento reutilizado con datos diferentes",
          );
        else
          s.inboundDeliveries.push({
            id: event.eventId,
            event,
            hash: digest,
            status: "pending",
            attempts: 0,
            nextAt: Date.now(),
          });
      }
      safeLog("webhook.accepted", { count: events.length });
      return { accepted: events.length };
    });
  }
  private async drainInbound() {
    const due = (this.store.read().inboundDeliveries ?? [])
      .filter((d) => d.status === "pending" && d.nextAt <= Date.now())
      .slice(0, 20);
    for (const delivery of due) {
      try {
        const event = inboundSchema.parse(delivery.event);
        if (
          event.type === "message" &&
          event.location &&
          event.origin !== "history" &&
          event.direction !== "out"
        ) {
          // A geocoder outage must not lose the customer's message; unresolved GPS stays blocked for manual review.
          try {
            await this.geo.prepare?.(event.location);
          } catch {
            /* The pure resolver returns no cached zone. */
          }
        }
        this.inbound(event);
        this.store.write((s) => {
          s.inboundDeliveries!.find((d) => d.id === delivery.id)!.status =
            "done";
        });
      } catch {
        this.store.write((s) => {
          const d = s.inboundDeliveries!.find((d) => d.id === delivery.id)!;
          d.attempts++;
          d.nextAt = Date.now() + Math.min(60000, 1000 * 2 ** d.attempts);
          if (d.attempts >= 12) d.status = "failed";
        });
      }
    }
  }
  inbound(raw: unknown) {
    const e = inboundSchema.parse(raw);
    return this.store.write((s) => {
      const key = `wa:${e.eventId}`,
        digest = hash(e);
      if (s.events[key]) {
        requireThat(
          s.events[key] === digest,
          "Evento reutilizado con datos diferentes",
        );
        return { duplicate: true };
      }
      if (
        e.type === "status" &&
        applyOperationsReceipt(s, e.providerId, e.status)
      ) {
        // Existing signed/idempotent inbound transaction owns this receipt.
      } else if (e.type === "status") {
        const m = s.conversations
          .filter(
            (c) => !e.sourceNumberId || c.sourceNumberId === e.sourceNumberId,
          )
          .flatMap((c) => c.messages)
          .find((m) => m.providerId === e.providerId);
        requireThat(m, "Mensaje todavía no disponible; reintentar", 503);
        const ranks = { sent: 1, delivered: 2, read: 3, failed: 0 };
        const current =
          m.status in ranks ? ranks[m.status as keyof typeof ranks] : 0;
        if (e.status === "failed") {
          if (current < 2) m.status = "failed";
        } else if (ranks[e.status] > current) m.status = e.status;
      } else if (e.type === "contact") {
        applyWhatsAppContact(s, e, this.operationalNumbers);
      } else if (e.type === "historyMedia") {
        requireThat(
          this.operationalNumbers.some((n) => n.id === e.sourceNumberId),
          "Número de origen desconocido",
          400,
        );
        applyWhatsAppHistoryMedia(s, e);
      } else if (e.type === "coexistence") {
        // Diagnostic observations are not registration/connection state or permission to send.
        s.whatsappAccountObservations ??= [];
        s.whatsappAccountObservations.push(e);
        if (s.whatsappAccountObservations.length > 1000)
          s.whatsappAccountObservations.shift();
      } else {
        const c = applyWhatsAppMessage(s, e, this.operationalNumbers);
        if (c && e.location) {
          c.location = e.location;
          c.address = undefined;
          for (const o of s.orders.filter(
            (o) =>
              o.conversationId === c!.id &&
              ["Building", "Awaiting Location", "Minimum Check"].includes(
                o.state,
              ),
          )) {
            o.manualZoneId = undefined;
            o.location = e.location;
            o.address = undefined;
            this.quote(s, o);
            if (o.state !== "Minimum Check")
              transition(o, "Minimum Check", "whatsapp");
            else o.version++;
            o.audit.push({
              ...at(),
              actor: "whatsapp",
              action: "Ubicación GPS recibida",
            });
          }
        }
      }
      s.events[key] = digest;
      return { duplicate: false };
    });
  }
  paymentWebhook(raw: unknown) {
    requireThat(
      !this.payment.getCheckout,
      "Usa conciliación autoritativa",
      403,
    );
    const e = paymentEventSchema.parse(raw);
    return this.store.write((s) => {
      const key = `payment:${e.eventId}`,
        digest = hash(e);
      if (s.events[key]) {
        requireThat(
          s.events[key] === digest,
          "Evento reutilizado con datos diferentes",
        );
        return { duplicate: true };
      }
      const p = s.payments.find((p) => p.providerReference === e.reference);
      requireThat(p, "Referencia no encontrada; reintentar", 503);
      requireThat(
        p.amountFils === e.amountFils && p.currency === e.currency,
        "Importe o moneda no coincide",
        400,
      );
      const o = this.order(s, p.orderId);
      if (p.status === "paid") {
        if (e.status === "paid")
          requireThat(
            p.transactionId === e.transactionId,
            "Transacción distinta para un pago conciliado",
            409,
          );
      } else if (e.status === "paid") {
        requireThat(
          !s.payments.some(
            (other) =>
              other.id !== p.id && other.transactionId === e.transactionId,
          ),
          "Transacción ya utilizada",
        );
        p.status = "paid";
        p.transactionId = e.transactionId;
        // A late success is money received, but must never silently resurrect a cancelled/replaced order.
        if (
          o.state === "Awaiting Payment" &&
          acceptedPackPricesCurrent(s, o) &&
          o.paymentId === p.id &&
          !s.payments.some(
            (other) =>
              other.id !== p.id &&
              other.orderId === o.id &&
              other.status === "paid",
          )
        ) {
          transition(o, "Paid", "payment-webhook");
          transition(o, "Confirmed", "payment-webhook");
          assignPublicOrderNumber(s, o);
        } else {
          p.timeline.push({
            ...at(),
            actor: "system",
            action:
              "Revisión requerida: pago tardío; conciliar antes de fulfillment",
          });
        }
      } else if (p.status === "pending") {
        p.status = e.status;
        if (o.state === "Awaiting Payment" && o.paymentId === p.id)
          transition(o, "Building", "payment-webhook");
      }
      p.updatedAt = now();
      p.timeline.push({
        ...at(),
        actor: "payment-webhook",
        action: `Evento ${e.status} · ${e.transactionId}`,
      });
      s.events[key] = digest;
      return { duplicate: false };
    });
  }
  async acceptPaymentNotification(event: PaymenntNotification) {
    const id = notificationIdentity(event);
    const receipt = this.store.write((s) => {
      s.paymentNotifications ??= [];
      const existing = s.paymentNotifications.find((r) => r.id === id);
      if (existing) return existing;
      const item: NotificationReceipt = {
        id,
        checkoutId: event.id,
        status: event.status,
        receivedAt: now(),
        nextAt: Date.now(),
        attempts: 0,
      };
      s.paymentNotifications.push(item);
      return item;
    });
    if (receipt.completedAt) return { duplicate: true };
    await this.reconcileNotification(id);
    return { duplicate: false };
  }
  /**
   * A signed notification names a checkout no payment here points to. Three
   * cases, told apart only by the provider's own record of that checkout:
   *  - ours, not yet associated (its request id is one of our payments, or
   *    its order id one of our orders): keep asking the provider to retry;
   *  - confirmed external (the provider returns the checkout and nothing on
   *    it refers to us): acknowledge and close the receipt;
   *  - anything else (lookup failed, checkout not found, identity mismatch):
   *    unknown, so keep asking the provider to retry.
   * Absence from our database alone is never treated as "external".
   */
  private async closeIfExternal(receiptId: string, checkoutId: string) {
    // Fail closed unless this receipt was first received after the explicitly
    // configured activation instant. Duplicate notifications preserve receivedAt.
    const receipt = this.store
      .read()
      .paymentNotifications?.find((r) => r.id === receiptId);
    const since = this.externalCheckoutAcknowledgementSince;
    if (
      !receipt ||
      since === undefined ||
      !Number.isFinite(since) ||
      !Number.isFinite(Date.parse(receipt.receivedAt)) ||
      Date.parse(receipt.receivedAt) < since ||
      this.store
        .read()
        .paymentNotifications?.some(
          (r) =>
            r.checkoutId === checkoutId &&
            r.id !== receiptId &&
            (!Number.isFinite(Date.parse(r.receivedAt)) ||
              Date.parse(r.receivedAt) < since),
        )
    )
      return false;
    if (!this.payment.describeCheckout) return false;
    let owner;
    try {
      owner = await this.payment.describeCheckout(checkoutId);
    } catch {
      return false;
    }
    if (owner.checkoutId !== checkoutId) return false;
    const closed = this.store.write((s) => {
      // Decided inside the write: an association that landed meanwhile wins.
      const ours =
        s.payments.some(
          (p) =>
            p.providerReference === checkoutId ||
            p.providerCheckoutId === checkoutId ||
            (owner.requestId !== null && p.id === owner.requestId),
        ) ||
        (owner.orderId !== null &&
          s.orders.some((o) => o.id === owner.orderId));
      const r = s.paymentNotifications?.find((r) => r.id === receiptId);
      if (
        ours ||
        !r ||
        r.completedAt ||
        !Number.isFinite(Date.parse(r.receivedAt)) ||
        Date.parse(r.receivedAt) < since ||
        s.paymentNotifications?.some(
          (other) =>
            other.checkoutId === checkoutId &&
            other.id !== receiptId &&
            (!Number.isFinite(Date.parse(other.receivedAt)) ||
              Date.parse(other.receivedAt) < since),
        )
      )
        return false;
      r.completedAt = now();
      r.outcome = "external";
      return true;
    });
    if (closed) safeLog("webhook.external", { status: "acknowledged" });
    return closed;
  }
  private async reconcileNotification(id: string) {
    const receipt = this.store
      .read()
      .paymentNotifications?.find((r) => r.id === id);
    if (!receipt || receipt.completedAt) return;
    const payment = this.store
      .read()
      .payments.find(
        (p) =>
          p.providerReference === receipt.checkoutId ||
          p.providerCheckoutId === receipt.checkoutId,
      );
    if (!payment && (await this.closeIfExternal(id, receipt.checkoutId)))
      return;
    try {
      requireThat(payment, "Checkout aún no asociado; reintentar", 503);
      await this.reconcile(
        payment.id,
        { id: "paymennt-notification", role: "admin" },
        id,
      );
    } catch (error) {
      this.store.write((s) => {
        const r = s.paymentNotifications!.find((r) => r.id === id)!;
        r.attempts++;
        r.nextAt =
          Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(r.attempts, 7));
      });
      throw error;
    }
  }
  private reconciling = new Set<string>();
  async reconcile(paymentId: string, actor: Actor, receiptId?: string) {
    const snapshot = this.store.read();
    const p = snapshot.payments.find((p) => p.id === paymentId);
    requireThat(p, "Pago no encontrado", 404);
    const order = this.order(snapshot, p.orderId);
    if (actor.role !== "admin" && actor.role !== "manager")
      this.owned(this.conversation(snapshot, order.conversationId), actor);
    requireThat(
      this.payment.getCheckout,
      "La conciliación requiere un proveedor de pagos configurado",
      409,
    );
    requireThat(!this.reconciling.has(paymentId), "Conciliación en curso", 409);
    this.reconciling.add(paymentId);
    try {
      const checkoutId = p.providerReference ?? p.providerCheckoutId;
      const checkout = checkoutId
        ? await this.payment.getCheckout(checkoutId)
        : await this.payment.findCheckout?.(p.id);
      requireThat(
        checkout,
        "Checkout aún no encontrado; no se creará otro cobro automáticamente",
        409,
      );
      if (p.checkoutFlow === "web" && checkout.url) {
        const redirect = new URL(checkout.url);
        requireThat(
          this.payment instanceof PaymenntProvider &&
            this.payment.isHostedRedirect(checkout.url) &&
            !redirect.username &&
            !redirect.password,
          "Untrusted checkout redirect",
          502,
        );
      }
      if (!checkoutId)
        this.store.write((s) => {
          const current = s.payments.find((x) => x.id === p.id)!;
          const job = s.jobs.find(
            (j) => j.kind === "payment" && j.entityId === p.id,
          );
          requireThat(
            job?.status === "unknown",
            "Espera al resultado de creación antes de recuperar",
            409,
          );
          requireThat(
            checkout.requestId === p.id &&
              checkout.orderId === p.orderId &&
              checkout.amountFils === p.amountFils &&
              checkout.currency === p.currency,
            "Checkout recuperado no coincide",
            409,
          );
          current.providerReference = checkout.checkoutId;
          current.providerCheckoutId = checkout.checkoutId;
          current.url = checkout.url;
          job.status = "done";
          current.timeline.push({
            ...at(),
            actor: actor.id,
            action: "Checkout recuperado por requestId; no se creó otro cobro",
          });
          if (checkout.status === "pending" && checkout.url)
            this.message(
              s,
              this.conversation(s, order.conversationId),
              `Your order total is AED ${(p.amountFils / 100).toFixed(2)}. Complete your payment here: ${checkout.url}`,
              { amountAed: (p.amountFils / 100).toFixed(2), url: checkout.url },
            );
        });
      if (receiptId) {
        const receipt = this.store
          .read()
          .paymentNotifications?.find((r) => r.id === receiptId);
        const expectedTerminal =
          receipt &&
          ["PAID", "FAILED", "EXPIRED", "CANCELLED", "REFUNDED"].includes(
            receipt.status.toUpperCase(),
          );
        requireThat(
          !(
            expectedTerminal &&
            ["pending", "authorized", "pending_confirmation"].includes(
              checkout.status,
            ) &&
            !["paid", "refunded", "partially_refunded", "chargeback"].includes(
              p.status,
            )
          ),
          "Checkout aún no refleja la notificación; reintentar conciliación",
          503,
        );
      }
      const result = this.applyCheckout(
        paymentId,
        checkout,
        actor.id,
        receiptId,
      );
      safeLog("reconciliation.complete", { status: result.status });
      return result;
    } finally {
      this.reconciling.delete(paymentId);
    }
  }
  applyCheckout(
    paymentId: string,
    checkout: AuthoritativeCheckout,
    actor: string,
    receiptId?: string,
  ) {
    return this.store.write((s) => {
      const p = s.payments.find((p) => p.id === paymentId)!;
      requireThat(
        checkout.checkoutId === (p.providerReference ?? p.providerCheckoutId) &&
          checkout.requestId === p.id &&
          checkout.orderId === p.orderId &&
          checkout.amountFils === p.amountFils &&
          checkout.currency === p.currency,
        "Conciliación bloqueada: referencia, importe o moneda no coincide",
        409,
      );
      const o = this.order(s, p.orderId);
      if (receiptId) {
        const receipt = s.paymentNotifications!.find(
          (r) => r.id === receiptId,
        )!;
        if (receipt.completedAt) return { status: p.status };
        receipt.completedAt = now();
        s.audit.push({
          at: now(),
          actor,
          action: "Verified Paymennt notification reconciled",
        });
      }
      const previous = p.status;
      if (
        ["refunded", "partially_refunded", "chargeback"].includes(
          checkout.status,
        ) &&
        previous !== checkout.status
      )
        p.timeline.push({
          ...at(),
          actor,
          action:
            "Revisión requerida: devolución/disputa; historial de fulfillment conservado",
        });
      const settled = ["paid", "partially_refunded", "refunded", "chargeback"];
      const regression =
        (settled.includes(previous) && !settled.includes(checkout.status)) ||
        (previous === "refunded" &&
          checkout.status !== "refunded" &&
          checkout.status !== "chargeback") ||
        (previous === "partially_refunded" && checkout.status === "paid") ||
        (previous === "chargeback" && checkout.status !== "chargeback");
      p.lastReconciledAt = now();
      p.providerRawStatus = checkout.rawStatus;
      if (regression) {
        p.timeline.push({
          ...at(),
          actor,
          action:
            "Estado anterior recibido: revisión requerida; no se revierte el pago",
        });
        return { status: p.status, reviewRequired: true };
      }
      p.status = checkout.status;
      p.updatedAt = now();
      if (previous !== p.status)
        p.timeline.push({
          ...at(),
          actor,
          action: `Conciliación Paymennt: ${previous} → ${p.status}`,
        });
      if (p.status === "paid" && !p.paidAt) {
        // Receipt time, not a fabricated provider transaction timestamp.
        p.paidAt = now();
        if (
          o.state === "Awaiting Payment" &&
          acceptedPackPricesCurrent(s, o) &&
          o.paymentId === p.id &&
          !s.payments.some(
            (other) =>
              other.id !== p.id &&
              other.orderId === o.id &&
              settled.includes(other.status),
          )
        ) {
          transition(o, "Paid", actor);
          transition(o, "Confirmed", actor);
          o.paidAt = p.paidAt;
          // The customer-facing number is issued here and only here: once,
          // in the same transaction that makes the order paid.
          assignPublicOrderNumber(s, o);
          // ORDER_PAID: the only place a paid-order alert is queued. This
          // branch runs once per payment (paidAt guard) and only when the
          // order was genuinely awaiting this payment; recordOrderPaid is
          // additionally idempotent per order.
          // V2 first: when it enrols the order, its confirmation takes the
          // single per-order ORDER_PAID slot and the legacy one is a no-op.
          recordCustomerEmailV2(s, o, p, this.customerEmailV2Since);
          recordPaidCustomerConfirmation(s, o, p, this.customerPaidEmailSince);
          recordPaidOperationsEmail(
            s,
            o,
            p,
            this.operationsEmailRecipients,
            this.operationsOrigin,
            this.operationsEmailCompactRecipients,
          );
          recordOrderPaid(
            s,
            o,
            p,
            this.operationsOrigin,
            this.operationsManagerPhone,
          );
        } else
          p.timeline.push({
            ...at(),
            actor,
            action: "Pago tardío: revisión manual antes de fulfillment",
          });
      }
      if (
        ["failed", "expired", "cancelled"].includes(p.status) &&
        o.paymentId === p.id &&
        o.state === "Awaiting Payment"
      )
        transition(o, "Building", actor);
      return { status: p.status };
    });
  }
  private async createHostedWebPayment(payment: Payment, snapshot: State) {
    requireThat(!payment.supersededAt, "Checkout superseded", 409);
    const parent = Object.values(snapshot.webCheckouts ?? {}).find(
      (record) =>
        record.supersededAt &&
        record.recoveryKey &&
        snapshot.webCheckouts?.[
          createHash("sha256").update(record.recoveryKey).digest("hex")
        ]?.orderId === payment.orderId,
    );
    if (parent)
      requireThat(
        snapshot.payments.some(
          (p) =>
            p.orderId === parent.orderId &&
            ["failed", "cancelled", "expired"].includes(p.status),
        ),
        "Previous checkout requires review",
        409,
      );
    requireThat(
      this.payment instanceof PaymenntProvider,
      "Web checkout unavailable",
      503,
    );
    const order = this.order(snapshot, payment.orderId);
    const customer = this.conversation(snapshot, order.conversationId);
    requireThat(
      (order.delivery ||
        (order.fulfillmentMethod === "pickup" && order.pickup)) &&
        payment.webReturnUrl &&
        order.customerDetails?.email,
      "Complete delivery and billing details required",
      409,
    );
    const frozen = frozenCheckout(order, payment);
    requireThat(
      acceptedPackPricesCurrent(snapshot, order),
      "Premium pricing changed; review required",
      409,
    );
    const names = customer.customer.trim().split(/\s+/);
    // Names captured separately are sent as given; only older orders are split.
    const firstName = order.customerDetails.firstName ?? names[0]!;
    const lastName =
      order.customerDetails.lastName ?? (names.slice(1).join(" ") || names[0]!);
    return this.payment.createWebPayment({
      paymentId: payment.id,
      orderId: order.id,
      amountFils: payment.amountFils,
      feeFils: frozen.feeFils,
      returnUrl: payment.webReturnUrl,
      items: frozen.items,
      customer: {
        firstName,
        lastName,
        email: order.customerDetails.email,
        phone: customer.phone,
      },
      billingAddress: orderBillingAddress(order.billing),
      ...(order.fulfillmentMethod === "pickup"
        ? {}
        : {
            deliveryAddress: toPaymenntDeliveryAddress(
              customer.customer,
              order.delivery!,
            ),
          }),
    });
  }
  async drain() {
    await this.drainInbound();
    const receiptsSnapshot = this.store.read();
    const since = this.externalCheckoutAcknowledgementSince;
    for (const receipt of (receiptsSnapshot.paymentNotifications ?? [])
      .filter((r) => {
        if (r.completedAt || r.nextAt > Date.now()) return false;
        // Keep historical unmatched records untouched by background cleanup;
        // otherwise 31 old receipts could starve newly received checkouts.
        // Historical website-owned receipts still reconcile normally.
        const received = Date.parse(r.receivedAt);
        const historical =
          since !== undefined &&
          (!Number.isFinite(received) || received < since);
        const historicallySeenCheckout =
          historical ||
          receiptsSnapshot.paymentNotifications?.some(
            (other) =>
              other.checkoutId === r.checkoutId &&
              other.id !== r.id &&
              (!Number.isFinite(Date.parse(other.receivedAt)) ||
                (since !== undefined && Date.parse(other.receivedAt) < since)),
          );
        if (!historicallySeenCheckout) return true;
        return receiptsSnapshot.payments.some(
          (p) =>
            p.providerReference === r.checkoutId ||
            p.providerCheckoutId === r.checkoutId,
        );
      })
      .slice(0, 10)) {
      try {
        await this.reconcileNotification(receipt.id);
      } catch {
        /* Durable retry; never log provider payload. */
      }
    }
    for (let count = 0; count < 20; count++) {
      const claimed = this.store.write((s) => {
        const j = s.jobs.find(
          (j) =>
            (j.status === "pending" && j.nextAt <= Date.now()) ||
            (j.status === "processing" && (j.leaseUntil ?? 0) < Date.now()),
        );
        if (!j) return null;
        const safe =
          j.kind === "payment"
            ? this.payment.idempotentCreate
            : this.wa.idempotentSend;
        if (j.status === "processing" && !safe) {
          j.status = "unknown";
          j.lastError =
            "Resultado incierto: conciliar con el proveedor antes de reenviar";
          return null;
        }
        j.status = "processing";
        j.attempts++;
        j.leaseUntil = Date.now() + 30000;
        return structuredClone(j);
      });
      if (!claimed) break;
      trace.enterWith(claimed.correlationId ?? claimed.id);
      safeLog("outbox.attempt", {
        kind: claimed.kind,
        attempt: claimed.attempts,
      });
      try {
        const snapshot = this.store.read();
        if (claimed.kind === "payment") {
          const p = snapshot.payments.find((p) => p.id === claimed.entityId)!;
          if (p.checkoutFlow === "web" && p.status !== "creating") {
            this.store.write((s) => {
              s.jobs.find((j) => j.id === claimed.id)!.status = "done";
            });
            continue;
          }
          const result = await this.bounded(
            p.checkoutFlow === "web"
              ? this.createHostedWebPayment(p, snapshot)
              : this.payment.createPaymentLink({
                  paymentId: p.id,
                  orderId: p.orderId,
                  amountFils: p.amountFils,
                  currency: p.currency,
                  idempotencyKey: p.id,
                }),
          );
          requireThat(
            new URL(result.url).protocol === "https:",
            "Proveedor devolvió un enlace inseguro",
            502,
          );
          this.store.write((s) => {
            const job = s.jobs.find((j) => j.id === claimed.id)!;
            if (
              job.status !== "processing" ||
              job.attempts !== claimed.attempts
            )
              return;
            const p = s.payments.find((p) => p.id === claimed.entityId)!;
            // A late worker must never regress an already reconciled payment.
            if (p.checkoutFlow === "web" && p.status !== "creating") {
              job.status = "done";
              return;
            }
            p.url = result.url;
            p.providerReference = result.reference;
            p.provider = result.provider ?? this.payment.name;
            p.providerCheckoutId = result.checkoutId;
            p.status = "pending";
            p.updatedAt = now();
            p.timeline.push({
              ...at(),
              actor: "payment-provider",
              action: "Enlace creado",
            });
            const o = this.order(s, p.orderId);
            this.message(
              s,
              this.conversation(s, o.conversationId),
              `Your order total is AED ${(p.amountFils / 100).toFixed(2)}. Complete your payment here: ${p.url}`,
              { amountAed: (p.amountFils / 100).toFixed(2), url: p.url },
            );
            job.status = "done";
          });
        } else {
          const c = snapshot.conversations.find((c) =>
            c.messages.some((m) => m.id === claimed.entityId),
          )!;
          const m = c.messages.find((m) => m.id === claimed.entityId)!;
          if (m.agentGuard) {
            const allowed = this.store.write((s) => {
              const current = this.conversation(s, c.id),
                session = s.ai?.sessions[c.id],
                run = s.ai?.runs.find((r) => r.id === m.agentGuard!.runId);
              const incoming = latestCustomerInbound(current);
              const origin = this.operationalNumbers.find(
                (n) =>
                  n.id === current.sourceNumberId &&
                  n.phone === current.sourcePhoneNumber,
              );
              const valid =
                this.agentAutomationAllowed &&
                session?.state === "AI_ACTIVE" &&
                session.activeRunId === run?.id &&
                session.epoch === m.agentGuard!.epoch &&
                current.version === m.agentGuard!.version &&
                current.assignedAgent === m.agentGuard!.owner &&
                current.sourceNumberId === m.agentGuard!.sourceNumberId &&
                origin &&
                incoming &&
                Date.now() - Date.parse(incoming.at) < 86400000 &&
                Date.parse(incoming.at) <= Date.now() &&
                run &&
                agentFingerprint(s, current) === run.fingerprint;
              if (!valid) {
                const job = s.jobs.find((j) => j.id === claimed.id)!;
                job.status = "done";
                job.lastError =
                  "AI send aborted: ownership, version, policy or source changed";
                current.messages.find((x) => x.id === m.id)!.status = "failed";
                if (run) {
                  run.status = "aborted";
                  run.handoffReason = "SEND_GUARD_ABORTED";
                }
              }
              return !!valid;
            });
            if (!allowed) continue;
          }
          const result = await this.bounded(
            this.wa.send({
              ...sourceOf(c),
              text: m.text,
              paymentContext: m.paymentContext,
              lastInboundAt: latestCustomerInbound(c)?.at,
              idempotencyKey: m.id,
            }),
          );
          this.store.write((s) => {
            const job = s.jobs.find((j) => j.id === claimed.id)!;
            if (
              job.status !== "processing" ||
              job.attempts !== claimed.attempts
            )
              return;
            const c = s.conversations.find((c) =>
              c.messages.some((m) => m.id === claimed.entityId),
            )!;
            const m = c.messages.find((m) => m.id === claimed.entityId)!;
            m.providerId = result.providerId;
            m.status = result.status;
            m.sentAt = now();
            if (m.agentGuard) {
              const run = s.ai?.runs.find((r) => r.id === m.agentGuard!.runId);
              if (run) run.status = "sent";
            }
            // Delivery acknowledgment changes no operator-owned fields; avoid false editing conflicts.
            job.status = "done";
          });
        }
      } catch (error) {
        safeLog("outbox.failed", {
          kind: claimed.kind,
          attempt: claimed.attempts,
        });
        this.store.write((s) => {
          const j = s.jobs.find((j) => j.id === claimed.id)!;
          if (j.attempts !== claimed.attempts) return;
          const safe =
            j.kind === "payment"
              ? this.payment.idempotentCreate
              : this.wa.idempotentSend;
          const rejected =
            error instanceof ProviderFailure && error.certainty === "rejected";
          j.status = rejected
            ? "failed"
            : !safe
              ? "unknown"
              : j.attempts >= 3
                ? "failed"
                : "pending";
          j.nextAt = Date.now() + 1000 * 2 ** j.attempts;
          j.lastError =
            error instanceof ProviderFailure &&
            error.code === "PAYMENT_TEMPLATE_REQUIRED"
              ? "Fuera de la ventana de 24 horas: configura una plantilla aprobada de pago"
              : error instanceof ProviderFailure &&
                  error.code === "ORIGIN_NOT_CONFIGURED"
                ? "Número de origen no configurado; no se usará otro número"
                : error instanceof ProviderFailure &&
                    error.code === "OUTBOUND_DISABLED"
                  ? "WhatsApp externo deshabilitado; requiere activación explícita"
                  : error instanceof ProviderFailure &&
                      error.code === "NOT_CONFIGURED"
                    ? "BLOCKED — EXTERNAL CREDENTIALS"
                    : rejected
                      ? "Solicitud rechazada: revisa configuración y ventana de WhatsApp antes de reintentar"
                      : safe
                        ? "Proveedor no disponible; reintento pendiente"
                        : "Resultado incierto; conciliación requerida";
          const m = s.conversations
            .flatMap((c) => c.messages)
            .find((m) => m.id === j.entityId);
          if (m?.agentGuard) {
            const run = s.ai?.runs.find((r) => r.id === m.agentGuard!.runId);
            if (run) {
              run.status = "failed";
              run.handoffReason = "WHATSAPP_PROVIDER_FAILURE";
            }
            const owner = s.conversations.find((c) =>
              c.messages.some((x) => x.id === m.id),
            );
            const session = owner && s.ai?.sessions[owner.id];
            if (
              session &&
              !["HUMAN_ACTIVE", "AI_PAUSED"].includes(session.state)
            ) {
              session.state = "HUMAN_REQUIRED";
              session.handoffReason = "WHATSAPP_PROVIDER_FAILURE";
              session.epoch++;
            }
          }
          if (m)
            m.status =
              j.status === "unknown"
                ? "unknown"
                : j.status === "failed"
                  ? "failed"
                  : "queued";
        });
      }
    }
  }
}
