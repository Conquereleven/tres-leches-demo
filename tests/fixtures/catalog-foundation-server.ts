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
const sources = loadBootstrapSources(process.cwd());
const initial = seed();
initial.catalog = sources.approved;
const plan = planCatalogBootstrap(initial.catalog, sources);
if (!plan.report.valid) throw new Error("Fixture catalog invalid");
initial.catalogFoundation = plan.foundation;
const app = await startServer({ initial });
app.server.once("listening", () =>
  process.send?.({ port: (app.server.address() as { port: number }).port }),
);
