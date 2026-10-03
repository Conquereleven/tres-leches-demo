import type { DeliveryZone } from "./model";

/** Exact normalized structured community labels; never fuzzy/full-address matching. */
export const normalizeAreaName = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export function canonicalAreaName(value: string): string {
  const name = normalizeAreaName(value);
  return ["jlt", "jumeirah lakes towers", "jumeirah lakes towers jlt"].includes(
    name,
  )
    ? "jlt"
    : name;
}

/** A generic JLT label is insufficient: require an approved cluster, not a guess.
 * Aliases live alongside canonical zone names in configurable zone records.
 * Any collision between active records blocks resolution regardless of priority. */
export function resolveVerifiedCommunity(
  zones: DeliveryZone[],
  community: string,
  cluster?: string,
): DeliveryZone | null {
  let key = canonicalAreaName(community);
  if (key === "jlt") {
    if (!cluster) return null;
    const normalized = normalizeAreaName(cluster);
    const match = /^(?:jlt )?(?:cluster )?([a-z])$/.exec(normalized);
    if (!match) return null;
    key = `jlt cluster ${match[1]}`;
  } else if (cluster) return null;
  const matches = zones.filter(
    (zone) =>
      zone.active &&
      [zone.name, ...zone.aliases].some(
        (label) => normalizeAreaName(label) === key,
      ),
  );
  return matches.length === 1 ? matches[0]! : null;
}
