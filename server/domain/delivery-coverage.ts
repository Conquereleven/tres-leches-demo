import { readFileSync, statSync } from "node:fs";
import { z } from "zod";
import type { Location } from "./model";
import { contains } from "./zones";
import approvedCoverage from "../data/delivery/approved-coverage.json";
const position = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);
type Position = [number, number];
const cross = (a: Position, b: Position, c: Position) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function onSegment(a: Position, b: Position, p: Position) {
  return (
    Math.abs(cross(a, b, p)) < 1e-12 &&
    p[0] >= Math.min(a[0], b[0]) &&
    p[0] <= Math.max(a[0], b[0]) &&
    p[1] >= Math.min(a[1], b[1]) &&
    p[1] <= Math.max(a[1], b[1])
  );
}
function intersects(a: Position, b: Position, c: Position, d: Position) {
  return (
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b) ||
    (cross(a, b, c) > 0 !== cross(a, b, d) > 0 &&
      cross(c, d, a) > 0 !== cross(c, d, b) > 0)
  );
}
function simpleRing(r: Position[]) {
  for (let i = 0; i < r.length - 1; i++) {
    if (r[i]![0] === r[i + 1]![0] && r[i]![1] === r[i + 1]![1]) return false;
    for (let j = i + 2; j < r.length - 1; j++) {
      if (i === 0 && j === r.length - 2) continue;
      if (intersects(r[i]!, r[i + 1]!, r[j]!, r[j + 1]!)) return false;
    }
  }
  return true;
}
const inRing = (p: Position, r: Position[]) =>
  contains(
    { lng: p[0], lat: p[1] },
    r.map(([lng, lat]) => ({ lng, lat })),
  );
function ringsCross(a: Position[], b: Position[]) {
  return a
    .slice(1)
    .some((_, i) =>
      b
        .slice(1)
        .some((__, j) => intersects(a[i]!, a[i + 1]!, b[j]!, b[j + 1]!)),
    );
}
const ring = z
  .array(position)
  .min(4)
  .max(1000)
  .refine((r) => {
    if (r.length < 4) return false;
    const first = r[0]!,
      last = r.at(-1)!;
    if (first[0] !== last[0] || first[1] !== last[1]) return false;
    const area = r
      .slice(1)
      .reduce((sum, p, i) => sum + r[i]![0] * p[1] - p[0] * r[i]![1], 0);
    return (
      Math.abs(area) > 1e-12 &&
      simpleRing(r) &&
      Math.max(...r.map((p) => p[0])) - Math.min(...r.map((p) => p[0])) < 180
    );
  }, "Closed, non-degenerate local geographic ring required");
const polygon = z
  .array(ring)
  .min(1)
  .max(20)
  .refine((rings) => {
    const exterior = rings[0]!;
    return rings
      .slice(1)
      .every(
        (hole, i) =>
          inRing(hole[0]!, exterior) &&
          !ringsCross(hole, exterior) &&
          rings
            .slice(1, i + 1)
            .every(
              (other) =>
                !ringsCross(hole, other) &&
                !inRing(hole[0]!, other) &&
                !inRing(other[0]!, hole),
            ),
      );
  }, "Holes must be strictly inside the exterior and may not overlap or touch");
const geometry = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Polygon"), coordinates: polygon }).strict(),
  z
    .object({
      type: z.literal("MultiPolygon"),
      coordinates: z.array(polygon).min(1).max(20),
    })
    .strict(),
]);
const feature = z
  .object({
    type: z.literal("Feature"),
    properties: z
      .object({
        role: z.enum(["primary", "exclusion"]),
        id: z.string().min(1).max(100),
      })
      .strict(),
    geometry,
  })
  .strict();
export const deliveryCoverageSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z.array(feature).min(1).max(50),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.features.filter((f) => f.properties.role === "primary").length !== 1
    )
      ctx.addIssue({
        code: "custom",
        message: "Exactly one primary coverage feature required",
      });
    if (
      new Set(data.features.map((f) => f.properties.id)).size !==
      data.features.length
    )
      ctx.addIssue({ code: "custom", message: "Coverage IDs must be unique" });
  });
export type DeliveryCoverage = z.infer<typeof deliveryCoverageSchema>;
/** Approved outer boundary is bundled; a reviewed private file can override it. */
export function loadDeliveryCoverage(file?: string): DeliveryCoverage | null {
  if (!file) return deliveryCoverageSchema.parse(approvedCoverage);
  if (statSync(file).size > 1024 * 1024)
    throw new Error("Coverage file exceeds 1 MiB");
  return deliveryCoverageSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}
function within(point: Location, shape: z.infer<typeof geometry>): boolean {
  const polygons =
    shape.type === "Polygon" ? [shape.coordinates] : shape.coordinates;
  return polygons.some((rings) => {
    const match = (r: z.infer<typeof ring>) =>
      contains(
        point,
        r.map(([lng, lat]) => ({ lat, lng })),
      );
    return match(rings[0]!) && !rings.slice(1).some(match);
  });
}
export function checkDeliveryCoverage(
  point: Location,
  coverage: DeliveryCoverage | null,
) {
  if (!coverage) return { eligible: false, code: "NOT_CONFIGURED" as const };
  const primary = coverage.features.find(
    (f) => f.properties.role === "primary",
  )!;
  if (!within(point, primary.geometry))
    return { eligible: false, code: "OUTSIDE_PRIMARY" as const };
  if (
    coverage.features.some(
      (f) => f.properties.role === "exclusion" && within(point, f.geometry),
    )
  )
    return { eligible: false, code: "EXCLUDED" as const };
  return { eligible: true, code: "ALLOWED" as const };
}
