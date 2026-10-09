import { createHash } from "node:crypto";
import type { Location } from "../domain/model";
export type VerifiedAddressRecord = {
  address: string;
  building: string;
  location: Location;
  community?: string;
  cluster?: string;
  searchable: boolean;
};
export type AddressSuggestion = { id: string; label: string };
/** Suggestions are not verification. Retrieval must return trusted server-owned
 * coordinates/components; adapters must never accept browser location/area data.
 * Future network adapters prepare durable verified records before checkout transactions. */
export interface WebsiteAddressProvider {
  suggest(query: string): Promise<AddressSuggestion[]>;
  retrieve(id: string): VerifiedAddressRecord | null;
}
const normalized = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export class RegistryAddressProvider implements WebsiteAddressProvider {
  private records: Map<string, VerifiedAddressRecord>;
  constructor(entries: VerifiedAddressRecord[]) {
    this.records = new Map(
      entries.map((entry) => [
        createHash("sha256").update(JSON.stringify(entry)).digest("hex"),
        entry,
      ]),
    );
  }
  async suggest(query: string) {
    const key = normalized(query);
    if (key.length < 3) return [];
    return [...this.records]
      .filter(
        ([, entry]) =>
          entry.searchable &&
          normalized(`${entry.address} ${entry.building}`).includes(key),
      )
      .slice(0, 5)
      .map(([id, entry]) => ({
        id,
        label: `${entry.address} · ${entry.building}`,
      }));
  }
  retrieve(id: string) {
    return this.records.get(id) ?? null;
  }
}
