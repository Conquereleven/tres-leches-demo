import {
  packSpec,
  personalizedPackEnabled,
  normalizeComposition,
  componentName,
  distinctLines,
  type PackEligibility,
} from "../../shared/pack-composition";
import { validateFoundation } from "../catalog/contract";
import { requireThat, type State, type Line } from "./model";
export const packBuilderEnabled = (env = process.env) =>
  env.PERSONALIZED_PACKS_ENABLED === "true";
export const conchasPackBuilderEnabled = (env = process.env) =>
  env.PERSONALIZED_CONCHAS_PACKS_ENABLED === "true";
export const anyPackBuilderEnabled = (env = process.env) =>
  packBuilderEnabled(env) || conchasPackBuilderEnabled(env);
export const packEnabledForSku = (sku: string, env = process.env) =>
  personalizedPackEnabled(sku, {
    enabled: packBuilderEnabled(env),
    conchasEnabled: conchasPackBuilderEnabled(env),
  });
/** Published Foundation only. Absence means no component has been commercially approved. */
export function publishedPackRules(s: State): PackEligibility {
  if (!s.catalogFoundation) return [];
  return (
    validateFoundation(s.catalogFoundation, s.catalog ?? []).packEligibility ??
    []
  );
}
/** Inactive-family publication must not change an active family's quote token. */
export function activePackRules(s: State, env = process.env): PackEligibility {
  return publishedPackRules(s)
    .filter((r) => packEnabledForSku(r.packSkuId, env))
    .map((r) => ({ ...r, componentSkuIds: [...r.componentSkuIds].sort() }))
    .sort((a, b) => a.packSkuId.localeCompare(b.packSkuId, "en"));
}
export function validatePackLines(s: State, lines: Line[], env = process.env) {
  requireThat(
    distinctLines(lines),
    "Duplicate composition or maximum box quantity exceeded",
    422,
  );
  const rules = anyPackBuilderEnabled(env) ? publishedPackRules(s) : [];
  for (const line of lines) {
    const spec = packSpec(line.productId);
    if (spec && !packEnabledForSku(line.productId, env)) {
      requireThat(!line.composition, "Personalized packs are not enabled", 422);
      continue;
    }
    if (!spec) {
      requireThat(
        !line.composition,
        "This product cannot contain pack components",
        422,
      );
      continue;
    }
    requireThat(
      line.composition?.length,
      "Choose all pack flavors before continuing",
      422,
    );
    const allowed =
      rules.find((r) => r.packSkuId === line.productId)?.componentSkuIds ?? [];
    requireThat(
      line.composition.every(
        (c) =>
          Number.isSafeInteger(c.units) &&
          c.units > 0 &&
          allowed.includes(c.componentSkuId) &&
          spec.components.some((x) => x.componentSkuId === c.componentSkuId) &&
          s.catalog?.some((p) => p.id === c.componentSkuId),
      ),
      "Pack flavor unavailable; review your selection",
      422,
    );
    requireThat(
      new Set(line.composition.map((c) => c.componentSkuId)).size ===
        line.composition.length &&
        line.composition.reduce((n, c) => n + c.units, 0) === spec.capacity,
      "Pack composition must equal its capacity",
      422,
    );
  }
}
export function snapshotPackLines(s: State, lines: Line[]): Line[] {
  validatePackLines(s, lines);
  return lines.map((line) =>
    !line.composition
      ? { ...line }
      : {
          ...line,
          composition: normalizeComposition(line.composition),
          packSnapshot: {
            version: 1,
            revision: s.catalogFoundation!.revision.id,
            capacity: packSpec(line.productId)!.capacity,
            components: normalizeComposition(line.composition).map((c) => ({
              ...c,
              name: componentName(c.componentSkuId, "en"),
              names: {
                en: componentName(c.componentSkuId, "en"),
                es: componentName(c.componentSkuId, "es"),
                ar: componentName(c.componentSkuId, "ar"),
              },
            })),
          },
        },
  );
}
