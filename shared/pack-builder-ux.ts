import { normalizeComposition, type Composition } from "./pack-composition";
/** Explicit customer action only. Preserve other flavors, never add pieces beyond capacity. */
export function fillPackRemaining(
  value: Composition,
  componentSkuId: string,
  capacity: number,
  allowed: readonly string[],
): Composition {
  const selected = value.reduce((n, c) => n + c.units, 0);
  if (
    !allowed.includes(componentSkuId) ||
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    selected >= capacity ||
    value.some((c) => !Number.isInteger(c.units) || c.units < 0) ||
    new Set(value.map((c) => c.componentSkuId)).size !== value.length
  )
    return value;
  const current =
    value.find((c) => c.componentSkuId === componentSkuId)?.units ?? 0;
  return normalizeComposition([
    ...value.filter((c) => c.componentSkuId !== componentSkuId),
    { componentSkuId, units: current + capacity - selected },
  ]);
}
