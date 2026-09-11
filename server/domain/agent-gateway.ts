import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { CommerceService } from "./service";
import { type State, type Actor, requireThat, now } from "./model";
import { agentFingerprint } from "./agent-state";
import { quoteOrder } from "./zones";
import { ConversationContextBuilder } from "../agents/context";
import {
  knowledgeSchema,
  toolSchemas,
  type AgentConfig,
  type AgentGateway,
  type ContextSnapshot,
  type AgentSession,
  type AgentRun,
  type AgentModelProvider,
  type ToolCall,
  type ToolResult,
  type Mode,
  type Enquiry,
} from "../agents/model";

const mutations = new Set([
  "create_draft_order",
  "add_order_item",
  "remove_order_item",
  "set_delivery_location",
  "prepare_payment_request",
]);
export class CommerceAgentGateway implements AgentGateway {
  private builder = new ConversationContextBuilder();
  constructor(
    private commerce: CommerceService,
    private config: AgentConfig,
  ) {
    commerce.agentAutomationAllowed = config.enabled && config.configured;
  }
  private data(s: State) {
    return (s.ai ??= { sessions: {}, runs: [], knowledge: [], enquiries: [] });
  }
  private conversation(s: State, id: string) {
    const c = s.conversations.find((c) => c.id === id);
    requireThat(c, "Conversación no encontrada", 404);
    return c;
  }
  private session(s: State, id: string): AgentSession {
    return (this.data(s).sessions[id] ??= {
      state: "AI_ACTIVE",
      mode: this.config.defaultMode,
      epoch: 0,
      failures: 0,
    });
  }
  private fingerprint = agentFingerprint;
  snapshot(id: string): ContextSnapshot {
    const s = this.commerce.store.read(),
      c = this.conversation(s, id),
      session = this.session(s, id);
    const incoming = c.messages.filter((m) => m.direction === "in").at(-1);
    requireThat(incoming, "No hay mensaje del cliente", 409);
    return {
      context: this.builder.build(c, s, session.summary),
      conversationId: id,
      version: c.version,
      owner: c.assignedAgent,
      sourceNumberId: c.sourceNumberId,
      inboundId: incoming.id,
      inboundAt: incoming.at,
      inboundText: incoming.text,
      epoch: session.epoch,
      fingerprint: this.fingerprint(s, c),
      session,
      messageCount: c.messages.length,
    };
  }
  candidates() {
    return this.commerce.store
      .read()
      .conversations.filter(
        (c) =>
          c.status === "open" && c.messages.some((m) => m.direction === "in"),
      )
      .map((c) => c.id);
  }
  claim(
    snapshot: ContextSnapshot,
    manual: boolean,
    config: AgentConfig,
    provider: AgentModelProvider,
  ) {
    return this.commerce.store.write((s) => {
      const c = this.conversation(s, snapshot.conversationId),
        a = this.data(s),
        session = this.session(s, c.id);
      requireThat(c.version === snapshot.version, "Conversación cambió", 409);
      if (
        !manual &&
        ["AI_PAUSED", "RESOLVED", "HUMAN_REQUIRED", "HUMAN_ACTIVE"].includes(
          session.state,
        )
      )
        return null;
      const previous = a.runs.filter(
        (r) => r.conversationId === c.id && r.inboundId === snapshot.inboundId,
      );
      const active = a.runs.find(
        (r) => r.conversationId === c.id && r.status === "running",
      );
      if (active) {
        if (Date.now() - Date.parse(active.at) > config.timeoutMs + 1000) {
          active.status = "failed";
          active.handoffReason = "INTERRUPTED_INFERENCE";
          session.state = "HUMAN_REQUIRED";
          session.handoffReason = "INTERRUPTED_INFERENCE";
        }
        return null;
      }
      if (!manual && previous.length) return null;
      if (
        previous.length >= config.maxTurns ||
        a.runs.filter(
          (r) =>
            r.conversationId === c.id && Date.now() - Date.parse(r.at) < 60000,
        ).length >= config.ratePerMinute
      ) {
        session.state = "HUMAN_REQUIRED";
        session.handoffReason = "RATE_OR_TURN_LIMIT";
        return null;
      }
      const run: AgentRun = {
        id: randomUUID(),
        conversationId: c.id,
        inboundId: snapshot.inboundId,
        provider: provider.name,
        model: provider.model,
        mode:
          manual || session.state === "HUMAN_ACTIVE" ? "copilot" : session.mode,
        status: "running",
        version: c.version,
        owner: c.assignedAgent,
        sourceNumberId: c.sourceNumberId,
        epoch: session.epoch,
        fingerprint: snapshot.fingerprint,
        at: now(),
        correlationId: randomUUID(),
        tools: [],
        actions: [],
        approvedActions: 0,
      };
      a.runs.push(run);
      session.activeRunId = run.id;
      return run;
    });
  }
  private check(snapshot: ContextSnapshot) {
    const current = this.snapshot(snapshot.conversationId);
    requireThat(
      current.version === snapshot.version &&
        current.owner === snapshot.owner &&
        current.epoch === snapshot.epoch &&
        current.fingerprint === snapshot.fingerprint,
      "AI context changed; regenerate",
      409,
    );
    return current;
  }
  async tool(
    snapshot: ContextSnapshot,
    call: ToolCall,
    language: "en" | "es",
  ): Promise<ToolResult> {
    try {
      this.check(snapshot);
      const args = toolSchemas[call.name].parse(JSON.parse(call.arguments)) as {
        query?: string;
        productId?: string;
        quantity?: number;
        address?: string;
        key?: string;
      };
      const s = this.commerce.store.read(),
        c = this.conversation(s, snapshot.conversationId);
      const products = (s.catalog ?? []).filter(
        (p) => p.active !== false && p.availability !== "unavailable",
      );
      const order = s.orders.filter((o) => o.conversationId === c.id).at(-1);
      const name = call.name;
      if (
        ![
          "get_business_faq",
          "request_human_handoff",
          "get_payment_status",
        ].includes(name) &&
        !products.length
      )
        return { name, code: "DATA_NOT_AVAILABLE" };
      if (name === "search_catalog") {
        const query = args.query!.toLocaleLowerCase();
        const found = products
          .filter(
            (p) =>
              p.name.toLocaleLowerCase().includes(query) ||
              p.id === query ||
              p.category?.toLocaleLowerCase().includes(query),
          )
          .slice(0, 5);
        return {
          name,
          code: found.length ? "OK" : "NOT_FOUND",
          products: found,
        };
      }
      if (name === "get_product") {
        const p = products.find((p) => p.id === args.productId);
        return { name, code: p ? "OK" : "NOT_FOUND", products: p ? [p] : [] };
      }
      if (name === "get_business_faq") {
        const entry = s.ai?.knowledge.find(
          (k) =>
            k.key === args.key &&
            k.language === language &&
            k.approved &&
            k.content,
        );
        return {
          name,
          code: entry ? "OK" : "DATA_NOT_AVAILABLE",
          faq: entry?.content ?? undefined,
        };
      }
      if (name === "request_human_handoff") return { name, code: "HANDOFF" };
      if (name === "get_payment_status") {
        const p = s.payments.find((p) => p.id === order?.paymentId);
        return {
          name,
          code: p ? "OK" : "DATA_NOT_AVAILABLE",
          paymentStatus: p?.status,
        };
      }
      if (name === "get_current_order")
        return {
          name,
          code: order ? "OK" : "NOT_FOUND",
          order: order
            ? {
                id: order.id,
                state: order.state,
                version: order.version,
                lines: order.lines,
              }
            : undefined,
        };
      const quote = order
        ? quoteOrder(
            s.zones,
            order.lines,
            order.address,
            order.location,
            this.commerce.geo,
            order.manualZoneId,
            products,
          )
        : null;
      if (
        name === "resolve_delivery_zone" ||
        name === "check_order_eligibility"
      )
        return { name, code: quote?.eligible ? "READY" : "BLOCKED", quote };
      if (name === "prepare_payment_request") {
        const clear =
          order?.state === "Minimum Check" &&
          quote?.eligible &&
          !s.payments.some(
            (p) =>
              p.orderId === order.id &&
              !["failed", "expired", "cancelled"].includes(p.status),
          );
        return {
          name,
          code: clear ? "READY" : "BLOCKED",
          quote,
          action: clear ? call : undefined,
        };
      }
      if (
        name === "add_order_item" &&
        !products.some((p) => p.id === args.productId)
      )
        return { name, code: "NOT_FOUND" };
      if (
        name === "set_delivery_location" &&
        !snapshot.inboundText.includes(args.address!)
      )
        return { name, code: "BLOCKED" };
      if (mutations.has(name))
        return { name, code: "APPROVAL_REQUIRED", action: call };
      return { name, code: "ERROR" };
    } catch {
      return { name: call.name, code: "ERROR" };
    }
  }
  complete(
    run: AgentRun,
    snapshot: ContextSnapshot,
    autoSend: boolean,
    enquiry?: Enquiry,
  ) {
    let result = this.commerce.store.write((s) => {
      const c = this.conversation(s, run.conversationId),
        a = this.data(s),
        session = this.session(s, c.id);
      const stored = a.runs.find((r) => r.id === run.id)!;
      if (
        c.version !== snapshot.version ||
        c.assignedAgent !== snapshot.owner ||
        session.epoch !== snapshot.epoch ||
        this.fingerprint(s, c) !== snapshot.fingerprint
      ) {
        stored.status = "aborted";
        stored.handoffReason = "CONTEXT_CHANGED";
        stored.finishedAt = now();
        return stored;
      }
      Object.assign(stored, run, { status: "suggested", finishedAt: now() });
      session.summary = run.summary;
      if (run.handoffReason) {
        session.handoffReason = run.handoffReason;
        if (session.state !== "HUMAN_ACTIVE" && session.state !== "AI_PAUSED")
          session.state = "HUMAN_REQUIRED";
        session.failures++;
      } else {
        session.failures = 0;
        session.handoffReason = undefined;
        if (!autoSend && !["HUMAN_ACTIVE", "AI_PAUSED"].includes(session.state))
          session.state = "AI_WAITING_APPROVAL";
      }
      if (
        enquiry &&
        !a.enquiries.some(
          (e) => e.conversationId === c.id && e.inboundId === run.inboundId,
        )
      )
        a.enquiries.push(enquiry);
      return stored;
    });
    if (autoSend && result.status === "suggested") {
      this.commerce.enqueueAgentReply(run.id);
      result = this.commerce.store
        .read()
        .ai!.runs.find((r) => r.id === run.id)!;
    }
    return result;
  }
  fail(run: AgentRun, reason: string) {
    this.commerce.store.write((s) => {
      const stored = this.data(s).runs.find((r) => r.id === run.id)!;
      stored.tools = run.tools;
      stored.intent = run.intent;
      stored.confidence = run.confidence;
      stored.status = "failed";
      stored.disposition = "HUMAN_REQUIRED";
      stored.handoffReason = reason;
      stored.finishedAt = now();
      stored.latencyMs = Date.now() - Date.parse(stored.at);
      const session = this.session(s, run.conversationId);
      if (!["HUMAN_ACTIVE", "AI_PAUSED"].includes(session.state))
        session.state = "HUMAN_REQUIRED";
      session.handoffReason = reason;
      session.failures++;
    });
  }
  control(
    id: string,
    actor: Actor,
    version: number,
    action: "takeover" | "return" | "pause" | "resolve",
    mode?: Mode,
  ) {
    this.commerce.store.write((s) => {
      const c = this.conversation(s, id),
        session = this.session(s, id);
      requireThat(c.version === version, "Conversación cambió; actualiza", 409);
      requireThat(
        !c.assignedAgent ||
          c.assignedAgent === actor.id ||
          ["admin", "manager"].includes(actor.role),
        "Conversación de otro agente",
        403,
      );
      if (mode) {
        requireThat(
          mode !== "autonomous_bounded" || this.config.autonomousAllowed,
          "Autonomía deshabilitada",
          403,
        );
        session.mode = mode;
      }
      if (action === "return")
        requireThat(
          this.config.enabled && this.config.configured,
          "AI NOT CONFIGURED",
          409,
        );
      session.state = (
        {
          takeover: "HUMAN_ACTIVE",
          return: "AI_ACTIVE",
          pause: "AI_PAUSED",
          resolve: "RESOLVED",
        } as const
      )[action];
      session.epoch++;
      session.handoffReason = undefined;
      if (action === "takeover") c.assignedAgent = actor.id;
      c.version++;
      c.audit.push({ at: now(), actor: actor.id, action: `AI ${action}` });
    });
  }
  approve(
    id: string,
    runId: string,
    actor: Actor,
    version: number,
    action: "send" | "reject" | "action",
    text?: string,
  ) {
    const snapshot = this.snapshot(id),
      s = this.commerce.store.read(),
      c = this.conversation(s, id),
      run = s.ai?.runs.find((r) => r.id === runId && r.conversationId === id);
    requireThat(
      c.assignedAgent === actor.id,
      "Toma la conversación antes de aprobar",
      403,
    );
    requireThat(run, "Sugerencia no encontrada", 404);
    if (
      run.status === "rejected" ||
      (action === "send" && run.responseApproved) ||
      (action === "action" && run.approvedActions >= run.actions.length)
    )
      return;
    requireThat(
      run.status === "suggested" &&
        snapshot.session.activeRunId === run.id &&
        c.version === version &&
        run.version === c.version &&
        run.epoch === snapshot.epoch &&
        run.fingerprint === snapshot.fingerprint,
      "Sugerencia desactualizada; regenera",
      409,
    );
    if (action === "reject") {
      this.commerce.store.write((s) => {
        s.ai!.runs.find((r) => r.id === runId)!.status = "rejected";
      });
      return;
    }
    const key = `ai-${run.id}-${action}-${run.approvedActions}`;
    if (action === "send") {
      const age = Date.now() - Date.parse(snapshot.inboundAt);
      if (!(age >= 0 && age < 86400000)) {
        this.commerce.store.write((state) => {
          const session = this.session(state, id);
          session.handoffReason = "SERVICE_WINDOW_BLOCKED";
          if (!["HUMAN_ACTIVE", "AI_PAUSED"].includes(session.state))
            session.state = "HUMAN_REQUIRED";
        });
        requireThat(
          false,
          "Ventana de WhatsApp cerrada; se requiere una plantilla aprobada",
          409,
        );
      }
      const reply = z
        .string()
        .trim()
        .min(1)
        .max(4000)
        .parse(text ?? run.suggestion);
      this.commerce.command(
        { type: "send", id, version, text: reply },
        key,
        actor,
      );
    } else {
      const call = run.actions[run.approvedActions];
      requireThat(call, "No hay acción pendiente", 409);
      const args = toolSchemas[call.name].parse(JSON.parse(call.arguments)) as {
        productId?: string;
        quantity?: number;
        address?: string;
      };
      const order = s.orders.filter((o) => o.conversationId === id).at(-1);
      let command: unknown;
      if (call.name === "create_draft_order")
        command = { type: "createOrder", id, version };
      else {
        requireThat(order, "Crea el borrador primero", 409);
        const base = { id: order.id, version: order.version };
        if (call.name === "add_order_item") {
          const lines = order.lines.filter(
            (l) => l.productId !== args.productId,
          );
          lines.push({ productId: args.productId!, quantity: args.quantity! });
          command = { type: "editOrder", ...base, lines };
        } else if (call.name === "remove_order_item")
          command = {
            type: "editOrder",
            ...base,
            lines: order.lines.filter((l) => l.productId !== args.productId),
          };
        else if (call.name === "set_delivery_location")
          command = { type: "location", ...base, address: args.address };
        else {
          requireThat(
            call.name === "prepare_payment_request",
            "Acción no permitida",
            403,
          );
          command = { type: "requestPayment", ...base };
        }
      }
      this.commerce.command(command, key, actor);
    }
    this.commerce.store.write((s) => {
      const stored = s.ai!.runs.find((r) => r.id === runId)!,
        current = this.conversation(s, id);
      if (action === "action") stored.approvedActions++;
      if (action === "send") stored.responseApproved = true;
      stored.status =
        stored.responseApproved &&
        stored.approvedActions >= stored.actions.length
          ? "approved"
          : "suggested";
      stored.epoch = this.session(s, id).epoch;
      stored.version = current.version;
      stored.fingerprint = this.fingerprint(s, current);
      current.audit.push({
        at: now(),
        actor: actor.id,
        action: `AI approval: ${action}`,
      });
    });
  }
  summary() {
    const a = this.commerce.store.read().ai;
    return {
      sessions: a?.sessions ?? {},
      runs: (a?.runs ?? []).slice(-100),
      configuredKnowledge:
        a?.knowledge.filter((k) => k.approved && k.content).length ?? 0,
      lastSuccess: a?.runs.filter((r) => r.suggestion).at(-1)?.finishedAt,
      errors:
        a?.runs.filter(
          (r) =>
            r.status === "failed" && Date.now() - Date.parse(r.at) < 86400000,
        ).length ?? 0,
    };
  }
  updateKnowledge(value: unknown, actor: Actor) {
    requireThat(
      actor.role === "admin",
      "Solo administradores aprueban conocimiento",
      403,
    );
    const input = knowledgeSchema.parse(value);
    this.commerce.store.write((s) => {
      const a = this.data(s),
        previous = a.knowledge.find(
          (k) => k.key === input.key && k.language === input.language,
        );
      requireThat(
        (previous?.version ?? 0) === input.version,
        "Conocimiento actualizado por otro operador",
        409,
      );
      const updated = {
        ...input,
        version: input.version + 1,
        approvedBy: input.approved ? actor.id : undefined,
        updatedAt: now(),
      };
      a.knowledge = a.knowledge.filter((k) => k !== previous);
      a.knowledge.push(updated);
      s.audit.push({
        at: now(),
        actor: actor.id,
        action: `Knowledge ${input.key}/${input.language} approved=${input.approved}`,
      });
    });
  }
}
