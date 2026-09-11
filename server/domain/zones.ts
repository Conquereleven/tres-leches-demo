import {
  type DeliveryZone,
  type Location,
  type Quote,
  type Line,
  catalog,
} from "./model";
// Transcribed from the supplied “MINIMUM ORDER FOR DELIVERY” image. Unknown fees stay null.
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
      "PALM JUMEIRAH (SHORELINE, GOLDEN MILE)",
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
      "PALM JUMEIRAH (WEST & EAST CRESCENT)",
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
      "REMRAN",
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
  JVC: ["Jumeirah Village Circle"],
  JVT: ["Jumeirah Village Triangle"],
  "JUMEIRAH ISLAND": ["Jumeirah Islands"],
  "IMPZ (D.PRODUCTION CITY)": ["IMPZ", "Dubai Production City"],
  MARINA: ["Dubai Marina"],
  JBR: ["Jumeirah Beach Residence"],
  "PALM JUMEIRAH (SHORELINE, GOLDEN MILE)": [
    "Palm Jumeirah Shoreline",
    "Golden Mile",
  ],
  "PALM JUMEIRAH (WEST & EAST CRESCENT)": [
    "Palm Jumeirah West Crescent",
    "Palm Jumeirah East Crescent",
  ],
  MOTORCITY: ["Motor City"],
};
export const zoneSeed: DeliveryZone[] = bands.flatMap(([min, names]) =>
  names.map((name) => ({
    id: normalize(name).replaceAll(" ", "-"),
    name,
    aliases: aliasMap[name] ?? [],
    minOrderAed: min,
    deliveryFeeAed: null,
    freeDelivery: false,
    active: true,
    priority: 10,
    version: 0,
    review:
      name === "REMRAN"
        ? "Source spells REMRAN; confirm intended locality."
        : "Delivery fee not supplied; admin confirmation required.",
  })),
);
for (const cluster of ["B", "C", "D"])
  zoneSeed.push({
    id: `jlt-cluster-${cluster.toLowerCase()}`,
    name: `JLT Cluster ${cluster}`,
    aliases: [],
    minOrderAed: null,
    deliveryFeeAed: 0,
    freeDelivery: true,
    active: true,
    priority: 20,
    version: 0,
    review:
      "FREE DELIVERY is explicit; confirm whether the 30 AED column minimum also applies to B/C/D.",
  });
export interface GeoService {
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
): Quote {
  const subtotalFils = lines.reduce(
    (sum, l) =>
      sum + catalog.find((p) => p.id === l.productId)!.priceFils * l.quantity,
    0,
  );
  const zone = manualZoneId
    ? zones.find((z) => z.id === manualZoneId && z.active)
    : matchZone(zones, address, location, geo);
  const feeFils =
    zone?.deliveryFeeAed == null ? null : Math.round(zone.deliveryFeeAed * 100);
  const minimumMet =
    zone?.minOrderAed != null &&
    subtotalFils >= Math.round(zone.minOrderAed * 100);
  const reason = !zone
    ? "Fuera de cobertura o ubicación ambigua"
    : zone.minOrderAed == null || feeFils == null
      ? "Regla pendiente de revisión"
      : !minimumMet
        ? "No cumple el mínimo"
        : !subtotalFils
          ? "Agrega productos"
          : "Listo para solicitar pago";
  return {
    resolutionCode: zone ? "RESOLVED" : "ZONE_REVIEW_REQUIRED",
    zoneId: zone?.id ?? null,
    zoneName: zone?.name ?? null,
    minOrderAed: zone?.minOrderAed ?? null,
    feeFils,
    subtotalFils,
    totalFils: feeFils === null ? null : subtotalFils + feeFils,
    minimumMet,
    eligible: !!zone && minimumMet && feeFils !== null && subtotalFils > 0,
    reason,
    zoneVersion: zone?.version ?? null,
  };
}
