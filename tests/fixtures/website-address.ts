import type { GeoService } from "../../server/domain/zones";
/** Isolated fixture addresses only, never imported by runtime. No real boundaries. */
export const fixtureAddressGeo: GeoService = {
  resolve: () => null,
  resolveAddress(address) {
    if (/Downtown/i.test(address)) return {zoneId:"downtown"};
    if (/Marina/i.test(address)) return {zoneId:"marina"};
    if (/UAT|Fixture|Jumeirah Lakes|JLT|Test|Street/i.test(address)) return {zoneId:"jlt-cluster-c"};
    return null;
  },
};
