import http from "node:http";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";
import { z, ZodError } from "zod";
import { Store } from "./db/store";
import { quoteOrder } from "./domain/zones";
import { commandSchema, inboundSchema } from "./domain/commands";
import { CommerceService } from "./domain/service";
import { DomainError, type Actor, catalog, numbers } from "./domain/model";
import {
  HmacVerifier,
  MockPaymentProvider,
  MockWhatsAppProvider,
} from "./adapters/providers";
const demo =
  process.env.DEMO_MODE === "true" || process.env.NODE_ENV !== "production";
// Real provider activation is deliberately fail-closed until reviewed adapters are installed.
if (!demo)
  throw new Error(
    "Real mode requires reviewed WhatsApp/Payment/Geo adapters; DEMO_MODE=true runs a labelled sandbox.",
  );
const production = process.env.NODE_ENV === "production";
const secret =
  process.env.WEBHOOK_SECRET ??
  (production ? "" : randomBytes(32).toString("hex"));
const verifier = new HmacVerifier(secret);
const store = new Store(process.env.DB_PATH ?? "data/commerce.sqlite");
const service = new CommerceService(
  store,
  new MockWhatsAppProvider(),
  new MockPaymentProvider(
    verifier,
    (reference) =>
      store.read().payments.find((p) => p.providerReference === reference)
        ?.status,
  ),
);
const usersSchema = z.array(
  z.object({
    id: z.enum(["liza", "andrea"]),
    role: z.enum(["admin", "agent"]),
    salt: z.string().min(16),
    hash: z.string().regex(/^[a-f0-9]{128}$/),
  }),
);
const users = usersSchema.parse(
  JSON.parse(process.env.OPERATOR_USERS_JSON ?? "[]"),
);
if (production && !users.length)
  throw new Error("Production sandbox requires OPERATOR_USERS_JSON");
const sessions = new Map<string, { actor: Actor; expires: number }>();
const limiter = new Map<string, { count: number; until: number }>();
const origin = process.env.APP_ORIGIN ?? "http://127.0.0.1:5173";
function actor(req: http.IncomingMessage): Actor {
  if (!production) return { id: "liza", role: "admin" };
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
    if (size > 65536) throw new DomainError(413, "Solicitud demasiado grande");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function parse(raw: string): unknown {
  try {
    return JSON.parse(raw);
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
export const server = http.createServer(async (req, res) => {
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
        throw new DomainError(429, "Demasiadas solicitudes; espera un minuto");
      if (req.method === "GET" && path === "/api/health")
        return json(res, 200, { ok: true, mode: "demo" });
      if (req.method === "POST" && path.startsWith("/api/webhooks/")) {
        const raw = await rawBody(req);
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
          expires: Date.now() + 8 * 3600000,
        });
        res.setHeader(
          "Set-Cookie",
          `tl_session=${id}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`,
        );
        return json(res, 200, { ok: true });
      }
      const current = actor(req);
      if (req.method === "GET" && path === "/api/workspace") {
        const s = store.read();
        for (const o of s.orders)
          if (
            o.location &&
            ["Building", "Awaiting Location", "Minimum Check"].includes(o.state)
          )
            await service.geo.prepare?.(o.location);
        for (const o of s.orders)
          if (
            ["Building", "Awaiting Location", "Minimum Check"].includes(o.state)
          )
            o.quote = quoteOrder(
              s.zones,
              o.lines,
              o.address,
              o.location,
              service.geo,
            );
        return json(res, 200, {
          mode: "demo",
          actor: current,
          agents: [
            { id: "liza", name: "Liza" },
            { id: "andrea", name: "Andrea" },
          ],
          numbers,
          catalog,
          zones: s.zones,
          conversations: s.conversations,
          orders: s.orders,
          payments: s.payments,
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
        if (location) await service.geo.prepare?.(location);
        const result = service.command(
          command,
          String(req.headers["idempotency-key"] ?? ""),
          current,
        );
        return json(res, 200, result);
      }
      // These fixtures exist only in the sandbox; the same domain path validates signed webhooks.
      if (req.method === "POST" && path === "/api/demo/location") {
        const b = z
          .object({ conversationId: z.string() })
          .parse(parse(await rawBody(req)));
        const c = store
          .read()
          .conversations.find((c) => c.id === b.conversationId);
        if (!c) throw new DomainError(404, "Conversación no encontrada");
        return json(
          res,
          200,
          service.inbound({
            type: "message",
            eventId: randomBytes(12).toString("hex"),
            sourceNumberId: c.sourceNumberId,
            phone: c.phone,
            customer: c.customer,
            text: "Ubicación compartida · demo JVC",
            location: { lat: 25.0657, lng: 55.2089 },
          }),
        );
      }
      if (req.method === "POST" && path === "/api/demo/payment") {
        const b = z
          .object({
            paymentId: z.string(),
            status: z.enum(["paid", "failed", "expired"]),
          })
          .parse(parse(await rawBody(req)));
        const p = store.read().payments.find((p) => p.id === b.paymentId);
        if (!p?.providerReference)
          throw new DomainError(409, "Espera a que se genere el enlace");
        return json(
          res,
          200,
          service.paymentWebhook({
            eventId: randomBytes(12).toString("hex"),
            reference: p.providerReference,
            transactionId: `mock-tx-${p.id}`,
            status: b.status,
            amountFils: p.amountFils,
            currency: p.currency,
          }),
        );
      }
      throw new DomainError(404, "Ruta no encontrada");
    }
    if (req.method !== "GET" && req.method !== "HEAD")
      throw new DomainError(405, "Método no permitido");
    const root = resolve("dist/client"),
      candidate = resolve(root, "." + decodeURIComponent(path));
    if (candidate !== root && !candidate.startsWith(root + "/"))
      throw new DomainError(404, "No encontrado");
    const file =
      existsSync(candidate) && statSync(candidate).isFile()
        ? candidate
        : resolve(root, "index.html");
    if (!existsSync(file))
      throw new DomainError(404, "Ejecuta el build para servir la aplicación");
    const mime: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
    };
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "Content-Security-Policy":
        "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; script-src 'self'; frame-ancestors 'none'",
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
let working = false;
const timer = setInterval(() => {
  if (working) return;
  working = true;
  void service
    .drain()
    .catch(() => {
      /* Retain queued work; the next tick retries a transient storage failure. */
    })
    .finally(() => {
      working = false;
    });
  for (const [k, v] of limiter) if (v.until < Date.now()) limiter.delete(k);
  for (const [k, v] of sessions) if (v.expires < Date.now()) sessions.delete(k);
}, 300);
server.listen(
  Number(process.env.API_PORT ?? 3001),
  process.env.HOST ?? "127.0.0.1",
  () =>
    console.log(
      `Commerce sandbox listening on ${process.env.API_PORT ?? 3001}`,
    ),
);
function close() {
  clearInterval(timer);
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
