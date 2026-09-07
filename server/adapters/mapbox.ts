import { z } from "zod";
import { locationSchema, type Location } from "../domain/model";
import type { GeocodingProvider, GeocodingResult } from "./geo";
const feature = z.object({
  properties: z.object({
    name: z.string(),
    mapbox_id: z.string(),
    feature_type: z.string(),
    context: z
      .record(
        z.string(),
        z
          .object({ name: z.string(), mapbox_id: z.string().optional() })
          .passthrough(),
      )
      .optional(),
  }),
});
/** Permanent geocoding must be enabled on the merchant's Mapbox account before use. */
export class MapboxGeoProvider implements GeocodingProvider {
  constructor(
    private token: string,
    private fetcher: typeof fetch = fetch,
  ) {
    if (!token) throw new Error("Mapbox token required");
  }
  async lookup(point: Location, signal: AbortSignal): Promise<GeocodingResult> {
    locationSchema.parse(point);
    const query = new URLSearchParams({
      longitude: String(point.lng),
      latitude: String(point.lat),
      country: "AE",
      language: "en",
      permanent: "true",
      access_token: this.token,
    });
    const response = await this.fetcher(
      `https://api.mapbox.com/search/geocode/v6/reverse?${query}`,
      { signal, redirect: "error" },
    );
    if (!response.ok) throw new Error("Geocoder unavailable");
    const data = z
      .object({ features: z.array(feature) })
      .parse(await response.json());
    // Only granular locality evidence. Never infer a Dubai delivery zone from a city/country match.
    const parts = data.features.flatMap((f) => [
      ...(["neighborhood", "locality", "address", "street"].includes(
        f.properties.feature_type,
      )
        ? [{ name: f.properties.name, id: f.properties.mapbox_id }]
        : []),
      ...Object.entries(f.properties.context ?? {})
        .filter(([k]) => ["neighborhood", "locality"].includes(k))
        .map(([, v]) => ({ name: v.name, id: v.mapbox_id })),
    ]);
    if (!parts.length) return null;
    return {
      address: [...new Set(parts.map((p) => p.name))].join(", ").slice(0, 500),
      canonicalIds: [
        ...new Set(parts.flatMap((p) => (p.id ? [`mapbox:${p.id}`] : []))),
      ],
    };
  }
}
