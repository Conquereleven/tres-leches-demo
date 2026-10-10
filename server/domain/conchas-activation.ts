import type { CatalogItem } from "./model";

/** Approved 10 October 2026: six existing traditional Conchas SKUs, no new identities. */
export const CONCHAS_TO_ACTIVATE: Readonly<Record<string, { priceFils: number; name: string }>> = {
  "conchas-traditional-vainilla-mini-40-g": { priceFils: 1100, name: "Conchas tradicional · Vainilla · Mini · 40 g" },
  "conchas-traditional-vainilla-individual-70-g": { priceFils: 1300, name: "Conchas tradicional · Vainilla · Individual · 70 g" },
  "conchas-traditional-pistache-mini-40-g": { priceFils: 1100, name: "Conchas tradicional · Pistache · Mini · 40 g" },
  "conchas-traditional-pistache-individual-70-g": { priceFils: 1300, name: "Conchas tradicional · Pistache · Individual · 70 g" },
  "conchas-traditional-tricolor-mini-40-g": { priceFils: 1100, name: "Conchas tradicional · Tricolor · Mini · 40 g" },
  "conchas-traditional-tricolor-individual-70-g": { priceFils: 1300, name: "Conchas tradicional · Tricolor · Individual · 70 g" },
};

export function planConchasActivation(catalog: CatalogItem[]) {
  const change: string[] = [], current: string[] = [], blocked: { id: string; reason: string }[] = [];
  for (const [id, expected] of Object.entries(CONCHAS_TO_ACTIVATE)) {
    const found = catalog.filter(item => item.id === id);
    if (found.length !== 1) { blocked.push({ id, reason: `found ${found.length} records` }); continue; }
    const item = found[0]!;
    if (item.priceFils !== expected.priceFils || item.name !== expected.name || item.category !== "Conchas") {
      blocked.push({ id, reason: "unexpected name, category or price" }); continue;
    }
    if (item.active === true && item.availability === "available") current.push(id);
    else if (item.active === false && item.availability === "unavailable") change.push(id);
    else blocked.push({ id, reason: "unexpected active/availability combination" });
  }
  return { change, current, blocked, safeToApply: blocked.length === 0 };
}

export function applyConchasActivation(catalog: CatalogItem[]): CatalogItem[] {
  const plan = planConchasActivation(catalog);
  if (!plan.safeToApply) throw new Error("Conchas activation blocked");
  const targets = new Set(plan.change);
  return catalog.map(item => targets.has(item.id) ? { ...item, active: true, availability: "available" } : item);
}
