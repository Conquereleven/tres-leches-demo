import {
  packSpec,
  normalizeComposition,
  type CommerceLine,
} from "./pack-composition";
export type PackPricingPolicy = {
  version: "pan-premium-v1";
  charges: Record<string, number>;
};
export type PackPriceSnapshot = {
  version: 1;
  policy: "pan-premium-v1";
  baseFils: number;
  premiums: { componentSkuId: string; units: number; unitFils: number }[];
  unitPriceFils: number;
};
const money = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
export function premiumComponent(id: string) {
  return (
    id.endsWith("-chocolate-covering") ||
    /^pan-de-muerto-filled-pistachio-(mini|individual)$/.test(id)
  );
}
/** Identical arithmetic for display and server quotes; the server supplies policy and prices. */
export function calculatePackPrice(
  line: CommerceLine,
  baseFils: number,
  policy: PackPricingPolicy,
): PackPriceSnapshot {
  const spec = packSpec(line.productId);
  if (!spec || !line.composition || !money(baseFils))
    throw new Error("Pack pricing unavailable");
  const premiums = normalizeComposition(line.composition)
    .filter((c) => premiumComponent(c.componentSkuId))
    .map((c) => {
      const rate = policy.charges[c.componentSkuId];
      if (
        !money(rate) ||
        !rate ||
        !Number.isSafeInteger(c.units) ||
        c.units <= 0 ||
        !spec.components.some((x) => x.componentSkuId === c.componentSkuId)
      )
        throw new Error("Premium price unavailable; review required");
      return { ...c, unitFils: rate };
    });
  const unitPriceFils =
    baseFils + premiums.reduce((n, c) => n + c.units * c.unitFils, 0);
  if (!money(unitPriceFils)) throw new Error("Pack price invalid");
  return {
    version: 1,
    policy: policy.version,
    baseFils,
    premiums,
    unitPriceFils,
  };
}
/** Frozen financial facts never depend on current flags, prices or eligibility. */
export function acceptedLinePrice(
  line: CommerceLine & { priceSnapshot?: PackPriceSnapshot },
  baseFils: number,
): number | null {
  if (line.priceSnapshot === undefined)
    return money(baseFils) ? baseFils : null;
  if (!line.priceSnapshot) return null;
  const s = line.priceSnapshot;
  if (
    s.version !== 1 ||
    s.policy !== "pan-premium-v1" ||
    s.baseFils !== baseFils ||
    !money(s.unitPriceFils) ||
    !Array.isArray(s.premiums) ||
    !line.composition ||
    !packSpec(line.productId)
  )
    return null;
  try {
    if (
      new Set(s.premiums.map((p) => p.componentSkuId)).size !==
      s.premiums.length
    )
      return null;
    const expected = calculatePackPrice(line, baseFils, {
      version: s.policy,
      charges: Object.fromEntries(
        s.premiums.map((c) => [c.componentSkuId, c.unitFils]),
      ),
    });
    return JSON.stringify(expected) === JSON.stringify(s)
      ? s.unitPriceFils
      : null;
  } catch {
    return null;
  }
}
