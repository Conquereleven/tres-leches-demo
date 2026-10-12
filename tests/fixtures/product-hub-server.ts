// Isolated Product Hub harness: disposable database, approved catalog and its
// foundation, no providers. Never imported by the production server.
import { startServer } from "../../server/http";
import { seed } from "../../server/db/store";
import {
  loadBootstrapSources,
  planCatalogBootstrap,
} from "../../server/catalog/bootstrap";
process.env.APP_ENV = "test";
process.env.NODE_ENV = "test";
process.env.PROVIDER_MODE = "offline";
process.env.META_OUTBOUND_ENABLED = "false";
process.env.AI_ENABLED = "false";
process.env.PRODUCT_HUB_ENABLED ??= "true";
process.env.PRODUCT_HUB_PUBLISH_ENABLED ??= "true";
const sources = loadBootstrapSources(process.cwd());
const initial = seed();
initial.catalog = structuredClone(sources.approved);
const plan = planCatalogBootstrap(initial.catalog, sources);
if (!plan.report.valid) throw new Error("Fixture catalog invalid");
initial.catalogFoundation = plan.foundation;
await startServer({ initial });
