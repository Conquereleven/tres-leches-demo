import type { IncomingMessage, ServerResponse } from "node:http";
import type { Actor } from "../domain/model";
import { DomainError } from "../domain/model";
import type { Store } from "../db/store";
import {
  HUB_MEDIA_PREFIX,
  MAX_UPLOAD_BYTES,
  hubCommand,
  hubFlags,
  hubMediaAccess,
  hubUpload,
  hubView,
} from "./product-hub";

async function body(req: IncomingMessage, limit: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) throw new DomainError(413, "Request too large");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}
const send = (res: ServerResponse, status: number, value: unknown) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
};
/**
 * Authenticated Product Hub routes. The caller has already enforced the
 * same-origin rule for writes and resolved the signed-in actor.
 *   GET  /api/product-hub            admin, manager
 *   POST /api/product-hub/commands   admin
 *   POST /api/product-hub/media      admin (raw image body)
 */
export async function serveProductHub(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  store: Store,
  actor: Actor,
) {
  if (!path.startsWith("/api/product-hub")) return false;
  const flags = hubFlags(process.env);
  if (req.method === "GET" && path === "/api/product-hub") {
    send(res, 200, hubView(store.read(), actor, flags));
    return true;
  }
  const key = String(req.headers["idempotency-key"] ?? "");
  if (req.method === "POST" && path === "/api/product-hub/commands") {
    let raw: unknown;
    try {
      raw = JSON.parse((await body(req, 512 * 1024)).toString());
    } catch (e) {
      if (e instanceof DomainError) throw e;
      throw new DomainError(400, "Invalid JSON");
    }
    send(res, 200, hubCommand(store, actor, key, raw, flags));
    return true;
  }
  if (req.method === "POST" && path === "/api/product-hub/media") {
    // Refuse before reading megabytes from someone who cannot upload.
    if (actor.role !== "admin")
      throw new DomainError(
        403,
        "Only an administrator can change the catalog",
      );
    let meta: unknown;
    try {
      meta = JSON.parse(
        Buffer.from(
          String(req.headers["x-hub-meta"] ?? ""),
          "base64url",
        ).toString(),
      );
    } catch {
      throw new DomainError(400, "Invalid upload description");
    }
    const bytes = await body(req, MAX_UPLOAD_BYTES);
    send(
      res,
      200,
      hubUpload(
        store,
        actor,
        key,
        bytes,
        String(req.headers["content-type"] ?? ""),
        meta,
        flags,
      ),
    );
    return true;
  }
  throw new DomainError(404, "Not found");
}
/**
 * GET /brand/hub/<sha256>.<ext>. Published images are public and immutable;
 * draft images are served only to signed-in catalog staff.
 */
export function serveHubMedia(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  store: Store,
  actor: () => Actor | null,
) {
  if (!path.startsWith(HUB_MEDIA_PREFIX)) return false;
  const match = /^\/brand\/hub\/([a-f0-9]{64})\.(png|jpg|webp|avif)$/.exec(
    path,
  );
  if (!match || (req.method !== "GET" && req.method !== "HEAD"))
    throw new DomainError(404, "Not found");
  const access = hubMediaAccess(store.read(), match[1]!, actor());
  const media = access ? store.getMedia(match[1]!) : null;
  if (!access || !media) throw new DomainError(404, "Not found");
  res.writeHead(200, {
    "Content-Type": media.contentType,
    "Content-Length": media.bytes.length,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control":
      access === "public"
        ? "public, max-age=31536000, immutable"
        : "private, no-store",
  });
  res.end(req.method === "HEAD" ? undefined : media.bytes);
  return true;
}
