import { useId } from "react";
/** Brush hatching reveals the original raster pencil drawing, never a generated portrait. */
export function ScrollSketch({ label }: { label: string }) {
  const id = useId();
  const strokes = Array.from({ length: 28 }, (_, row) => {
    const y = 12 + row * 28;
    return row % 2 ? `L 8 ${y} L 632 ${y + 14}` : `L 632 ${y} L 8 ${y + 14}`;
  }).join(" ");
  return (
    <svg
      className="ref-alicia ref-scroll-sketch"
      viewBox="0 0 640 768"
      role="img"
      aria-label={label}
    >
      <defs>
        <mask
          id={id}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="640"
          height="768"
        >
          <path
            className="ref-pencil-mask"
            d={`M 8 0 ${strokes}`}
            pathLength="1"
            fill="none"
            stroke="white"
            strokeWidth="34"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </mask>
      </defs>
      <image
        href="/brand/reference/alicia.webp"
        width="640"
        height="768"
        mask={`url(#${id})`}
      />
    </svg>
  );
}
export function JourneyRoute() {
  const route =
    "M 35 245 C 155 185, 250 190, 345 235 C 420 270, 455 305, 430 335 C 400 372, 330 330, 360 285 C 390 240, 475 300, 545 350 C 650 425, 800 445, 930 405 C 1045 370, 1110 300, 1215 285 C 1330 268, 1425 315, 1510 350 C 1590 383, 1685 360, 1765 300";
  return (
    <svg viewBox="0 0 1800 500" aria-hidden="true" className="ref-route-motion">
      <path className="ref-route-ink" d={route} pathLength="1" fill="none" />
      <path className="ref-route-tracer" d={route} pathLength="1" fill="none" />
    </svg>
  );
}
