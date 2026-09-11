import {
  notificationIdentity,
  type PaymenntNotification,
} from "../adapters/paymennt-notification";
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
  constructor(
    public store: Store,
    public wa: WhatsAppProvider,
    public payment: PaymentProvider,
    public geo: GeoService = { resolve: () => null },
    private timeoutMs = 10000,
    public operationalNumbers = numbers,
    public agentIds = ["liza", "andrea"],
  ) {}
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
    if (cmd.type === "updateZone") {
      requireThat(
        actor.role === "admin",
        "Solo administradores pueden editar zonas",
        403,
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
        requireThat(
          new Set(cmd.lines.map((l) => l.productId)).size === cmd.lines.length,
          "Productos duplicados",
          400,
        );
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
        o.lines = cmd.lines;
        o.catalogSnapshot = undefined;
      } else {
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
        o.address || o.location ? "Minimum Check" : "Awaiting Location",
        actor.id,
      );
      return o;
    }
    if (cmd.type === "requestPayment") {
      requireThat(
        o.state === "Minimum Check",
        "Completa productos y ubicación primero",
      );
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
        p?.url && p.status === "pending" && o.state === "Awaiting Payment",
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
      transition(o, cmd.state, actor.id);
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
        if (event.type === "message" && event.location) {
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
      if (e.type === "status") {
        const m = s.conversations
          .flatMap((c) => c.messages)
          .find((m) => m.providerId === e.providerId);
        requireThat(m, "Mensaje todavía no disponible; reintentar", 503);
        const ranks = { sent: 1, delivered: 2, read: 3, failed: 0 };
        const current =
          m.status in ranks ? ranks[m.status as keyof typeof ranks] : 0;
        if (e.status === "failed") {
          if (current < 2) m.status = "failed";
        } else if (ranks[e.status] > current) m.status = e.status;
      } else {
        const n = this.operationalNumbers.find(
          (n) => n.id === e.sourceNumberId,
        );
        requireThat(n, "Número de origen desconocido", 400);
        let c = s.conversations.find(
          (c) => c.sourceNumberId === n.id && c.phone === e.phone,
        );
        if (!c) {
          c = {
            id: randomUUID(),
            customer: e.customer,
            phone: e.phone,
            sourceNumberId: n.id,
            sourcePhoneNumber: n.phone,
            assignedAgent: null,
            status: "open",
            unread: true,
            version: 0,
            messages: [],
            audit: [],
          };
          s.conversations.push(c);
        }
        c.messages.push({
          id: e.eventId,
          direction: "in",
          text: e.text,
          location: e.location,
          status: "received",
          at: e.at ?? now(),
        });
        c.unread = true;
        c.status = "open";
        c.version++;
        if (e.location) {
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
  private async reconcileNotification(id: string) {
    const receipt = this.store
      .read()
      .paymentNotifications?.find((r) => r.id === id);
    if (!receipt || receipt.completedAt) return;
    const payment = this.store
      .read()
      .payments.find((p) => p.providerReference === receipt.checkoutId);
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
      const checkout = p.providerReference
        ? await this.payment.getCheckout(p.providerReference)
        : await this.payment.findCheckout?.(p.id);
      requireThat(
        checkout,
        "Checkout aún no encontrado; no se creará otro cobro automáticamente",
        409,
      );
      if (!p.providerReference)
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
  private applyCheckout(
    paymentId: string,
    checkout: AuthoritativeCheckout,
    actor: string,
    receiptId?: string,
  ) {
    return this.store.write((s) => {
      const p = s.payments.find((p) => p.id === paymentId)!;
      requireThat(
        checkout.checkoutId === p.providerReference &&
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
  async drain() {
    await this.drainInbound();
    for (const receipt of (this.store.read().paymentNotifications ?? [])
      .filter((r) => !r.completedAt && r.nextAt <= Date.now())
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
          const result = await this.bounded(
            this.payment.createPaymentLink({
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
          const result = await this.bounded(
            this.wa.send({
              ...sourceOf(c),
              text: m.text,
              paymentContext: m.paymentContext,
              lastInboundAt: c.messages
                .filter((m) => m.direction === "in")
                .map((m) => m.at)
                .sort()
                .at(-1),
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
