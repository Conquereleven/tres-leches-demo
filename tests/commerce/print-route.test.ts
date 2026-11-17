/** In-process route contract checks. These do NOT substitute for socket HTTP/browser tests. */
import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { serveOrderDocuments } from "../../server/orders/documents";
import { DomainError } from "../../server/domain/model";
import { printState } from "../fixtures/print-documents";
test("in-process document route: every role/variant, validation and no state writes", async () => {
  const state = printState();
  const before = JSON.stringify(state);
  const run = async (
    role: "admin" | "manager" | "operator" | "agent",
    payload: unknown,
    url = "/api/orders/documents",
  ) => {
    let bytes: Buffer | string = "";
    let status = 0;
    let headers: unknown;
    const req = {
      method: url.includes("?") ? "GET" : "POST",
      url,
    } as IncomingMessage;
    const res = {
      writeHead: (s: number, h: unknown) => {
        status = s;
        headers = h;
      },
      end: (b: Buffer | string) => {
        bytes = b;
      },
    } as unknown as ServerResponse;
    await serveOrderDocuments(
      req,
      res,
      url.split("?")[0]!,
      () => state,
      { id: "fixture", role },
      async () => payload,
    );
    return { bytes, status, headers };
  };
  for (const role of ["operator", "agent"] as const)
    for (const kind of ["packing-slip", "production-bulk", "delivery-note"])
      await assert.rejects(
        run(role, { ids: ["TL-DEMO-P1"], format: "pdf", kind }),
        (e: unknown) => e instanceof DomainError && e.status === 403,
      );
  for (const role of ["admin", "manager"] as const) {
    for (const kind of ["packing-slip", "production-bulk", "delivery-note"])
      for (const format of ["pdf", "zip"])
        assert.equal(
          (await run(role, { ids: ["TL-DEMO-P1", "TL-DEMO-P2"], kind, format }))
            .status,
          200,
        );
    for (const layout of ["a4", "a5", "a5-two-up"])
      assert.equal(
        (
          await run(
            role,
            null,
            `/api/orders/TL-DEMO-P1/document?kind=delivery-note&layout=${layout}`,
          )
        ).status,
        200,
      );
  }
  for (const payload of [
    { ids: [], format: "pdf" },
    { ids: ["TL-DEMO-P1", "TL-DEMO-P1"], format: "pdf" },
    { ids: Array.from({ length: 501 }, (_, i) => `X${i}`), format: "pdf" },
    { ids: ["TL-DEMO-P1"], format: "pdf", kind: "packing-slip", layout: "a5" },
    {
      ids: ["TL-DEMO-P1"],
      format: "pdf",
      kind: "delivery-note",
      layout: "letter",
    },
  ])
    await assert.rejects(
      run("admin", payload),
      (e: unknown) => e instanceof DomainError && e.status === 400,
    );
  await assert.rejects(
    run("admin", { ids: ["missing"], format: "pdf" }),
    (e: unknown) => e instanceof DomainError && e.status === 404,
  );
  assert.equal(JSON.stringify(state), before);
});
