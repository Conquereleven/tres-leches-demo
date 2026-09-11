import type { Store } from "./db/store";
import type { BackupManager } from "./db/backups";
import type { PaymenntProvider } from "./adapters/paymennt";
import type { MapboxGeoProvider } from "./adapters/mapbox";
import type { runtimeConfig, integrationConfig } from "./config";
export type ReadinessStatus = "READY" | "NOT CONFIGURED" | "BLOCKED" | "FAILED";
type Check = { status: ReadinessStatus; detail: string; checkedAt?: string };
export class Readiness {
  private connectivity: Partial<Record<"paymennt" | "geo", Check>> = {};
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
  ) {}
  snapshot() {
    let healthy = false;
    try {
      healthy = this.store.healthy();
    } catch {
      /* Never reveal database errors. */
    }
    const configured = !!this.integration;
    const check = (ready: boolean, detail: string): Check => ({
      status: ready ? "READY" : "NOT CONFIGURED",
      detail,
    });
    const components: Record<string, Check> = {
      database: {
        status: healthy ? "READY" : "FAILED",
        detail:
          "Local SQLite check; volume durability requires hosting verification",
      },
      authentication: check(
        this.authenticated,
        "Configured session authentication; no user or hash disclosure",
      ),
      WA1: {
        status: configured ? "BLOCKED" : "NOT CONFIGURED",
        detail: configured
          ? "WA1 alias/phone ID/token configured; outbound disabled; account onboarding unverified"
          : "BLOCKED — EXTERNAL CREDENTIALS",
      },
      WA2: {
        status: configured ? "BLOCKED" : "NOT CONFIGURED",
        detail: configured
          ? "WA2 alias/phone ID/token configured; outbound disabled; account onboarding unverified"
          : "BLOCKED — EXTERNAL CREDENTIALS",
      },
      WA3: {
        status: configured ? "BLOCKED" : "NOT CONFIGURED",
        detail: configured
          ? "WA3 alias/phone ID/token configured; outbound disabled; account onboarding unverified"
          : "BLOCKED — EXTERNAL CREDENTIALS",
      },
      Paymennt: this.fresh("paymennt") ?? {
        status: configured ? "BLOCKED" : "NOT CONFIGURED",
        detail: configured
          ? "TEST credentials configured; connectivity not checked"
          : "BLOCKED — EXTERNAL CREDENTIALS",
      },
      PaymenntNotification: {
        status: "BLOCKED",
        detail: "Official notification contract required; endpoint remains 503",
      },
      GeoProvider: this.fresh("geo") ?? {
        status: configured ? "BLOCKED" : "NOT CONFIGURED",
        detail: configured
          ? "Mapbox configured; connectivity not checked"
          : "BLOCKED — EXTERNAL CREDENTIALS",
      },
      backup: {
        status: this.backup?.status() ?? "NOT CONFIGURED",
        detail: this.backup?.lastSuccessfulAt
          ? "Online backup verified locally; off-volume recovery unverified"
          : "No successful backup observed in this process",
        ...(this.backup?.lastSuccessfulAt
          ? { checkedAt: this.backup.lastSuccessfulAt }
          : {}),
      },
      HTTPS: check(
        !!this.runtime.staging,
        "HTTPS origin configuration only; proxy certificate not remotely verified",
      ),
      UAT: {
        status: "BLOCKED",
        detail:
          "Ten TEST scenarios await client acceptance; no real UAT asserted",
      },
    };
    return {
      storage: healthy,
      environment: this.runtime.environment,
      overall: "NOT READY" as const,
      pilotReady: false,
      components,
    };
  }
  private fresh(provider: "paymennt" | "geo") {
    const value = this.connectivity[provider];
    return value?.checkedAt &&
      Date.now() - Date.parse(value.checkedAt) <= 300000
      ? value
      : undefined;
  }
  async probe(provider: "paymennt" | "geo") {
    if (this.runtime.environment !== "staging")
      throw new Error("Connectivity diagnostics are staging-only");
    if (this.running || Date.now() - this.lastProbe < 10000)
      throw new Error("Diagnostic already running or cooling down");
    this.running = true;
    this.lastProbe = Date.now();
    try {
      if (!this.integration)
        return {
          status: "NOT CONFIGURED",
          detail: "BLOCKED — EXTERNAL CREDENTIALS",
        } satisfies Check;
      try {
        if (provider === "paymennt") {
          if (!this.paymennt) throw new Error();
          await this.paymennt.checkConnectivity();
        } else {
          if (!this.geo) throw new Error();
          const location = this.store
            .read()
            .conversations.find((c) => c.location)?.location;
          if (!location)
            return {
              status: "BLOCKED" as const,
              detail:
                "A received customer location is required for a geographic check",
            };
          await this.geo.lookup(location, AbortSignal.timeout(8000));
        }
        // Geo success means HTTP/schema success, never proof of commercial coverage or Dubai accuracy.
        this.connectivity[provider] = {
          status: "READY",
          detail:
            "Read-only TEST connectivity verified; no payment/message created",
          checkedAt: new Date().toISOString(),
        };
      } catch {
        this.connectivity[provider] = {
          status: "FAILED",
          detail:
            "Provider check failed; verify credentials, connectivity and entitlement",
          checkedAt: new Date().toISOString(),
        };
      }
      return this.connectivity[provider]!;
    } finally {
      this.running = false;
    }
  }
}
