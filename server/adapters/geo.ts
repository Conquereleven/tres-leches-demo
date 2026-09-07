import { z } from "zod";
import type { Location } from "../domain/model";
import type { GeoService } from "../domain/zones";
const resultSchema = z
  .object({
    address: z.string().min(1).max(500).optional(),
    zoneId: z.string().min(1).max(100).optional(),
  })
  .strict()
  .nullable();
export type GeocodingResult = z.infer<typeof resultSchema>;
/** Google/Mapbox adapters normalize their wire format here and respect the abort signal. */
export interface GeocodingProvider {
  lookup(point: Location, signal: AbortSignal): Promise<GeocodingResult>;
}
/** Network work is prepared outside SQLite transactions; matching itself stays pure. */
export class GeocodingAdapter implements GeoService {
  private cache = new Map<
    string,
    { expires: number; result: GeocodingResult }
  >();
  constructor(
    private provider: GeocodingProvider,
    private ttlMs = 300000,
  ) {}
  private key(p: Location) {
    return `${p.lat}:${p.lng}`;
  }
  async prepare(p: Location) {
    const key = this.key(p),
      existing = this.cache.get(key);
    if (existing && existing.expires > Date.now()) return;
    const result = resultSchema.parse(
      await this.provider.lookup(p, AbortSignal.timeout(10000)),
    );
    if (this.cache.size >= 1000)
      this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { expires: Date.now() + this.ttlMs, result });
  }
  resolve(p: Location) {
    const value = this.cache.get(this.key(p));
    return value && value.expires > Date.now() ? value.result : null;
  }
}
