import { createHash, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Store } from "../db/store";
import { deliveryPolicySchema, type DeliveryZone } from "./model";

/** Founder-approved tariffs. This is rollout data, never neighborhood logic. */
export const approvedDeliveryFeesFils: Readonly<Record<number, number>> = {
  30: 1500,
  50: 1500,
  100: 1500,
  150: 2000,
  200: 2000,
  250: 2500,
  300: 2500,
};
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function planFlexibleDelivery(zones: DeliveryZone[]) {
  const errors: string[] = [];
  const ids = new Set<string>();
  const changes: {
    id: string;
    name: string;
    version: number;
    before: DeliveryZone["deliveryPolicy"];
    after: NonNullable<DeliveryZone["deliveryPolicy"]>;
  }[] = [];
  for (const zone of zones) {
    if (ids.has(zone.id)) errors.push(`Duplicate zone: ${zone.id}`);
    ids.add(zone.id);
    if (!zone.active) continue;
    if (zone.deliveryPolicy) {
      if (!deliveryPolicySchema.safeParse(zone.deliveryPolicy).success)
        errors.push(`Invalid existing policy: ${zone.id}`);
      // Explicit per-zone overrides are authoritative; repeated rollout never overwrites them.
      continue;
    }
    const fee =
      zone.minOrderAed == null
        ? undefined
        : approvedDeliveryFeesFils[zone.minOrderAed];
    if (
      fee === undefined ||
      zone.deliveryFeeAed !== 0 ||
      !zone.freeDelivery ||
      !Number.isSafeInteger(zone.version)
    ) {
      errors.push(`Unreviewed threshold or legacy fee: ${zone.id}`);
      continue;
    }
    changes.push({
      id: zone.id,
      name: zone.name,
      version: zone.version,
      before: zone.deliveryPolicy,
      after: {
        mode: "flexible",
        freeDeliveryThresholdFils: zone.minOrderAed! * 100,
        belowThresholdFeeFils: fee,
      },
    });
  }
  return {
    valid: errors.length === 0,
    digest: hash(zones),
    count: changes.length,
    changes,
    errors,
  };
}

/** Backup must finish before any policy mutation; the entire zone set is guarded. */
export async function applyFlexibleDelivery(
  store: Store,
  backupDir: string,
  expectedDigest: string,
) {
  const plan = planFlexibleDelivery(store.read().zones);
  if (!plan.valid || plan.digest !== expectedDigest)
    throw new Error("Delivery plan invalid or changed; rerun dry-run");
  if (!plan.count) return { updated: 0, backupPath: null, digest: plan.digest };
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const backupPath = join(
    backupDir,
    `before-flexible-delivery-${randomUUID()}.sqlite`,
  );
  await store.backup(backupPath);
  chmodSync(backupPath, 0o600);
  store.write((state) => {
    if (hash(state.zones) !== expectedDigest)
      throw new Error("Concurrent zone edit; no policies applied");
    for (const change of plan.changes) {
      const zone = state.zones.find((z) => z.id === change.id)!;
      zone.deliveryPolicy = change.after;
      zone.version++;
    }
  });
  return { updated: plan.count, backupPath, digest: hash(store.read().zones) };
}
