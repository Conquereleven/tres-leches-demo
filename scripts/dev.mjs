import { spawn } from "node:child_process";
const children = [
  spawn("node", ["--import", "tsx", "server/main.ts"], { stdio: "inherit" }),
  spawn(
    "node",
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      process.env.UI_PORT ?? "5173",
      "--strictPort",
    ],
    {
      stdio: "inherit",
    },
  ),
];
const close = () => children.forEach((c) => c.kill("SIGTERM"));
process.on("SIGINT", close);
process.on("SIGTERM", close);
children.forEach((c) => c.on("exit", close));
