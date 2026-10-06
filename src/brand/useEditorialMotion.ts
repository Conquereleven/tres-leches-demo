import { useEffect, useRef } from "react";
/** One geometry read per animation frame, only while the composition is nearby. */
export function useEditorialMotion<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0,
      visible = false;
    const paint = () => {
      frame = 0;
      const top = section.getBoundingClientRect().top;
      const progress = reduced.matches
        ? 1
        : Math.max(
            0,
            Math.min(1, (innerHeight * 0.95 - top) / (innerHeight * 0.85)),
          );
      section.style.setProperty("--editorial-progress", String(progress));
      section.style.setProperty("--editorial-offset", String(1 - progress));
      section.style.setProperty("--editorial-tracer", String(-progress));
      section.dataset.motion = "scroll";
    };
    const schedule = () => {
      if (visible && !frame) frame = requestAnimationFrame(paint);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = !!entry?.isIntersecting;
        if (visible) schedule();
      },
      { rootMargin: "100px 0px" },
    );
    observer.observe(section);
    const preference = () => {
      if (reduced.matches) {
        section.style.setProperty("--editorial-progress", "1");
        section.style.setProperty("--editorial-offset", "0");
        section.style.setProperty("--editorial-tracer", "-1");
      } else schedule();
    };
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    reduced.addEventListener("change", preference);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      reduced.removeEventListener("change", preference);
    };
  }, []);
  return ref;
}
