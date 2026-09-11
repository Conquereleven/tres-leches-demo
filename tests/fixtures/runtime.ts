import { Store as RealStore } from "../../server/db/store";
import { CommerceService as RealService } from "../../server/domain/service";
import { catalog, numbers } from "../../server/domain/model";
import {
  matchZone as realMatch,
  quoteOrder as realQuote,
} from "../../server/domain/zones";
import { testCatalog, testNumbers } from "./catalog";
import { MockGeoService } from "./geo";
import { seed } from "./seed";
catalog.splice(0, catalog.length, ...testCatalog);
numbers.splice(0, numbers.length, ...testNumbers);
export { seed };
export class Store extends RealStore {
  constructor(
    path: string,
    mode: boolean | "staging" | "development" | "test" = true,
    initial?: ReturnType<typeof seed>,
  ) {
    super(path, mode, initial ?? (mode === true ? seed() : undefined));
  }
}
export class CommerceService extends RealService {
  constructor(...args: ConstructorParameters<typeof RealService>) {
    args[3] ??= new MockGeoService();
    super(...args);
  }
}
export const matchZone: typeof realMatch = (
  zones,
  address,
  location,
  geo = new MockGeoService(),
) => realMatch(zones, address, location, geo);
export const quoteOrder: typeof realQuote = (
  zones,
  lines,
  address,
  location,
  geo = new MockGeoService(),
  manual,
) => realQuote(zones, lines, address, location, geo, manual);
