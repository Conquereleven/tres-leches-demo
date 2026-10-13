import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { overviewMetrics } from "../../src/commerce/operations-overview";
import type { Workspace } from "../../src/commerce/api";
import { PRINTER_TARGETS } from "../../src/commerce/print-contract";
test("overview separates manual review from uncertain payments and excludes terminal orders", () => {
  const data = {
    orders: [
      { state: "Confirmed", delivery: { addressVerification: "UNVERIFIED" } },
      { state: "Awaiting Payment", paymentId: "pending" },
      { state: "Delivered", delivery: { addressVerification: "UNVERIFIED" } },
      { state: "Ready", fulfillmentMethod: "pickup" },
      { state: "Out for Delivery", fulfillmentMethod: "delivery" },
    ],
    payments: [{ id: "pending", directAttempt: "unknown" }],
    jobs: [{ status: "failed" }, { status: "sent" }],
    integrationHealth: { inboundFailed: 2 },
  } as unknown as Workspace;
  assert.deepEqual(overviewMetrics(data), {
    manualReview: 1,
    attention: 2,
    confirmed: 1,
    preparing: 0,
    ready: 1,
    deliveries: 1,
    failedJobs: 1,
    inboundFailed: 2,
  });
});
test("every literal admin translation has EN/TL coverage and equal interpolation variables", () => {
  const en = JSON.parse(readFileSync("src/commerce/locales/en.json", "utf8"));
  const tl = JSON.parse(readFileSync("src/commerce/locales/tl.json", "utf8"));
  assert.deepEqual(Object.keys(en).sort(), Object.keys(tl).sort());
  for (const key of Object.keys(en))
    assert.deepEqual(en[key].match(/{{\w+}}/g), tl[key].match(/{{\w+}}/g), key);
  for (const file of [
    "Workspace",
    "AgentPanel",
    "OrdersBoard",
    "OrdersList",
    "OrderDetails",
    "OrderBadges",
    "OperationsShell",
    "OperationsOverview",
    "PrintCenter",
  ]) {
    const source = ts.createSourceFile(
      file,
      readFileSync(`src/commerce/${file}.tsx`, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === "t" &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        assert.ok(
          node.arguments[0].text in en,
          `${file}: ${node.arguments[0].text}`,
        );
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
});
test("printer contract identifies known models without claiming connectivity", () => {
  assert.deepEqual(
    PRINTER_TARGETS.map((p) => p.model),
    ["Epson TM-T20II M267E", "Epson TM-T20II M267D"],
  );
  const source = readFileSync("src/commerce/PrintCenter.tsx", "utf8");
  assert.ok(!/fetch\(|api\(|window.print\(|https?:\/\//.test(source));
  assert.ok(source.includes("Preview only · no print job is created or sent"));
});
