import { useEffect, useRef } from "react";
type Options<T> = {
  /** Artwork inside the section whose own on-screen position drives progress. */
  target: string;
  /** Viewport-height fractions of the artwork's centre at progress 0 and 1. */
  from: number;
  to: number;
  paint: (section: T, progress: number) => void;
};
/** One geometry read per animation frame, only while the composition is nearby. */
export function useEditorialMotion<T extends HTMLElement = HTMLElement>(
  options?: Options<T>,
) {
  const ref = useRef<T>(null);
  const config = useRef(options);
  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    const custom = config.current;
    const artwork = custom ? section.querySelector(custom.target) : null;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0,
      visible = false;
    const measure = () => {
      if (reduced.matches) return 1;
      if (custom && artwork) {
        // The artwork, not its taller section, must be on screen while it animates.
        const box = artwork.getBoundingClientRect();
        const centre = (box.top + box.height / 2) / innerHeight;
        return Math.max(
          0,
          Math.min(1, (custom.from - centre) / (custom.from - custom.to)),
        );
      }
      const top = section.getBoundingClientRect().top;
      return Math.max(
        0,
        Math.min(1, (innerHeight * 0.95 - top) / (innerHeight * 0.85)),
      );
    };
    const paint = () => {
      frame = 0;
      const progress = measure();
      section.style.setProperty("--editorial-progress", String(progress));
      section.style.setProperty("--editorial-offset", String(1 - progress));
      section.style.setProperty("--editorial-tracer", String(-progress));
      section.dataset.motion = "scroll";
      custom?.paint(section, progress);
    };
    const schedule = () => {
      if (visible && !frame) frame = requestAnimationFrame(paint);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = !!entry?.isIntersecting;
        if (visible) schedule();
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(section);
    // The pre-drawing state must not wait for the observer's first callback.
    if (custom) paint();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    reduced.addEventListener("change", paint);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      reduced.removeEventListener("change", paint);
    };
  }, []);
  return ref;
}
