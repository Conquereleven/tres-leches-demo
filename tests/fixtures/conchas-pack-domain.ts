/** Isolated commercial state and fake transport. Never imported by runtime. */
import { randomUUID } from "node:crypto";
import { Store, seed } from "../../server/db/store";
import {
  loadBootstrapSources,
  planCatalogBootstrap,
} from "../../server/catalog/bootstrap";
import { revisionFingerprint } from "../../server/catalog/contract";
import { hubCommand, hubView } from "../../server/catalog/product-hub";
import { CommerceService } from "../../server/domain/service";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import { addDays, dubaiToday } from "../../server/domain/web-checkout";
import {
  PACK_SPECS,
  type CommerceLine,
  type PackEligibility,
  type PackSpec,
} from "../../shared/pack-composition";
export const sources = loadBootstrapSources(process.cwd());
export const flags = {
  enabled: true,
  publishEnabled: true,
  publishBlocked: null,
};
export const admin = { id: "fixture-admin", role: "admin" } as const;
export const manager = { id: "fixture-manager", role: "manager" } as const;
export const approvals = (): PackEligibility =>
  PACK_SPECS.map((p) => ({
    packSkuId: p.packSkuId,
    componentSkuIds: p.components.map((c) => c.componentSkuId),
  }));
export function fixture(rules: PackEligibility = approvals()) {
  const state = seed();
  state.catalog = structuredClone(sources.approved);
  state.catalogFoundation = planCatalogBootstrap(
    state.catalog,
    sources,
  ).foundation!;
  if (rules.length) state.catalogFoundation.packEligibility = rules;
  const { revision: _revision, ...meta } = state.catalogFoundation;
  const hash = revisionFingerprint(meta, state.catalog);
  state.catalogFoundation.revision = {
    id: `catalog-v1-${hash}`,
    fingerprint: hash,
    publishedAt: null,
  };
  const store = new Store(":memory:", "test", state);
  const records = new Map<string, Record<string, unknown>>(),
    calls: Record<string, unknown>[] = [];
  let status = "PENDING";
  const provider = new PaymenntProvider(
    { apiKey: "fixture", apiSecret: "fixture", environment: "test" },
    async (url, init) => {
      if (init?.method === "POST") {
        const data = JSON.parse(String(init.body)),
          id = randomUUID();
        calls.push(data);
        records.set(id, {
          ...data,
          id,
          redirectUrl: `https://pay.test.paymennt.com/checkout/${id}`,
        });
        return Response.json({
          success: true,
          result: { ...records.get(id), status },
        });
      }
      return Response.json({
        success: true,
        result: { ...records.get(String(url).split("/").at(-1)!), status },
      });
    },
  );
  return {
    store,
    calls,
    service: new CommerceService(
      store,
      new DisabledWhatsAppProvider(),
      provider,
    ),
    paid: () => {
      status = "PAID";
    },
  };
}
export const single = (s: PackSpec, i = 0) => [
  { componentSkuId: s.components[i]!.componentSkuId, units: s.capacity },
];
export const input = (lines: CommerceLine[]) => ({
  lines,
  fulfillmentMethod: "pickup",
  pickup: {
    pickupDate: addDays(dubaiToday(), 2),
    preferredTime: "4:00 PM – 9:00 PM",
  },
  customer: {
    name: "Conchas UAT",
    phone: "0500000000",
    email: "uat@example.invalid",
  },
  billing: {
    sameAsDelivery: false,
    name: "Conchas UAT",
    address1: "Fixture street",
    city: "Dubai",
    country: "AE",
  },
});
export function save(f: ReturnType<typeof fixture>, rules: PackEligibility) {
  const v = hubView(f.store.read(), manager, flags);
  if (!v.available) throw Error("fixture hub unavailable");
  return hubCommand(
    f.store,
    manager,
    randomUUID(),
    { type: "savePackEligibility", expectedVersion: v.version, rules },
    flags,
  );
}
export function publish(f: ReturnType<typeof fixture>) {
  const v = hubView(f.store.read(), admin, flags);
  if (!v.available) throw Error("fixture hub unavailable");
  return hubCommand(
    f.store,
    admin,
    randomUUID(),
    {
      type: "publish",
      expectedVersion: v.version,
      expectedPublishedRevision: v.published.id,
    },
    flags,
  );
}
