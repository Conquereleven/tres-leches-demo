import { useId } from "react";
import drawing from "./journal-drawing.json";
const WIDTH = 640,
  HEIGHT = 768;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
type Point = readonly [number, number];
/** A hand-placed stroke becomes a smooth pencil line (Catmull-Rom, ~3 units a step). */
function trace(knots: number[][]): Point[] {
  const at = (i: number) => knots[Math.max(0, Math.min(knots.length - 1, i))]!;
  const line: Point[] = [[knots[0]![0]!, knots[0]![1]!]];
  for (let i = 0; i < knots.length - 1; i++) {
    const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const steps = Math.max(
      2,
      Math.ceil(Math.hypot(c[0]! - b[0]!, c[1]! - b[1]!) / 3),
    );
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const spline = (axis: 0 | 1) =>
        0.5 *
        (2 * b[axis]! +
          (c[axis]! - a[axis]!) * t +
          (2 * a[axis]! - 5 * b[axis]! + 4 * c[axis]! - d[axis]!) * t * t +
          (3 * b[axis]! - a[axis]! - 3 * c[axis]! + d[axis]!) * t * t * t);
      line.push([spline(0), spline(1)]);
    }
  }
  return line;
}
/**
 * The artist's order: construction, features, mouth, hair, shoulders, then
 * secondary linework. Inside a phase each stroke takes scroll in proportion to
 * its length, so the pencil moves at a steady pace instead of a steady count.
 */
const strokes = drawing.groups.flatMap((group) => {
  const lines = group.strokes.map((stroke) => {
    const points = trace(stroke.pts);
    const reach = [0];
    for (let i = 1; i < points.length; i++)
      reach.push(
        reach[i - 1]! +
          Math.hypot(
            points[i]![0] - points[i - 1]![0],
            points[i]![1] - points[i - 1]![1],
          ),
      );
    return { width: stroke.w, points, reach, length: reach.at(-1)! };
  });
  const total = lines.reduce((sum, line) => sum + line.length, 0);
  let spent = 0;
  return lines.map((line) => {
    const start = group.from + ((group.to - group.from) * spent) / total;
    spent += line.length;
    const end = group.from + ((group.to - group.from) * spent) / total;
    return { ...line, phase: group.name, start, end };
  });
});
const pen = ([x, y]: Point) => `${x.toFixed(1)} ${y.toFixed(1)}`;
/** The part of a stroke already on paper, and where the pencil point is now. */
function lay(stroke: (typeof strokes)[number], done: number) {
  const target = stroke.length * done;
  let d = `M${pen(stroke.points[0]!)}`;
  let tip = stroke.points[0]!;
  for (let i = 1; i < stroke.points.length; i++) {
    if (stroke.reach[i]! <= target) {
      tip = stroke.points[i]!;
      d += `L${pen(tip)}`;
      continue;
    }
    const from = stroke.points[i - 1]!,
      to = stroke.points[i]!;
    const part =
      (target - stroke.reach[i - 1]!) /
      (stroke.reach[i]! - stroke.reach[i - 1]!);
    tip = [
      from[0] + (to[0] - from[0]) * part,
      from[1] + (to[1] - from[1]) * part,
    ];
    d += `L${pen(tip)}`;
    break;
  }
  return { d, tip };
}
const finished = strokes.map((stroke) => lay(stroke, 1).d);
/**
 * Scroll position → what the artist has drawn so far. Lines are real geometry
 * that grows behind the pencil point; no dash, mask or pathLength is involved
 * (Safari mis-measures dashes on long paths).
 */
export function paintSketch(section: HTMLElement, progress: number) {
  const sketch = section.querySelector<SVGSVGElement>(".ref-scroll-sketch");
  if (!sketch) return;
  const lines = sketch.querySelectorAll<SVGPathElement>(".ref-pencil-line");
  let tip: Point | null = null;
  let phase = "";
  strokes.forEach((stroke, i) => {
    const line = lines[i];
    if (!line) return;
    const done = clamp((progress - stroke.start) / (stroke.end - stroke.start));
    if (done > 0 && done < 1) phase = stroke.phase;
    const amount = done.toFixed(4);
    const laid = done > 0 && done < 1 ? lay(stroke, done) : null;
    if (laid) tip = laid.tip;
    // Rebuilding path data is wasted work once a stroke has settled.
    if (line.dataset.drawn === amount) return;
    line.dataset.drawn = amount;
    // An empty path data attribute is invalid; a lone move draws nothing.
    line.setAttribute("d", laid?.d ?? (done ? finished[i]! : "M0 0"));
  });
  const pencil = sketch.querySelector<SVGGElement>(".ref-pencil-point");
  if (pencil) {
    const point = tip as Point | null;
    pencil.style.opacity = point ? "1" : "0";
    if (point)
      pencil.setAttribute(
        "transform",
        `translate(${point[0].toFixed(1)} ${point[1].toFixed(1)})`,
      );
  }
  // The finished artwork resolves over the drawing, then the drawing lifts away.
  const resolved = clamp((progress - 0.88) / 0.12);
  const eased = resolved * resolved * (3 - 2 * resolved);
  section.style.setProperty("--sketch-final", eased.toFixed(4));
  section.style.setProperty(
    "--sketch-lines",
    (1 - clamp((progress - 0.94) / 0.06)).toFixed(4),
  );
  sketch.dataset.drawn = clamp(progress / 0.9).toFixed(4);
  sketch.dataset.phase =
    progress <= 0 ? "blank" : resolved > 0 ? "resolving" : phase || "drawing";
}
/**
 * The approved portrait appears to be drawn by hand: a controlled set of
 * hand-placed construction strokes grows in an artist's order, then the
 * untouched original resolves over them. Nothing is filtered or edge-detected.
 */
export function ScrollSketch({ label }: { label: string }) {
  const id = useId();
  return (
    <svg
      className="ref-alicia ref-scroll-sketch"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={label}
    >
      <image
        className="ref-sketch-final"
        href="/brand/reference/alicia.webp"
        width={WIDTH}
        height={HEIGHT}
        preserveAspectRatio="none"
      />
      <g className="ref-sketch-lines" aria-hidden="true">
        {strokes.map((stroke, i) => (
          <path
            key={`${id}-${i}`}
            className="ref-pencil-line"
            d={finished[i]}
            fill="none"
            strokeWidth={stroke.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        <g className="ref-pencil-point">
          <path className="ref-pencil-lead" d="M0 0L6 -15L15 -6Z" />
          <path className="ref-pencil-body" d="M6 -15L15 -6L60 -51L51 -60Z" />
          <path className="ref-pencil-cap" d="M51 -60L60 -51L68 -59L59 -68Z" />
        </g>
      </g>
    </svg>
  );
}
const ROUTE =
  "M 35 245 C 155 185, 250 190, 345 235 C 420 270, 455 305, 430 335 C 400 372, 330 330, 360 285 C 390 240, 475 300, 545 350 C 650 425, 800 445, 930 405 C 1045 370, 1110 300, 1215 285 C 1330 268, 1425 315, 1510 350 C 1590 383, 1685 360, 1765 300";
/** Scroll position → Mexico active, a traveller crossing, then Dubai active. */
export function paintJourney(section: HTMLElement, progress: number) {
  const route = section.querySelector<SVGPathElement>(".ref-route-ink");
  const matrix = route?.getScreenCTM();
  if (!route || !matrix) return;
  const travelled = clamp((progress - 0.2) / 0.6);
  // Screen pixels per drawing unit, independent of the stacked mobile rotation.
  const unit = 1 / (Math.hypot(matrix.a, matrix.b) || 1);
  const length = route.getTotalLength();
  const place = (selector: string, at: number) => {
    const point = route.getPointAtLength(length * at);
    section
      .querySelector(selector)
      ?.setAttribute(
        "transform",
        `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)}) scale(${unit.toFixed(3)})`,
      );
  };
  place(".ref-route-origin", 0);
  place(".ref-route-arrival", 1);
  place(".ref-route-tracer", travelled);
  section.style.setProperty("--route-offset", (1 - travelled).toFixed(4));
  // Line weight is authored in screen pixels so the 290px mobile route stays legible.
  route.style.strokeWidth = (6 * unit).toFixed(2);
  const glow = section.querySelector<SVGPathElement>(".ref-route-glow");
  if (glow) glow.style.strokeWidth = (10 * unit).toFixed(2);
  const bridge = section.closest<HTMLElement>(".ref-bridge") ?? section;
  bridge.dataset.journey =
    progress < 0.2 ? "mexico" : travelled < 1 ? "travel" : "dubai";
}
export function JourneyRoute() {
  return (
    <svg viewBox="0 0 1800 500" aria-hidden="true" className="ref-route-motion">
      <path className="ref-route-glow" d={ROUTE} pathLength="1" fill="none" />
      <path className="ref-route-ink" d={ROUTE} pathLength="1" fill="none" />
      <g className="ref-route-origin">
        <circle r="6" />
      </g>
      <g className="ref-route-arrival">
        <circle className="ref-route-ping" r="9" />
        <circle r="9" />
      </g>
      <g className="ref-route-tracer">
        <circle className="ref-route-halo" r="19" />
        <circle className="ref-route-dot" r="9" />
      </g>
    </svg>
  );
}
