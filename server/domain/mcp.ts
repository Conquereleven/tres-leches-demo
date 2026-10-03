/** Read-only MCP application boundary. Remote OAuth/account connection is deliberately separate. */
import { z } from "zod";
import type { Actor } from "./model";
import { requireThat } from "./model";
import type { CommerceService } from "./service";
const request = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.string().max(100), z.number().int()]),
    method: z.string().max(100),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
const tools = [
  {
    name: "catalog_list",
    description: "Approved product names, prices and availability only",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "orders_list",
    description:
      "Recent order IDs, state and fulfillment method; no customer or payment data",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "order_status",
    description: "Retrieve an order's operational state by ID",
    inputSchema: {
      type: "object",
      properties: { orderId: { type: "string" } },
      required: ["orderId"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
];
export function mcpRead(service: CommerceService, raw: unknown, actor: Actor) {
  requireThat(
    ["admin", "manager"].includes(actor.role),
    "MCP read permission required",
    403,
  );
  const req = request.parse(raw);
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: req.id, result });
  if (req.method === "initialize")
    return reply({
      protocolVersion: "2025-11-25",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "3l-readonly", version: "1.0.0" },
    });
  if (req.method === "ping") return reply({});
  if (req.method === "tools/list") return reply({ tools });
  if (req.method !== "tools/call")
    return {
      jsonrpc: "2.0",
      id: req.id,
      error: { code: -32601, message: "Method not supported" },
    };
  const call = z
    .object({
      name: z.enum(["catalog_list", "orders_list", "order_status"]),
      arguments: z.record(z.string(), z.unknown()).default({}),
    })
    .strict()
    .parse(req.params);
  const args =
    call.name === "order_status"
      ? z
          .object({ orderId: z.string().min(1).max(100) })
          .strict()
          .parse(call.arguments)
      : z.object({}).strict().parse(call.arguments);
  const state = service.store.read();
  const orderView = (id: string) => {
    const order = state.orders.find((o) => o.id === id);
    return order
      ? {
          id: order.id,
          state: order.state,
          fulfillmentMethod: order.fulfillmentMethod ?? "delivery",
        }
      : null;
  };
  const data =
    call.name === "catalog_list"
      ? (state.catalog ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          priceFils: p.priceFils,
          active: p.active !== false,
          availability: p.availability,
        }))
      : call.name === "orders_list"
        ? state.orders.slice(-100).map((o) => orderView(o.id))
        : orderView((args as { orderId: string }).orderId);
  service.store.write((s) => {
    s.audit.push({
      at: new Date().toISOString(),
      actor: actor.id,
      action: `MCP read: ${call.name}`,
    });
  });
  return reply({
    content: [{ type: "text", text: JSON.stringify(data) }],
    isError: false,
  });
}
