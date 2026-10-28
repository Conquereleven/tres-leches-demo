import { randomUUID } from "node:crypto";
import { Store, seed } from "../../server/db/store";
import {
  loadBootstrapSources,
  planCatalogBootstrap,
} from "../../server/catalog/bootstrap";
import { revisionFingerprint } from "../../server/catalog/contract";
import { PACK_SPECS, type CommerceLine } from "../../shared/pack-composition";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import { CommerceService } from "../../server/domain/service";
import { addDays, dubaiToday } from "../../server/domain/web-checkout";
const sources = loadBootstrapSources(process.cwd());
export function premiumFixture(approved = true) {
  const initial = seed();
  initial.catalog = structuredClone(sources.approved);
  initial.catalogFoundation = planCatalogBootstrap(
    initial.catalog,
    sources,
  ).foundation!;
  if (approved) {
    initial.catalogFoundation.packEligibility = PACK_SPECS.map((p) => ({
      packSkuId: p.packSkuId,
      componentSkuIds: p.components.map((c) => c.componentSkuId),
    }));
    const { revision: _r, ...meta } = initial.catalogFoundation;
    const hash = revisionFingerprint(meta, initial.catalog);
    initial.catalogFoundation.revision = {
      id: `catalog-v1-${hash}`,
      fingerprint: hash,
      publishedAt: null,
    };
  }
  const store = new Store(":memory:", "test", initial);
  const calls: Record<string, unknown>[] = [];
  const records = new Map<string, Record<string, unknown>>();
  let status = "PENDING";
  const provider = new PaymenntProvider(
    { apiKey: "fixture", apiSecret: "fixture", environment: "test" },
    async (url, init) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        calls.push(body);
        const id = randomUUID();
        records.set(id, {
          ...body,
          id,
          status,
          redirectUrl: `https://pay.test.paymennt.com/checkout/${id}`,
        });
        return Response.json({ success: true, result: records.get(id) });
      }
      return Response.json({
        success: true,
        result: { ...records.get(String(url).split("/").at(-1)!), status },
      });
    },
  );
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    provider,
  );
  service.operationsEmailRecipients = ["ops@example.invalid"];
  return {
    store,
    service,
    calls,
    status: (value: string) => {
      status = value;
    },
    paid: () => {
      status = "PAID";
    },
  };
}
export const premiumInput = (lines: CommerceLine[]) => ({
  lines,
  fulfillmentMethod: "pickup",
  pickup: {
    pickupDate: addDays(dubaiToday(), 2),
    preferredTime: "4:00 PM – 9:00 PM",
  },
  customer: {
    name: "Pack fixture",
    phone: "0500000000",
    email: "pack@example.invalid",
  },
  billing: {
    sameAsDelivery: false,
    name: "Pack fixture",
    address1: "Fixture street",
    city: "Dubai",
    country: "AE",
  },
});
