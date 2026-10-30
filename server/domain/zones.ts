import { liveLinePrice } from "./pack-pricing";
import {
  deliveryPolicySchema,
  type DeliveryZone,
  type Location,
  type Quote,
  type Line,
  catalog,
  type CatalogItem,
} from "./model";
// Approved October 2026: delivery is included for all supported zones.
const bands: [number, string[]][] = [
  [
    30,
    [
      "JLT Cluster O",
      "JLT Cluster P",
      "JLT Cluster Q",
      "JLT Cluster R",
      "JLT Cluster S",
      "JLT Cluster T",
      "JLT Cluster U",
      "JLT Cluster V",
      "JLT Cluster W",
      "JLT Cluster X",
      "JLT Cluster Y",
      "ONE JLT",
      "MAZAYA",
      "TAJ RESIDENCE",
    ],
  ],
  [
    50,
    [
      "JUMEIRAH ISLAND",
      "THE GARDENS",
      "DISCOVERY GARDENS",
      "SPRINGS",
      "MEADOWS",
      "EMIRATES HILLS",
      "THE LAKES",
      "THE GREENS",
      "JUMEIRAH PARK",
      "JUMEIRAH HEIGHTS",
      "JVT",
      "AL FURJAN",
      "JEBEL ALI 2",
      "JEBEL ALI VILLAGE",
      "THE HILLS",
      "VIDA THE HILLS",
      "JBR",
      "MARINA",
    ],
  ],
  [
    100,
    [
      "JVC",
      "INTERNET CITY",
      "MEDIA CITY",
      "BARSHA HEIGHTS",
      "Palm Jumeirah - Shoreline",
      "Palm Jumeirah - Golden Mile",
      "AL BARSHA 1",
      "KNOWLEDGE VILLAGE",
      "KNOWLEDGE PARK",
      "AL SUFOUH 2",
      "SECRET BEACH",
    ],
  ],
  [
    150,
    [
      "DUBAI HILLS",
      "AL QUOZ",
      "IMPZ (D.PRODUCTION CITY)",
      "AL BARSHA SOUTH",
      "JUMEIRAH GOLF ESTATE",
      "MOTORCITY",
      "SPORTS CITY",
      "JEBEL ALI",
      "AL BARSHA 2",
      "AL BARSHA 3",
      "AL SUFOUH 1",
      "UMM SUQEIM 3",
      "VICTORY HEIGHTS",
      "Palm Jumeirah - West Crescent",
      "Palm Jumeirah - East Crescent",
      "STUDIO CITY",
    ],
  ],
  [
    200,
    [
      "AL WASL ROAD",
      "AL SAFA",
      "ARABIAN RANCHES",
      "UMM SUQEIM 2",
      "UMM SUQEIM 1",
      "AL MANARA",
      "JAFZA",
      "DIP",
      "GREEN COMMUNITY DIP",
    ],
  ],
  [250, ["DAMAC HILLS", "SUSTAINABLE CITY"]],
  [
    300,
    [
      "JUMEIRAH 3",
      "JUMEIRAH 2",
      "JUMEIRAH 1",
      "SATWA",
      "DEIRA",
      "DOWNTOWN",
      "JEBEL ALI DOWNTOWN",
      "KITEBEACH",
      "FESTIVAL CITY",
      "DUBAI SOUTH",
      "Remraam",
      "EXPO SITE",
      "D3 DISTRICT",
      "DIFC",
      "NAD AL SHEEBA",
      "MUDON",
      "PORT RASHID",
      "AL BADDA",
      "VILLA NOVA",
      "BURJ AL ARAB",
    ],
  ],
];
export const normalize = (v: string) =>
  v
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const aliasMap: Record<string, string[]> = {
  Remraam: ["REMRAN"],
  JVC: ["Jumeirah Village Circle", "Jumeirah Village Circle (JVC)"],
  JVT: ["Jumeirah Village Triangle", "Jumeirah Village Triangle (JVT)"],
  "JUMEIRAH ISLAND": ["Jumeirah Islands"],
  "IMPZ (D.PRODUCTION CITY)": ["IMPZ", "Dubai Production City"],
  MARINA: ["Dubai Marina"],
  JBR: ["Jumeirah Beach Residence"],
  "Palm Jumeirah - Shoreline": ["Palm Jumeirah Shoreline"],
  "Palm Jumeirah - Golden Mile": ["Golden Mile"],
  "Palm Jumeirah - West Crescent": ["Palm Jumeirah West Crescent"],
  "Palm Jumeirah - East Crescent": ["Palm Jumeirah East Crescent"],
  DIP: ["Dubai Investments Park", "Dubai Investment Park"],
  MOTORCITY: ["Motor City"],
  DOWNTOWN: ["Downtown Dubai"],
};
export const zoneSeed: DeliveryZone[] = bands.flatMap(([min, names]) =>
  names.map((name) => ({
    id: name === "Remraam" ? "remran" : normalize(name).replaceAll(" ", "-"),
    name:
      name === "IMPZ (D.PRODUCTION CITY)"
        ? "IMPZ / Dubai Production City"
        : name.replace(/\b[A-Z][A-Z]+\b/g, (word) =>
            ["JLT", "JVC", "JVT", "JBR", "JAFZA", "DIP", "DIFC", "D3"].includes(
              word,
            )
              ? word
              : word[0]! + word.slice(1).toLowerCase(),
          ),
    aliases: aliasMap[name] ?? [],
    minOrderAed: min,
    deliveryFeeAed: 0,
    freeDelivery: true,
    active: true,
    priority: 10,
    version: 0,
    review: "Approved October 2026: delivery included once minimum reached.",
  })),
);
for (const cluster of ["A", "B", "C", "D"])
  zoneSeed.push({
    id: `jlt-cluster-${cluster.toLowerCase()}`,
    name: `JLT Cluster ${cluster}`,
    aliases: [`Jumeirah Lakes Towers Cluster ${cluster}`],
    minOrderAed: 30,
    deliveryFeeAed: 0,
    freeDelivery: true,
    active: true,
    priority: 20,
    version: 0,
    review:
      "Approved business update: minimum AED 30; no separate delivery charge.",
  });
/** Public area options depend only on confirmed minimums, not obsolete fee metadata. */
export function publicDeliveryAreas(zones: DeliveryZone[]) {
  return zones
    .filter(
      (z) =>
        z.active &&
        z.minOrderAed != null &&
        (!z.deliveryPolicy ||
          deliveryPolicySchema.safeParse(z.deliveryPolicy).success),
    )
    .map((z) => ({
      id: z.id,
      name: z.name,
      // Search labels for the area typeahead; the id remains the only authority.
      aliases: z.aliases,
      minOrderAed: z.deliveryPolicy
        ? z.deliveryPolicy.freeDeliveryThresholdFils / 100
        : z.minOrderAed,
      deliveryFeeAed: z.deliveryPolicy
        ? z.deliveryPolicy.belowThresholdFeeFils / 100
        : 0,
      ...(z.deliveryPolicy ? { deliveryPolicy: z.deliveryPolicy } : {}),
    }));
}
export interface GeoService {
  addressProvider?: import("../adapters/website-address").WebsiteAddressProvider;
  selectionRequired?: boolean;
  resolveAddress?(
    address: string,
    building: string,
    zones: DeliveryZone[],
    addressRef?: string,
  ): { zoneId: string } | null;
  prepare?(location: Location): Promise<void>;
  resolve(
    location: Location,
  ): { address?: string; zoneId?: string; canonicalIds?: string[] } | null;
}
export function contains(point: Location, polygon: Location[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    const cross =
      (point.lng - a.lng) * (b.lat - a.lat) -
      (point.lat - a.lat) * (b.lng - a.lng);
    if (
      Math.abs(cross) < 1e-10 &&
      point.lng >= Math.min(a.lng, b.lng) &&
      point.lng <= Math.max(a.lng, b.lng) &&
      point.lat >= Math.min(a.lat, b.lat) &&
      point.lat <= Math.max(a.lat, b.lat)
    )
      return true;
    if (
      a.lat > point.lat !== b.lat > point.lat &&
      point.lng <
        ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng
    )
      inside = !inside;
  }
  return inside;
}
export function matchZone(
  zones: DeliveryZone[],
  address?: string,
  location?: Location,
  geo: GeoService = { resolve: () => null },
): DeliveryZone | null {
  const active = zones.filter((z) => z.active);
  let candidates: DeliveryZone[] = [];
  if (location) {
    candidates = active.filter(
      (z) => z.polygon && contains(location, z.polygon),
    );
    if (!candidates.length) {
      const resolved = geo.resolve(location);
      if (resolved?.zoneId)
        candidates = active.filter((z) => z.id === resolved.zoneId);
      else if (
        resolved?.canonicalIds?.some((id) =>
          active.some((z) => z.canonicalIds?.includes(id)),
        )
      )
        candidates = active.filter((z) =>
          z.canonicalIds?.some((id) => resolved.canonicalIds?.includes(id)),
        );
      else if (resolved?.address)
        return matchZone(zones, resolved.address, undefined, geo);
    }
  }
  // GPS authoritative: an unknown GPS is not silently overridden by an address.
  else if (address) {
    const needle = normalize(address);
    const matches = active
      .flatMap((zone) =>
        [zone.name, ...zone.aliases].map((alias) => ({
          zone,
          key: normalize(alias),
        })),
      )
      .filter((x) => ` ${needle} `.includes(` ${x.key} `));
    // Discard a parent name only when it is contained in a more specific match.
    // Separate locality names in one address remain ambiguous rather than guessing.
    const specific = matches.filter(
      (m) =>
        !matches.some(
          (other) =>
            other.key.length > m.key.length &&
            ` ${other.key} `.includes(` ${m.key} `),
        ),
    );
    candidates = [...new Set(specific.map((m) => m.zone))];
  }
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates.length > 1 &&
    candidates[0]!.priority === candidates[1]!.priority
    ? null
    : (candidates[0] ?? null);
}
export function quoteOrder(
  zones: DeliveryZone[],
  lines: Line[],
  address?: string,
  location?: Location,
  geo?: GeoService,
  manualZoneId?: string,
  products: CatalogItem[] = catalog,
  fulfillmentMethod: "delivery" | "pickup" = "delivery",
): Quote {
  const validProducts =
    lines.length > 0 &&
    lines.every(
      (l) =>
        Number.isSafeInteger(l.quantity) &&
        l.quantity > 0 &&
        products.some(
          (p) =>
            p.id === l.productId &&
            p.active !== false &&
            p.availability !== "unavailable",
        ),
    );
  const subtotalFils = lines.reduce(
    (sum, l) => sum + liveLinePrice(l, products) * l.quantity,
    0,
  );
  if (fulfillmentMethod === "pickup")
    return {
      zoneId: null,
      zoneName: null,
      minOrderAed: null,
      feeFils: 0,
      subtotalFils,
      totalFils: subtotalFils,
      minimumMet: true,
      eligible: validProducts && subtotalFils > 0,
      reason:
        validProducts && subtotalFils > 0
          ? "Ready for pickup checkout"
          : "Add available products",
      resolutionCode: "RESOLVED",
      zoneVersion: null,
      deliveryRule: {
        mode: "pickup",
        freeDeliveryThresholdFils: null,
        belowThresholdFeeFils: 0,
      },
    };
  const zone = manualZoneId
    ? zones.find((z) => z.id === manualZoneId && z.active)
    : matchZone(zones, address, location, geo);
  const parsedPolicy = zone?.deliveryPolicy
    ? deliveryPolicySchema.safeParse(zone.deliveryPolicy)
    : null;
  const policy = parsedPolicy?.success ? parsedPolicy.data : undefined;
  const policyValid = parsedPolicy === null || parsedPolicy.success;
  const thresholdFils =
    policy?.freeDeliveryThresholdFils ??
    (zone?.minOrderAed == null ? null : Math.round(zone.minOrderAed * 100));
  const minimumMet = thresholdFils != null && subtotalFils >= thresholdFils;
  const feeFils =
    policy && !minimumMet && subtotalFils > 0
      ? policy.belowThresholdFeeFils
      : 0;
  const reason = !validProducts
    ? "Producto no disponible en el catálogo aprobado"
    : !zone
      ? "Fuera de cobertura o ubicación ambigua"
      : !policyValid || thresholdFils == null
        ? "Regla pendiente de revisión"
        : !minimumMet && !policy
          ? `Minimum order for ${zone.name} is AED ${zone.minOrderAed}.`
          : !subtotalFils
            ? "Agrega productos"
            : "Listo para solicitar pago";
  return {
    resolutionCode: zone ? "RESOLVED" : "ZONE_REVIEW_REQUIRED",
    zoneId: zone?.id ?? null,
    zoneName: zone?.name ?? null,
    minOrderAed: thresholdFils == null ? null : thresholdFils / 100,
    feeFils,
    subtotalFils,
    totalFils: subtotalFils + feeFils,
    minimumMet,
    eligible:
      validProducts &&
      !!zone &&
      policyValid &&
      thresholdFils != null &&
      (minimumMet || !!policy) &&
      Number.isSafeInteger(subtotalFils) &&
      Number.isSafeInteger(subtotalFils + feeFils) &&
      subtotalFils > 0,
    reason,
    zoneVersion: zone?.version ?? null,
    deliveryRule: {
      mode: policy ? "flexible" : "minimum",
      freeDeliveryThresholdFils: thresholdFils,
      belowThresholdFeeFils: policy?.belowThresholdFeeFils ?? 0,
    },
  };
}
