/** Host/browser harness uses only real HTTP endpoints; IPC controls mock clock/provider. */
import type { State } from "../../server/domain/model";
import { fork } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
export async function integratedServer(port = 5174) {
  const dir = mkdtempSync(join(tmpdir(), "rt01-integrated-"));
  const base = `http://127.0.0.1:${port}`;
  const child = fork("tests/fixtures/rt01-integrated-server.ts", [], {
    execArgv: ["--import", "tsx"],
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      DB_PATH: join(dir, "state.sqlite"),
      HOST: "127.0.0.1",
      PORT: String(port),
      API_PORT: String(port),
      APP_ORIGIN: base,
    },
    silent: true,
  });
  let stderr = "",
    seq = 0;
  child.stderr?.on("data", (d) => (stderr += d));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`fixture timeout ${stderr}`)),
      20000,
    );
    child.on("message", (m: { ready?: boolean }) => {
      if (m.ready) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`fixture exit ${code}: ${stderr}`));
    });
  }).catch((error) => {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
    throw error;
  });
  return {
    base,
    async control(action: string, extra: Record<string, string> = {}) {
      const id = ++seq;
      return await new Promise<{ state: State; creates: number }>(
        (resolve, reject) => {
          const timer = setTimeout(() => {
            child.off("message", listener);
            reject(new Error("IPC timeout"));
          }, 10000);
          const listener = (m: {
            id?: number;
            error?: string;
            state: State;
            creates: number;
          }) => {
            if (m.id === id) {
              clearTimeout(timer);
              child.off("message", listener);
              if (m.error) reject(new Error(m.error));
              else resolve(m);
            }
          };
          child.on("message", listener);
          child.send({ id, action, ...extra });
        },
      );
    },
    async close() {
      child.kill();
      await new Promise<void>((r) =>
        child.exitCode !== null ? r() : child.once("exit", () => r()),
      );
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
export function checkoutBody(pickup: boolean) {
  return {
    fulfillmentMethod: pickup ? "pickup" : "delivery",
    lines: [
      { productId: "conchas-traditional-chocolate-mini-40-g", quantity: 6 },
    ],
    ...(pickup
      ? {
          pickup: {
            pickupDate: "2026-11-14",
            preferredTime: "4:00 PM – 9:00 PM",
          },
        }
      : {
          delivery: {
            zoneId: "jlt-cluster-c",
            address: "Fixture Street",
            building: "Fixture Tower",
            date: "2026-11-14",
            slot: "4:00 PM – 9:00 PM",
          },
        }),
    customer: {
      firstName: "Synthetic",
      lastName: "Integration",
      email: "integrated@example.invalid",
      phone: "0500000000",
    },
    billing: pickup
      ? {
          sameAsDelivery: false,
          name: "Synthetic Integration",
          address1: "Fixture Street",
          city: "Dubai",
          country: "AE",
        }
      : { sameAsDelivery: true },
  };
}
