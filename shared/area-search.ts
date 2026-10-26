/**
 * Delivery-area typeahead. Text is only ever used to SUGGEST approved areas;
 * checkout, minimums and pricing use the chosen area's canonical id, and the
 * server re-validates that id. Nothing here can make an unapproved area valid.
 */
export type SearchableArea = { id: string; name: string; aliases?: string[] };
export const normalizeAreaQuery = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
/**
 * Everyday names customers type that are not the approved label or one of its
 * recorded aliases. Search hints only: each maps to an existing area name.
 */
const SEARCH_HINTS: Record<string, string[]> = {
  jlt: ["jumeirah lakes towers", "jumeirah lake towers"],
};
// Spelling hints only, scoped to an already configured matching name/alias.
// These never add a zone, establish coverage, or count as an exact selection.
const BLUEWATERS_LABELS = [
  "bluewaters",
  "bluewaters island",
  "blue waters",
  "blue waters island",
];
function distance(a: string, b: string, limit: number) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        previous[j]! + 1,
        row[j - 1]! + 1,
        previous[j - 1]! + cost,
      );
      // Adjacent transposition ("Mraina") counts as one slip, not two.
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1] &&
        value > previous[j - 1]!
      )
        value = Math.min(value, previous[j - 1]!);
      row.push(value);
      best = Math.min(best, value);
    }
    if (best > limit) return limit + 1;
    previous = row;
  }
  return previous[b.length]!;
}
/** Lower is better; null means the label does not match the query at all. */
function score(query: string, label: string): number | null {
  if (label === query) return 0;
  if (label.startsWith(query)) return 1;
  const words = label.split(" ");
  if (words.some((word) => word.startsWith(query))) return 2;
  if (query.length >= 3 && label.includes(query)) return 3;
  const parts = query.split(" ");
  // Every typed word begins some word of the label ("jum isl" → Jumeirah Island).
  if (
    parts.length > 1 &&
    parts.every((part) => words.some((word) => word.startsWith(part)))
  )
    return 3;
  if (query.length < 4) return null;
  // Reasonable misspellings: one slip per four letters, at most two.
  const limit = Math.min(2, Math.floor(query.length / 4));
  const candidates = [label, ...words, label.slice(0, query.length)];
  const fuzzy = Math.min(
    ...candidates.map((candidate) => distance(query, candidate, limit)),
  );
  return fuzzy <= limit ? 4 + fuzzy : null;
}
export type AreaMatch<T extends SearchableArea> = {
  area: T;
  /** True when the text is exactly this area's name or one of its aliases. */
  exact: boolean;
};
export function searchAreas<T extends SearchableArea>(
  areas: readonly T[],
  text: string,
  limit = 8,
): AreaMatch<T>[] {
  const query = normalizeAreaQuery(text);
  if (!query) return [];
  const ranked: { area: T; rank: number; exact: boolean }[] = [];
  for (const area of areas) {
    const name = normalizeAreaQuery(area.name);
    const aliasCount = area.aliases?.length ?? 0;
    const labels = [
      name,
      ...(area.aliases ?? []).map(normalizeAreaQuery),
      ...Object.entries(SEARCH_HINTS).flatMap(([key, hints]) =>
        name.split(" ").includes(key) ? hints : [],
      ),
      ...([area.name, ...(area.aliases ?? [])].some((label) =>
        BLUEWATERS_LABELS.includes(normalizeAreaQuery(label)),
      )
        ? BLUEWATERS_LABELS
        : []),
    ];
    let best: number | null = null;
    labels.forEach((label, index) => {
      const value = score(query, label);
      if (value === null) return;
      // The approved name outranks an alias, which outranks a search hint.
      const rank = value + (index === 0 ? 0 : index <= aliasCount ? 0.3 : 0.6);
      if (best === null || rank < best) best = rank;
    });
    if (best !== null)
      ranked.push({
        area,
        rank: best,
        exact: labels.slice(0, 1 + aliasCount).includes(query),
      });
  }
  return ranked
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.area.name.localeCompare(b.area.name, "en", { numeric: true }),
    )
    .slice(0, limit)
    .map(({ area, exact }) => ({ area, exact }));
}
/** The single area the text names exactly, if there is exactly one. */
export function exactArea<T extends SearchableArea>(
  areas: readonly T[],
  text: string,
): T | null {
  const exact = searchAreas(areas, text, areas.length).filter((m) => m.exact);
  return exact.length === 1 ? exact[0]!.area : null;
}
