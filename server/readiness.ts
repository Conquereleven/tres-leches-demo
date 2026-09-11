import { locationSchema, type Location } from "./domain/model";
import type { Store } from "./db/store";
import type { BackupManager } from "./db/backups";
import type { PaymenntProvider } from "./adapters/paymennt";
import type { MapboxGeoProvider } from "./adapters/mapbox";
import { MetaWhatsAppProvider } from "./adapters/meta";
import type {
  runtimeConfig,
  integrationConfig,
  activationConfig,
} from "./config";
export type ReadinessStatus = "READY" | "NOT CONFIGURED" | "BLOCKED" | "FAILED";
type Check = { status: ReadinessStatus; detail: string; checkedAt?: string };
export class Readiness {
  private connectivity: Partial<Record<"paymennt" | "geo" | "meta", Check>> =
    {};
  private running = false;
  private lastProbe = 0;
  constructor(
    private runtime: ReturnType<typeof runtimeConfig>,
    private integration: ReturnType<typeof integrationConfig>,
    private store: Store,
    private authenticated: boolean,
    private backup?: BackupManager,
    private paymennt?: PaymenntProvider,
    private geo?: MapboxGeoProvider,
    private activation?: {
      activation: ReturnType<typeof activationConfig>;
      webhookConfigured: boolean;
      outboundEnabled: boolean;
      ai?: () => {
        config: import("./agents/model").AgentConfig;
        summary: ReturnType<import("./agents/model").AgentGateway["summary"]>;
      };
    },
  ) {}
  snapshot() {
    let healthy = false;
    try {
      healthy = this.store.healthy();
    } catch {
      /* No database diagnostics disclosure. */
    }
    const state = healthy ? this.store.read() : undefined;
    const configured = !!this.integration;
    const meta = this.activation?.activation.meta;
    const yes = (v: unknown) => (v ? "yes" : "no");
    const check = (ready: boolean, detail: string): Check => ({
      status: ready ? "READY" : "NOT CONFIGURED",
      detail,
    });
    const latest = (values: (string | undefined)[]) =>
      values
        .filter((v): v is string => !!v)
        .sort()
        .at(-1);
    const components: Record<string, Check> = {
      database: {
        status: healthy ? "READY" : "FAILED",
        detail:
          "SQLite transactional storage; persistent volume confirmation: " +
          yes(this.runtime.staging?.PERSISTENT_VOLUME_CONFIRMED),
      },
      authentication: check(
        this.authenticated,
        "Configured operator roles; user credentials are never disclosed",
      ),
      Paymennt:
        this.fresh("paymennt") ??
        check(
          !!this.paymennt,
          "TEST credentials: " +
            yes(this.paymennt) +
            "; API connectivity: not yet verified",
        ),
      PaymenntNotification: {
        status: "READY",
        detail:
          "Verifier implemented: exact raw bytes, Base64 HMAC-SHA256; authoritative GET required",
      },
      PaymenntWebhook: check(
        !!this.activation?.webhookConfigured,
        this.activation?.webhookConfigured
          ? "WEBHOOK CONFIGURED"
          : "WEBHOOK NOT CONFIGURED",
      ),
      PaymenntLastNotification: check(
        !!state?.paymentNotifications?.length,
        "Last verified notification: " +
          (latest(
            (state?.paymentNotifications ?? []).map((r) => r.receivedAt),
          ) ?? "none"),
      ),
      PaymenntPending: {
        status: state?.paymentNotifications?.some((r) => !r.completedAt)
          ? "BLOCKED"
          : "READY",
        detail:
          "Notifications awaiting authoritative reconciliation: " +
          (state?.paymentNotifications?.filter((r) => !r.completedAt).length ??
            0) +
          "; durable retries active; inspect payment with Check Status if provider recovery is needed",
      },
      PaymenntReconciliation: check(
        !!state?.payments.some((p) => p.lastReconciledAt),
        "Last authoritative reconciliation: " +
          (latest((state?.payments ?? []).map((p) => p.lastReconciledAt)) ??
            "none"),
      ),
      MetaAccount:
        this.fresh("meta") ??
        check(false, "Account validation awaits explicit administrator action"),
      GeoProvider:
        this.fresh("geo") ??
        check(
          !!this.geo,
          "Mapbox configured: " +
            yes(this.geo) +
            "; connectivity not yet verified",
        ),
      GeoMapping: check(
        !!state?.zones.some((z) => z.canonicalIds?.length || z.polygon?.length),
        "Verified mapping rules: " +
          (state?.zones.filter(
            (z) => z.canonicalIds?.length || z.polygon?.length,
          ).length ?? 0) +
          "; real Dubai GPS acceptance required",
      ),
      Commercial: {
        status: "READY",
        detail:
          "JLT B/C/D: 30 AED minimum, existing free delivery preserved. Remraam canonical name resolved. Remaining unknown pricing rules: " +
          (state?.zones.filter(
            (z) => z.minOrderAed == null || z.deliveryFeeAed == null,
          ).length ?? 0) +
          ". Those zones remain blocked until reviewed.",
      },
      Catalog: check(
        !!state?.catalog?.length,
        "Approved items: " +
          (state?.catalog?.length ?? 0) +
          (state?.catalog?.length
            ? "; validated import available"
            : "; EXTERNAL INPUT REQUIRED — Lisa approved catalog"),
      ),
      backup: {
        status: this.backup?.status() ?? "NOT CONFIGURED",
        detail: this.backup?.lastSuccessfulAt
          ? "Online backup locally verified; verify off-volume recovery during activation"
          : "No successful backup observed",
        ...(this.backup?.lastSuccessfulAt
          ? { checkedAt: this.backup.lastSuccessfulAt }
          : {}),
      },
      HTTPS: check(
        !!this.runtime.staging,
        "HTTPS origin configured; verify deployment certificate during activation",
      ),
      APP_ENV: {
        status: "READY",
        detail: this.runtime.environment + "; live payments disabled",
      },
      UAT: {
        status: "BLOCKED",
        detail:
          "EXTERNAL INPUT REQUIRED — real provider tests and Lisa acceptance; PILOT READY cannot be inferred from automated fixtures",
      },
    };
    for (const id of ["wa1", "wa2", "wa3"]) {
      const number = (meta?.numbers ?? this.integration?.numbers)?.find(
        (n) => n.id === id,
      );
      const conversations =
        state?.conversations.filter((c) => c.sourceNumberId === id) ?? [];
      const messages = conversations.flatMap((c) => c.messages);
      const lastInbound = latest(
        messages.filter((m) => m.direction === "in").map((m) => m.at),
      );
      const lastOutbound = latest(
        messages
          .filter(
            (m) =>
              m.direction === "out" &&
              ["sent", "delivered", "read"].includes(m.status),
          )
          .map((m) => m.sentAt),
      );
      const failed = messages.some((m) =>
        ["failed", "unknown"].includes(m.status),
      );
      components[id.toUpperCase()] = check(
        !!number,
        [
          `phone number ID: ${yes(number?.phoneNumberId)}`,
          `WABA: ${yes(number?.wabaId)}`,
          `business number: ${yes(number?.phone)}`,
          `access token: ${yes(meta?.token || configured)}`,
          `app secret: ${yes(meta?.appSecret || configured)}`,
          `verify token: ${yes(meta?.verifyToken || configured)}`,
          `webhook endpoint ready: ${yes(meta || configured)}`,
          `payment template: ${yes(meta?.paymentTemplate || this.integration?.paymentTemplate)}`,
          `outbound enabled: ${yes(this.activation?.outboundEnabled)}`,
          `last inbound: ${lastInbound ?? "none"}`,
          `last outbound success: ${lastOutbound ?? "none"}`,
          `last sanitized provider error: ${failed ? "Send requires operator review" : "none observed"}`,
        ].join("; "),
      );
    }
    const ai = this.activation?.ai?.();
    if (ai)
      components.AI = {
        status: ai.config.configured ? "READY" : "NOT CONFIGURED",
        detail: `Provider configured: ${yes(ai.config.configured)}; model configured: ${yes(ai.config.model)}; enabled: ${yes(ai.config.enabled)}; default: ${ai.config.defaultMode}; autonomous allowed: ${yes(ai.config.autonomousAllowed)}; approved knowledge: ${ai.summary.configuredKnowledge}; catalog ready: ${yes(state?.catalog?.length)}; Meta ready: ${yes(meta)}; Paymennt ready: ${yes(this.paymennt)}; last successful inference: ${ai.summary.lastSuccess ?? "none"}; recent errors: ${ai.summary.errors}`,
      };
    const integrationReady =
      healthy &&
      this.authenticated &&
      this.backup?.status() === "READY" &&
      !!this.activation?.outboundEnabled &&
      !!state?.paymentNotifications?.some((r) => r.completedAt) &&
      !!this.activation?.webhookConfigured &&
      !!state?.catalog?.length &&
      ["paymennt", "meta", "geo"].every(
        (p) => this.fresh(p as "paymennt" | "meta" | "geo")?.status === "READY",
      );
    return {
      storage: healthy,
      environment: this.runtime.environment,
      overall: integrationReady
        ? ("INTEGRATION READY" as const)
        : ("INTERNAL READY / EXTERNAL INPUT REQUIRED" as const),
      pilotReady: false,
      components,
    };
  }
  private fresh(provider: "paymennt" | "geo" | "meta") {
    const value = this.connectivity[provider];
    return value?.checkedAt &&
      Date.now() - Date.parse(value.checkedAt) <= 300000
      ? value
      : undefined;
  }
  async probe(provider: "paymennt" | "geo" | "meta", point?: Location) {
    if (this.runtime.environment !== "staging")
      throw new Error("Staging-only diagnostics");
    if (this.running || Date.now() - this.lastProbe < 10000)
      throw new Error("Diagnostic cooling down");
    this.running = true;
    this.lastProbe = Date.now();
    try {
      if (
        !(provider === "paymennt"
          ? this.paymennt
          : provider === "geo"
            ? this.geo
            : this.activation?.activation.meta)
      )
        return {
          status: "NOT CONFIGURED",
          detail: "EXTERNAL INPUT REQUIRED",
        } satisfies Check;
      try {
        if (provider === "paymennt") await this.paymennt!.checkConnectivity();
        else if (provider === "meta")
          await new MetaWhatsAppProvider(
            this.activation!.activation.meta!,
          ).validateConfiguration();
        else {
          const location =
            point ??
            this.store.read().conversations.find((c) => c.location)?.location;
          if (!location)
            return {
              status: "BLOCKED" as const,
              detail:
                "Enter a real Dubai coordinate or receive a customer location before the geo check",
            };
          await this.geo!.lookup(
            locationSchema.parse(location),
            AbortSignal.timeout(8000),
          );
        }
        this.connectivity[provider] = {
          status: "READY",
          detail: "Read-only connectivity verified; no payment/message created",
          checkedAt: new Date().toISOString(),
        };
      } catch {
        this.connectivity[provider] = {
          status: "FAILED",
          detail:
            "Provider configuration/connectivity check failed; no provider payload disclosed",
          checkedAt: new Date().toISOString(),
        };
      }
      return this.connectivity[provider]!;
    } finally {
      this.running = false;
    }
  }
}
