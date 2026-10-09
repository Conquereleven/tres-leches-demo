/** Local-only visual QA harness. Empty, disposable staging database; no provider credentials.
 * A fixed fixture account is relayed to the loopback backend so the in-app browser can
 * review staging without installing a localhost TLS certificate. Never release this file.
 */
import { createServer, request } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stagingEnv } from "./staging";
import { startServer } from "../../server/http";
const dir = mkdtempSync(join(tmpdir(), "tl27-preview-"));
Object.assign(process.env, stagingEnv(dir), {
  API_PORT: "5197",
  HOST: "127.0.0.1",
  AI_ENABLED: "false",
  AI_AUTONOMOUS_ALLOWED: "false",
  AI_AGENT_DEFAULT_MODE: "copilot",
});
delete process.env.PORT;
const backend = await startServer();
await new Promise<void>((resolve) =>
  backend.server.listening
    ? resolve()
    : backend.server.once("listening", resolve),
);
const login = await fetch("http://127.0.0.1:5197/api/login", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: "https://staging.example.invalid",
  },
  body: JSON.stringify({
    id: "test-admin",
    password: "fixture-password-not-shipped",
  }),
});
if (!login.ok) throw new Error(`Fixture login failed: ${login.status}`);
const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
createServer((req, res) => {
  if (req.url === "/qa-axe.js") {
    res.setHeader("Content-Type", "application/javascript");
    res.end(
      readFileSync("node_modules/axe-core/axe.min.js", "utf8") +
        `;setInterval(async () => { if (window.__qaRunning) return; window.__qaRunning = true; try { const results = await axe.run(document); let report = document.getElementById("qa-accessibility-report"); if (!report) { report = document.createElement("script"); report.id = "qa-accessibility-report"; report.type = "application/json"; document.body.append(report); } report.textContent = JSON.stringify({url:location.pathname,width:innerWidth,violations:results.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))}); } finally { window.__qaRunning = false; } }, 2000);`,
    );
    return;
  }
  const upstream = request(
    {
      hostname: "127.0.0.1",
      port: 5197,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        cookie,
        origin: "https://staging.example.invalid",
      },
    },
    (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (part) => chunks.push(Buffer.from(part)));
      response.on("end", () => {
        const headers = { ...response.headers };
        delete headers["set-cookie"];
        delete headers["content-length"];
        // QA library is injected only here, never into the shipped application bundle.
        let body = Buffer.concat(chunks);
        if (String(headers["content-type"]).includes("text/html"))
          body = Buffer.from(
            body
              .toString()
              .replace("</head>", '<script src="/qa-axe.js"></script></head>'),
          );
        res.writeHead(response.statusCode ?? 502, headers);
        res.end(body);
      });
    },
  );
  upstream.on("error", () => {
    res.writeHead(502);
    res.end("Preview unavailable");
  });
  req.pipe(upstream);
}).listen(5177, "127.0.0.1", () =>
  console.log(
    "Empty staging visual preview: http://127.0.0.1:5177/operations/inbox",
  ),
);
