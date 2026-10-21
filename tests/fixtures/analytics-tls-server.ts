/** Local TLS, matching Production Secure-cookie transport. Never changes app cookie policy. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import https from "node:https";
import http from "node:http";
const dir = mkdtempSync(join(tmpdir(), "3l-analytics-tls-"));
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    join(dir, "key.pem"),
    "-out",
    join(dir, "cert.pem"),
    "-days",
    "1",
    "-subj",
    "/CN=127.0.0.1",
  ],
  { stdio: "ignore" },
);
await import("./analytics-server");
const proxy = https.createServer(
  {
    key: readFileSync(join(dir, "key.pem")),
    cert: readFileSync(join(dir, "cert.pem")),
  },
  (req, res) => {
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: 3338,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  },
);
proxy.listen(3339, "127.0.0.1");
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
