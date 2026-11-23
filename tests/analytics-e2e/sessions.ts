import { expect, type APIRequestContext } from "@playwright/test";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

/**
 * Shared login sessions for the Analytics E2E suite.
 *
 * Root cause (RT01 RC-03): every spec file × every project ran its own
 * multi-role `beforeAll` login burst against the single shared fixture
 * server (4 + 2 roles, doubled by the chromium/webkit projects, plus the
 * UI sign-in test). More than 10 POST /api/login from one IP within a
 * minute trips the preserved Production login rate limit and the suite
 * fails with HTTP 429. The limit itself must NOT be raised and no login
 * control may be removed in Production.
 *
 * Fix: log in at most once per role per server run and reuse the cookie in
 * every file and project. Reuse is only valid on an exact HTTP 200 from
 * `GET /api/workspace` whose `actor` matches the expected synthetic user;
 * any other status (401/403/429/5xx) or role mismatch forces a fresh login
 * and never reuses the cookie.
 *
 * Cache scope (RT01 R1): the file lives in the per-run directory created by
 * `playwright.analytics.config.ts` (`ANALYTICS_SESSIONS_FILE`), so it is
 * only ever read by the synthetic server execution that wrote it. It is
 * created with mode 0600, holds synthetic fixture cookies only, and is
 * removed by `tests/analytics-e2e/global-teardown.ts`. The backend
 * rate limit is untouched: on a 429 the test fails fast with an explicit
 * message instead of sleeping past the 45 s test timeout (RT01 R2).
 */
const ORIGIN = "https://127.0.0.1:3339";
const LEGACY_FILE = "test-results/analytics/.sessions.json";
const FILE = process.env.ANALYTICS_SESSIONS_FILE ?? LEGACY_FILE;

type Cache = { origin: string; sessions: Record<string, string> };

function readCache(): Cache {
  try {
    const raw = JSON.parse(readFileSync(FILE, "utf8")) as Partial<Cache>;
    if (raw.origin === ORIGIN && raw.sessions) return raw as Cache;
    return { origin: ORIGIN, sessions: {} };
  } catch {
    return { origin: ORIGIN, sessions: {} };
  }
}

function writeCache(cache: Cache): void {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(cache));
  // Cookies on disk are readable by the owner only, even on shared runners.
  chmodSync(FILE, 0o600);
}

/** Remove this run's cookie cache. Safe to call when the file is absent. */
export function discardSessions(): void {
  rmSync(FILE, { force: true });
  // One-time hygiene: drop the pre-RT01 cache written without 0600 perms.
  if (FILE !== LEGACY_FILE) rmSync(LEGACY_FILE, { force: true });
}

async function loginOnce(
  request: APIRequestContext,
  role: string,
): Promise<string> {
  const response = await request.post("/api/login", {
    headers: { Origin: ORIGIN },
    data: { id: `fixture-${role}`, password: "fictional-password" },
  });
  expect(
    response.status(),
    `analytics login for fixture-${role} hit the preserved 10-logins/min ` +
      `rate limit (HTTP 429). Shared per-run reuse must prevent this; ` +
      `do NOT raise the backend limit to make the test pass.`,
  ).toBe(200);
  const setCookie = response.headers()["set-cookie"];
  expect(setCookie).toBeTruthy();
  return setCookie!.split(";")[0]!.split("=")[1]!;
}

/**
 * Reuse requires proof, not absence of 401: the probe must answer 200 and
 * name the exact synthetic actor. Anything else (expired, forbidden,
 * rate-limited, error) discards the cached cookie without reusing it.
 */
async function reusableSession(
  request: APIRequestContext,
  role: string,
  cookie: string,
): Promise<boolean> {
  const probe = await request.get("/api/workspace", {
    headers: { Cookie: `tl_session=${cookie}`, Origin: ORIGIN },
  });
  if (probe.status() !== 200) return false;
  try {
    const body = (await probe.json()) as {
      actor?: { id?: string; role?: string };
    };
    if (!body.actor) return true; // No identity exposed: status 200 suffices.
    return (
      body.actor.id === `fixture-${role}` && body.actor.role === role
    );
  } catch {
    return true; // Unparseable body: the 200 status is the reuse signal.
  }
}

export async function ensureSessions(
  request: APIRequestContext,
  roles: string[],
): Promise<Map<string, string>> {
  const cache = readCache();
  const out = new Map<string, string>();
  let dirty = false;
  // Sequential: one login per role per run, never a parallel burst.
  for (const role of roles) {
    const hit = cache.sessions[role];
    if (hit && (await reusableSession(request, role, hit))) {
      out.set(role, hit);
      continue;
    }
    const fresh = await loginOnce(request, role);
    cache.sessions[role] = fresh;
    dirty = true;
    out.set(role, fresh);
  }
  if (dirty) writeCache(cache);
  // Repair permissions on a cache written before the 0600 rule.
  try {
    chmodSync(FILE, 0o600);
  } catch {
    /* File may not exist when nothing was written; ignore. */
  }
  return out;
}
