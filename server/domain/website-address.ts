import { z } from "zod";
import {
  loadDeliveryCoverage,
  checkDeliveryCoverage,
} from "./delivery-coverage";
import { readFileSync } from "node:fs";
import { locationSchema, requireThat } from "./model";
import { contains, type GeoService } from "./zones";
import type { CommerceService } from "./service";
/** Server-owned registry binds a complete verified address to actual coordinates.
 * Not a customer-selectable area, keyword match, or client latitude override. */
export const normalizeVerifiedAddress = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const registrySchema = z
  .array(
    z
      .object({
        address: z.string().min(5).max(300),
        building: z.string().min(1).max(120),
        location: locationSchema,
      })
      .strict(),
  )
  .max(10000);
export function attachVerifiedAddresses(
  geo: GeoService,
  file: string | undefined,
  coverageFile?: string,
): GeoService {
  const coverage = loadDeliveryCoverage(coverageFile);
  const entries = file
    ? registrySchema.parse(JSON.parse(readFileSync(file, "utf8")))
    : [];
  const keys = entries.map(
    (e) =>
      `${normalizeVerifiedAddress(e.address)}|${normalizeVerifiedAddress(e.building)}`,
  );
  if (new Set(keys).size !== keys.length)
    throw new Error("Duplicate verified delivery address");
  return {
    prepare: geo.prepare?.bind(geo),
    resolve: geo.resolve.bind(geo),
    resolveAddress(address, building, zones) {
      const entry = entries.find(
        (e) =>
          normalizeVerifiedAddress(e.address) ===
            normalizeVerifiedAddress(address) &&
          normalizeVerifiedAddress(e.building) ===
            normalizeVerifiedAddress(building),
      );
      if (!entry) return null;
      const eligibility = checkDeliveryCoverage(entry.location, coverage);
      if (eligibility.code === "NOT_CONFIGURED") return null;
      requireThat(
        eligibility.eligible,
        "This address is outside our current delivery coverage area.",
        422,
      );
      const matches = zones.filter(
        (z) => z.active && z.polygon && contains(entry.location, z.polygon),
      );
      // Multiple zones are ambiguous even if priorities differ: require business review.
      return matches.length === 1 ? { zoneId: matches[0]!.id } : null;
    },
  };
}
export function authoritativeAddress(
  service: CommerceService,
  input: { zoneId: string; address: string; building: string },
) {
  const resolved = service.geo.resolveAddress?.(
    input.address,
    input.building,
    service.store.read().zones,
  );
  requireThat(
    resolved,
    "We could not verify this delivery address. Contact 3L for delivery help or choose pickup.",
    422,
  );
  const zone = service.store
    .read()
    .zones.find((z) => z.active && z.id === resolved.zoneId);
  requireThat(zone, "Verified address is outside delivery coverage", 422);
  return zone;
}
