import { agentConfig } from "./agents/config";
import { AgentOrchestrator } from "./agents/orchestrator";
import { OpenAIAgentProvider } from "./agents/provider";
import { CommerceAgentGateway } from "./domain/agent-gateway";
import { modes } from "./agents/model";
import {
  PaymenntNotificationVerifier,
  notificationSchema,
  paymentTopics,
} from "./adapters/paymennt-notification";
import { loadWebhookSecret } from "./adapters/paymennt-secrets";
import { assertCleanRuntime } from "./db/runtime-safety";
import { trace, safeLog } from "./observability";
import {
  integrationConfig,
  runtimeConfig,
  usersSchema,
  activationConfig,
} from "./config";
import { BackupManager } from "./db/backups";
import { Readiness } from "./readiness";
import {
  DisabledWhatsAppProvider,
  UnconfiguredPaymentProvider,
} from "./adapters/blocked";
import { PaymenntProvider } from "./adapters/paymennt";
import { MetaWhatsAppProvider } from "./adapters/meta";
import { MapboxGeoProvider } from "./adapters/mapbox";
import { GeocodingAdapter } from "./adapters/geo";
import http from "node:http";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";
import { z, ZodError } from "zod";
import { Store, seed } from "./db/store";
import { quoteOrder } from "./domain/zones";
import { commandSchema, inboundSchema } from "./domain/commands";
import { CommerceService } from "./domain/service";
import {
  DomainError,
  type Actor,
  numbers,
  locationSchema,
} from "./domain/model";
import { HmacVerifier } from "./adapters/providers";
/** Public customer policy/contact routes; keep in sync with src/brand/business.ts. */
export const customerPages = [
  "/terms",
  "/privacy",
  "/refund-policy",
  "/delivery-policy",
  "/contact",
] as const;
const customerCsp =
  "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; script-src 'self'; frame-ancestors 'none'";
export async function startServer(
  overrides: {
    initial?: ReturnType<typeof seed>;
    agentProvider?: import("./agents/model").AgentModelProvider;
    whatsapp?: import("./adapters/providers").WhatsAppProvider;
    payment?: import("./adapters/providers").PaymentProvider;
    geo?: import("./domain/zones").GeoService;
    operationalNumbers?: typeof numbers;
  } = {},
) {
  const isolatedTest = process.env.APP_ENV === "test";
  if (!isolatedTest && Object.keys(overrides).length)
    throw new Error("Runtime overrides require isolated test environment");
  const runtime = runtimeConfig(process.env);
  const staging = runtime.staging;
  if (staging) process.umask(0o077);
  const integration = staging ? null : integrationConfig(process.env);
  const activation = activationConfig(process.env);
  const production = process.env.NODE_ENV === "production";
  const secret =
    process.env.WEBHOOK_SECRET ||
    (production ? "" : randomBytes(32).toString("hex"));
  const verifier = new HmacVerifier(secret);
  const dbPath =
    process.env.DB_PATH || `data/${runtime.environment}/commerce.sqlite`;
  if (
    staging &&
    (resolve(dbPath).includes("/dist/") || resolve(dbPath).endsWith("/dist"))
  )
    throw new Error("Staging database must be outside static dist");
  const stagingAliases =
    activation.meta?.numbers ??
    numbers.map((n) => ({ ...n, phone: "NOT CONFIGURED" }));
  const store = new Store(
    dbPath,
    isolatedTest
      ? "test"
      : runtime.environment === "production"
        ? "release-production"
        : staging
          ? "release-staging"
          : "release",
    overrides.initial ?? seed(),
  );
  if (!isolatedTest) assertCleanRuntime(store.read());
  const backups = staging
    ? new BackupManager(
        store,
        dbPath,
        staging.BACKUP_DIR,
        staging.BACKUP_RETENTION_COUNT,
        staging.BACKUP_INTERVAL_MINUTES,
      )
    : undefined;
  if (backups) await backups.run();
  const meta =
    overrides.whatsapp instanceof MetaWhatsAppProvider
      ? overrides.whatsapp
      : activation.meta
        ? new MetaWhatsAppProvider(activation.meta)
        : null;
  const webhookSecret = loadWebhookSecret(
    process.env.PAYMENNT_WEBHOOK_SECRET_FILE,
  );
  const paymentVerifier = new PaymenntNotificationVerifier(
    webhookSecret?.hmacKey,
  );
  const paymennt = activation.paymennt
    ? new PaymenntProvider(activation.paymennt, fetch, paymentVerifier)
    : undefined;
  const geoProvider = activation.geoToken
    ? new MapboxGeoProvider(activation.geoToken)
    : undefined;
  const service = new CommerceService(
    store,
    overrides.whatsapp ??
      (meta && process.env.META_OUTBOUND_ENABLED === "true"
        ? meta
        : new DisabledWhatsAppProvider()),
    overrides.payment ?? paymennt ?? new UnconfiguredPaymentProvider(),
    overrides.geo ??
      (geoProvider
        ? new GeocodingAdapter(geoProvider)
        : { resolve: () => null }),
    10000,
    overrides.operationalNumbers ?? stagingAliases,
  );
  const users = usersSchema.parse(
    JSON.parse(process.env.OPERATOR_USERS_JSON ?? "[]"),
  );
  service.agentIds = users.map((u) => u.id);
  if ((production || integration || staging) && !users.length)
    throw new Error("Operations require OPERATOR_USERS_JSON");
  const aiConfig = agentConfig(process.env);
  if (overrides.agentProvider) {
    aiConfig.configured = true;
    aiConfig.enabled = true;
    aiConfig.model = overrides.agentProvider.model;
    aiConfig.provider = overrides.agentProvider.name;
  }
  const aiGateway = new CommerceAgentGateway(service, aiConfig);
  const ai = new AgentOrchestrator(
    aiGateway,
    aiConfig,
    overrides.agentProvider ??
      (aiConfig.configured
        ? new OpenAIAgentProvider(process.env.AI_API_KEY!, aiConfig.model)
        : undefined),
  );
  const readiness = new Readiness(
    runtime,
    integration,
    store,
    !!users.length && !!(production || integration || staging),
    backups,
    paymennt,
    geoProvider,
    {
      activation,
      webhookConfigured: !!webhookSecret,
      outboundEnabled: process.env.META_OUTBOUND_ENABLED === "true",
      ai: () => ({ config: aiConfig, summary: aiGateway.summary() }),
    },
  );
  const sessions = new Map<string, { actor: Actor; expires: number }>();
  const limiter = new Map<string, { count: number; until: number }>();
  const origin = process.env.APP_ORIGIN ?? "http://127.0.0.1:5173";
  function actor(req: http.IncomingMessage): Actor {
    if (!production && !integration && !staging)
      return { id: "liza", role: "admin" };
    const cookie = req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("tl_session="))
      ?.slice(11);
    const session = cookie ? sessions.get(cookie) : null;
    if (!session || session.expires < Date.now())
      throw new DomainError(401, "Inicia sesión para continuar");
    return session.actor;
  }
  async function rawBody(req: http.IncomingMessage) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > 65536)
        throw new DomainError(413, "Solicitud demasiado grande");
      chunks.push(bytes);
    }
    return Buffer.concat(chunks);
  }
  function parse(raw: string | Buffer): unknown {
    try {
      return JSON.parse(raw.toString());
    } catch {
      throw new DomainError(400, "JSON inválido");
    }
  }
  function json(res: http.ServerResponse, status: number, value: unknown) {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(value));
  }
  const server = http.createServer(async (req, res) => {
    const correlationId = randomBytes(12).toString("hex");
    trace.enterWith(correlationId);
    res.setHeader("X-Request-Id", correlationId);
    res.on("finish", () =>
      trace.run(correlationId, () =>
        safeLog("http.complete", { status: res.statusCode }),
      ),
    );
    try {
      const url = new URL(req.url ?? "/", origin),
        path = url.pathname;
      if (path.startsWith("/api/")) {
        const rateKey =
            (req.socket.remoteAddress ?? "local") +
            (path === "/api/login" ? ":login" : ""),
          rate = limiter.get(rateKey);
        if (!rate || rate.until < Date.now())
          limiter.set(rateKey, { count: 1, until: Date.now() + 60000 });
        else if (++rate.count > (path === "/api/login" ? 10 : 300))
          throw new DomainError(
            429,
            "Demasiadas solicitudes; espera un minuto",
          );
        if (req.method === "GET" && path === "/api/health")
          return json(res, 200, {
            ok: true,
            environment: runtime.environment,
            mode:
              runtime.environment === "production" ? "offline" : "integration",
            revision: process.env.BUILD_SOURCE_SHA ?? "unknown",
          });
        if (req.method === "GET" && path === "/api/ready") {
          const result = readiness.snapshot();
          return json(res, result.storage ? 200 : 503, {
            storage: result.storage,
            environment: runtime.environment,
          });
        }
        if (req.method === "GET" && path === "/api/webhooks/whatsapp" && meta) {
          const challenge = meta.challenge(url.searchParams);
          if (!challenge) throw new DomainError(403, "Verificación rechazada");
          res.writeHead(200, { "Content-Type": "text/plain" });
          return res.end(challenge);
        }
        if (req.method === "POST" && path.startsWith("/api/webhooks/")) {
          const raw = await rawBody(req);
          if (
            path === "/api/webhooks/payment" &&
            (!isolatedTest || service.payment.name === "paymennt")
          ) {
            if (!paymentVerifier.configured)
              throw new DomainError(503, "WEBHOOK NOT CONFIGURED");
            if (
              !paymentVerifier.verify(
                raw,
                String(req.headers["x-pointcheckout-hmac-sha256"] ?? ""),
              )
            )
              throw new DomainError(401, "Firma inválida");
            z.enum(paymentTopics).parse(req.headers["x-pointcheckout-topic"]);
            const event = notificationSchema.parse(parse(raw));
            return json(
              res,
              200,
              await service.acceptPaymentNotification(event),
            );
          }
          if (!isolatedTest && !meta && path === "/api/webhooks/whatsapp")
            throw new DomainError(503, "BLOCKED — EXTERNAL CREDENTIALS");
          if (meta && path === "/api/webhooks/whatsapp") {
            if (
              !meta.verifier.verify(
                raw,
                String(req.headers["x-hub-signature-256"] ?? ""),
              )
            )
              throw new DomainError(401, "Firma inválida");
            const events = meta.normalize(parse(raw));
            return json(res, 200, service.acceptInboundBatch(events));
          }
          if (
            !(
              path === "/api/webhooks/payment"
                ? service.payment.verifier
                : verifier
            ).verify(raw, String(req.headers["x-hub-signature-256"] ?? ""))
          )
            throw new DomainError(401, "Firma inválida");
          if (path === "/api/webhooks/whatsapp") {
            const event = inboundSchema.parse(parse(raw));
            if (event.type === "message" && event.location)
              await service.geo.prepare?.(event.location);
            return json(res, 200, service.inbound(event));
          }
          if (path === "/api/webhooks/payment")
            return json(res, 200, service.paymentWebhook(parse(raw)));
          throw new DomainError(404, "Webhook no encontrado");
        }
        if (req.method !== "GET" && req.headers.origin !== origin)
          throw new DomainError(403, "Origen inválido");
        if (req.method === "POST" && path === "/api/login") {
          const body = z
            .object({ id: z.string(), password: z.string().max(200) })
            .parse(parse(await rawBody(req)));
          const user = users.find((u) => u.id === body.id);
          const calculated = scryptSync(
            body.password,
            user?.salt ?? "unknown-user-salt",
            64,
          );
          if (
            !user ||
            !timingSafeEqual(calculated, Buffer.from(user.hash, "hex"))
          )
            throw new DomainError(401, "Credenciales inválidas");
          const id = randomBytes(32).toString("hex");
          sessions.set(id, {
            actor: { id: user.id, role: user.role },
            expires: Date.now() + runtime.sessionTtlSeconds * 1000,
          });
          res.setHeader(
            "Set-Cookie",
            `tl_session=${id}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${runtime.sessionTtlSeconds}`,
          );
          return json(res, 200, { ok: true });
        }
        const current = actor(req);
        if (path === "/api/ai/knowledge" && req.method === "POST") {
          aiGateway.updateKnowledge(parse(await rawBody(req)), current);
          return json(res, 200, { ok: true });
        }
        if (path === "/api/ai/control" && req.method === "POST") {
          const body = z
            .object({
              id: z.string(),
              version: z.number().int(),
              action: z.enum(["takeover", "return", "pause", "resolve"]),
              mode: z.enum(modes).optional(),
            })
            .strict()
            .parse(parse(await rawBody(req)));
          aiGateway.control(
            body.id,
            current,
            body.version,
            body.action,
            body.mode,
          );
          return json(res, 200, { ok: true });
        }
        if (path === "/api/ai/generate" && req.method === "POST") {
          const body = z
            .object({ id: z.string(), version: z.number().int() })
            .strict()
            .parse(parse(await rawBody(req)));
          const context = aiGateway.snapshot(body.id);
          if (
            context.version !== body.version ||
            (context.owner && context.owner !== current.id)
          )
            throw new DomainError(
              409,
              "Toma la conversación y actualiza antes de generar",
            );
          if (!aiConfig.enabled || !aiConfig.configured)
            throw new DomainError(409, "AI NOT CONFIGURED");
          await ai.process(body.id, true);
          return json(res, 200, { ok: true });
        }
        if (path === "/api/ai/approve" && req.method === "POST") {
          const body = z
            .object({
              id: z.string(),
              runId: z.string(),
              version: z.number().int(),
              action: z.enum(["send", "reject", "action"]),
              text: z.string().max(4000).optional(),
            })
            .strict()
            .parse(parse(await rawBody(req)));
          aiGateway.approve(
            body.id,
            body.runId,
            current,
            body.version,
            body.action,
            body.text,
          );
          return json(res, 200, { ok: true });
        }
        if (path === "/api/admin/diagnostics") {
          if (current.role !== "admin" || !staging)
            throw new DomainError(
              403,
              "Solo administradores pueden ejecutar diagnósticos",
            );
          if (req.method === "GET") return json(res, 200, readiness.snapshot());
          if (req.method === "POST") {
            const body = z
              .object({
                provider: z.enum(["paymennt", "geo", "meta"]),
                location: locationSchema.optional(),
              })
              .strict()
              .parse(parse(await rawBody(req)));
            try {
              return json(
                res,
                200,
                await readiness.probe(body.provider, body.location),
              );
            } catch {
              throw new DomainError(
                409,
                "Diagnóstico no disponible o en curso; espera e intenta de nuevo",
              );
            }
          }
        }
        if (req.method === "POST" && path === "/api/logout") {
          for (const [key, session] of sessions)
            if (session.actor.id === current.id) sessions.delete(key);
          res.setHeader(
            "Set-Cookie",
            "tl_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
          );
          return json(res, 200, { ok: true });
        }
        if (req.method === "POST" && path === "/api/payments/reconcile") {
          const body = z
            .object({ paymentId: z.string().min(1) })
            .parse(parse(await rawBody(req)));
          return json(
            res,
            200,
            await service.reconcile(body.paymentId, current),
          );
        }
        if (req.method === "GET" && path === "/api/workspace") {
          const s = store.read();
          for (const o of s.orders)
            if (
              o.location &&
              ["Building", "Awaiting Location", "Minimum Check"].includes(
                o.state,
              )
            )
              try {
                await service.geo.prepare?.(o.location);
              } catch {
                /* Keep unresolved GPS reviewable during provider outage. */
              }
          for (const o of s.orders)
            if (
              ["Building", "Awaiting Location", "Minimum Check"].includes(
                o.state,
              )
            )
              o.quote = quoteOrder(
                s.zones,
                o.lines,
                o.address,
                o.location,
                service.geo,
                o.manualZoneId,
                s.catalog ?? [],
              );
          return json(res, 200, {
            environment: runtime.environment,
            mode: "integration",
            actor: current,
            agents: users.map((u) => ({ id: u.id, name: u.id })),
            numbers: service.operationalNumbers,
            catalog: (s.catalog ?? []).filter(
              (p) => p.active !== false && p.availability !== "unavailable",
            ),
            zones: s.zones,
            conversations: s.conversations,
            orders: s.orders,
            payments: s.payments,
            readiness:
              staging && current.role === "admin"
                ? readiness.snapshot()
                : undefined,
            uatScenarios: s.uatScenarios ?? [],
            integrationHealth: {
              inboundFailed: (s.inboundDeliveries ?? []).filter(
                (d) => d.status === "failed",
              ).length,
            },
            ai: {
              configured: aiConfig.configured,
              enabled: aiConfig.enabled,
              defaultMode: aiConfig.defaultMode,
              autonomousAllowed: aiConfig.autonomousAllowed,
              ...aiGateway.summary(),
              knowledge:
                current.role === "admin" ? (s.ai?.knowledge ?? []) : undefined,
              enquiries: s.ai?.enquiries ?? [],
            },
            jobs: s.jobs.filter((j) => j.status !== "done"),
          });
        }
        if (req.method === "POST" && path === "/api/commands") {
          const command = commandSchema.parse(parse(await rawBody(req)));
          const location =
            command.type === "location"
              ? command.location
              : "id" in command
                ? store.read().orders.find((o) => o.id === command.id)?.location
                : undefined;
          if (location) {
            try {
              await service.geo.prepare?.(location);
            } catch {
              /* Persist location; payment remains blocked until resolution. */
            }
          }
          const result = service.command(
            command,
            String(req.headers["idempotency-key"] ?? ""),
            current,
          );
          return json(res, 200, result);
        }
        throw new DomainError(404, "Ruta no encontrada");
      }
      if (
        [
          "/demo",
          "/mvp",
          "/legacy-inbox",
          "/inbox",
          "/admin",
          "/operations",
        ].includes(path)
      ) {
        res.writeHead(308, { Location: "/operations/inbox" });
        return res.end();
      }
      if (req.method !== "GET" && req.method !== "HEAD")
        throw new DomainError(405, "Método no permitido");
      const root = resolve("dist/client"),
        candidate = resolve(root, "." + decodeURIComponent(path));
      if (candidate !== root && !candidate.startsWith(root + "/"))
        throw new DomainError(404, "No encontrado");
      // Public customer pages are prerendered to <page>.html at build time.
      const customerPage = customerPages.find(
        (p) => p === path.replace(/\/+$/, ""),
      );
      if (customerPage) {
        const page = resolve(root, `.${customerPage}.html`);
        const file = existsSync(page) ? page : resolve(root, "index.html");
        if (!existsSync(file))
          throw new DomainError(
            404,
            "Ejecuta el build para servir la aplicación",
          );
        res.writeHead(200, {
          "Content-Type": "text/html",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "same-origin",
          "Content-Security-Policy": customerCsp,
        });
        return res.end(req.method === "HEAD" ? undefined : readFileSync(file));
      }
      if (
        !existsSync(candidate) &&
        ![
          "/",
          "/operations/inbox",
          "/operations/orders",
          "/operations/production",
          "/operations/delivery",
          "/operations/zones",
          ...(staging ? ["/operations/readiness"] : []),
        ].includes(path)
      )
        throw new DomainError(404, "Ruta no encontrada");
      const file =
        existsSync(candidate) && statSync(candidate).isFile()
          ? candidate
          : resolve(root, "index.html");
      if (!existsSync(file))
        throw new DomainError(
          404,
          "Ejecuta el build para servir la aplicación",
        );
      const mime: Record<string, string> = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".webp": "image/webp",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
        ".mp4": "video/mp4",
        ".ico": "image/x-icon",
      };
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "same-origin",
        "Content-Security-Policy": customerCsp,
      });
      res.end(req.method === "HEAD" ? undefined : readFileSync(file));
    } catch (error) {
      json(
        res,
        error instanceof DomainError
          ? error.status
          : error instanceof ZodError
            ? 400
            : 500,
        {
          error:
            error instanceof DomainError
              ? error.message
              : error instanceof ZodError
                ? "Datos inválidos; revisa los campos"
                : "No se pudo completar la acción. Intenta nuevamente.",
        },
      );
    }
  });
  const backupTimer = backups
    ? setInterval(() => {
        void backups.run().catch(() => safeLog("worker.failed"));
      }, backups.intervalMinutes * 60000)
    : undefined;
  let agentWorking = false;
  const agentTimer = setInterval(() => {
    if (agentWorking || !aiConfig.enabled || !aiConfig.configured) return;
    agentWorking = true;
    void ai
      .tick()
      .catch(() => {})
      .finally(() => {
        agentWorking = false;
      });
  }, 1000);
  let working = false;
  const timer = setInterval(() => {
    if (working) return;
    working = true;
    void service
      .drain()
      .catch(() => {
        safeLog("worker.failed");
      })
      .finally(() => {
        working = false;
      });
    for (const [k, v] of limiter) if (v.until < Date.now()) limiter.delete(k);
    for (const [k, v] of sessions)
      if (v.expires < Date.now()) sessions.delete(k);
  }, 300);
  server.listen(
    Number(process.env.PORT ?? process.env.API_PORT ?? 3001),
    process.env.HOST ?? "127.0.0.1",
    () =>
      console.log(
        `Commerce listening on ${process.env.PORT ?? process.env.API_PORT ?? 3001}`,
      ),
  );
  function close() {
    clearInterval(timer);
    clearInterval(agentTimer);
    if (backupTimer) clearInterval(backupTimer);
    server.close(() => {
      const finish = setInterval(() => {
        if (working || agentWorking) return;
        clearInterval(finish);
        void (backups?.run() ?? Promise.resolve())
          .catch(() => {})
          .finally(() => {
            store.close();
            process.exit(0);
          });
      }, 25);
    });
  }
  process.on("SIGTERM", close);
  process.on("SIGINT", close);

  return { server, service, store };
}
