import { useId } from "react";
const WIDTH = 640,
  HEIGHT = 768;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
/**
 * One continuous pencil path of parallel strokes. Passes interleave, so strokes
 * first land sparsely across the whole sheet and later passes fill between them;
 * the turns between strokes sit outside the sheet and are never visible.
 */
function hatch(angle: number, spacing: number, passes: number) {
  const radians = (angle * Math.PI) / 180;
  const along = [Math.cos(radians), Math.sin(radians)] as const;
  const across = [-along[1], along[0]] as const;
  const reach = 640;
  const count = Math.ceil(1060 / spacing);
  let side = -1;
  const points: string[] = [];
  for (let pass = 0; pass < passes; pass++)
    for (let line = pass; line < count; line += passes) {
      // Deterministic unevenness: a ruler-straight hatch reads as a wipe, not a hand.
      const wobble = Math.sin(line * 12.9898) * spacing * 0.1;
      const offset = (line - count / 2) * spacing + wobble;
      for (const end of [side, -side]) {
        const x = WIDTH / 2 + across[0] * offset + along[0] * reach * end;
        const y = HEIGHT / 2 + across[1] * offset + along[1] * reach * end;
        points.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      side = -side;
    }
  return `M ${points.join(" L ")}`;
}
const stages = [
  // Construction lines, the artist's own linework, then shading: three hands of pencil.
  { key: "contour", angle: -38, spacing: 11, passes: 5 },
  { key: "detail", angle: 52, spacing: 8, passes: 5 },
  { key: "shade", angle: -14, spacing: 7, passes: 4 },
] as const;
const strokes = stages.map((stage) => ({
  ...stage,
  d: hatch(stage.angle, stage.spacing, stage.passes),
}));
/** Scroll position → what the pencil has done so far. */
export function paintSketch(section: HTMLElement, progress: number) {
  const contour = clamp(progress / 0.3);
  const detail = clamp((progress - 0.3) / 0.35);
  const shade = clamp((progress - 0.65) / 0.25);
  const finished = clamp((progress - 0.9) / 0.1);
  const set = (name: string, value: number) =>
    section.style.setProperty(name, value.toFixed(4));
  // Written on the mask strokes themselves: Safari does not repaint a mask
  // when only an inherited custom property changes.
  const draw = (stage: string, done: number) => {
    const stroke = section.querySelector<SVGPathElement>(
      `.ref-pencil-${stage}`,
    );
    if (stroke) stroke.style.strokeDashoffset = (1 - done).toFixed(4);
  };
  draw("contour", contour);
  draw("detail", detail);
  draw("shade", shade);
  // Construction lines are erased as real shading replaces them.
  set("--sketch-contour-ink", 1 - shade);
  set("--sketch-working", 1 - finished);
  set("--sketch-final", finished);
}
/**
 * The approved portrait appears to be drawn: construction contours, then linework,
 * then shading, and finally the untouched original. Stage images are derived from
 * that original by scripts/derive-journal-layers.mjs; nothing is redrawn.
 */
export function ScrollSketch({ label }: { label: string }) {
  const id = useId();
  const layer = (key: string, href: string) => (
    <image
      className={`ref-sketch-${key}`}
      href={href}
      width={WIDTH}
      height={HEIGHT}
      preserveAspectRatio="none"
      mask={`url(#${id}-${key})`}
    />
  );
  return (
    <svg
      className="ref-alicia ref-scroll-sketch"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={label}
    >
      <defs>
        {strokes.map((stage) => (
          <mask
            key={stage.key}
            id={`${id}-${stage.key}`}
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width={WIDTH}
            height={HEIGHT}
          >
            <path
              className={`ref-pencil ref-pencil-${stage.key}${stage.key === "contour" ? " ref-pencil-mask" : ""}`}
              d={stage.d}
              pathLength="1"
              fill="none"
              stroke="white"
              strokeWidth={stage.spacing * 1.3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </mask>
        ))}
      </defs>
      <g className="ref-sketch-working">
        {layer("contour", "/brand/approved/journal-alicia-contour.webp")}
        {layer("detail", "/brand/approved/journal-alicia-detail.webp")}
        {layer("shade", "/brand/reference/alicia.webp")}
      </g>
      <image
        className="ref-sketch-final"
        href="/brand/reference/alicia.webp"
        width={WIDTH}
        height={HEIGHT}
        preserveAspectRatio="none"
      />
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
  route.style.strokeWidth = (3 * unit).toFixed(2);
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
        <circle className="ref-route-ping" r="7" />
        <circle r="7" />
      </g>
      <g className="ref-route-tracer">
        <circle className="ref-route-halo" r="15" />
        <circle className="ref-route-dot" r="7.5" />
      </g>
    </svg>
  );
}
