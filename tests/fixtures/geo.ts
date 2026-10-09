import type { Location } from "../../server/domain/model";
import type { GeoService } from "../../server/domain/zones";
// Exact fixture points ONLY: never pretend these are real neighborhood boundaries.
export class MockGeoService implements GeoService {
  resolve(p: Location) {
    return p.lat === 25.0657 && p.lng === 55.2089 ? { zoneId: "jvc" } : null;
  }
}
