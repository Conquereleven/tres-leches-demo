// Isolated staging HTTP tests only; no runtime flag or request can set the clock.
import { installCatalogFixtureClock } from "./catalog-clock";
installCatalogFixtureClock(process.env.PRODUCT_HUB_FIXTURE_NOW!);
await import("../../server/main");
