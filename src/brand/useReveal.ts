/**
 * Scroll reveal for the customer storefront.
 *
 * Safety contract, in order of importance:
 *
 * 1. Content is visible by default. The pre-reveal (hidden) state is scoped to
 *    `[data-motion="on"]`, an attribute only this hook sets, and only once it
 *    has an IntersectionObserver and the visitor has not asked for reduced
 *    motion. No JavaScript, no hook, a thrown error, an old browser or a
 *    prerendered page all render the fully visible page.
 * 2. Reduced motion short-circuits before anything is armed, and a later switch
 *    to reduced motion disarms and reveals everything already on the page.
 * 3. A failsafe timer reveals everything regardless, so a mis-scoped root or a
 *    never-firing observer can never leave a section invisible.
 *
 * Motion itself lives in brand.css against the existing tokens. Nothing here
 * writes inline styles, and nothing here animates.
 */
import { useEffect } from "react";

export type RevealOptions = {
  /** Fraction of the element that must be visible. */
  threshold?: number;
  /** Shrinks the viewport so reveals fire a little before the true edge. */
  rootMargin?: string;
  /** Reveal everything after this long no matter what the observer does. */
  failsafeMs?: number;
};

/** Marks a node revealed. Idempotent, so the failsafe can run over anything. */
const reveal = (el: Element) => el.setAttribute("data-revealed", "true");

export function useReveal(
  root: React.RefObject<HTMLElement | null>,
  {
    threshold = 0.15,
    rootMargin = "0px 0px -10%",
    failsafeMs = 3000,
  }: RevealOptions = {},
) {
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const targets = () => [...node.querySelectorAll("[data-reveal]")];
    const revealAll = () => targets().forEach(reveal);

    // No observer support: show everything and never arm the hidden state.
    if (typeof IntersectionObserver === "undefined") {
      revealAll();
      return;
    }

    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | null = null;
    let failsafe: ReturnType<typeof setTimeout> | undefined;

    const disarm = () => {
      observer?.disconnect();
      observer = null;
      clearTimeout(failsafe);
      node.removeAttribute("data-motion");
      revealAll();
    };

    const arm = () => {
      // Arm the CSS hidden state only now that we can guarantee we will undo it.
      node.setAttribute("data-motion", "on");
      observer = new IntersectionObserver(
        (entries, self) => {
          // The observer answered, so it works. Cancel the blanket failsafe and
          // let scrolling drive the rest; otherwise the failsafe would reveal
          // the whole page a few seconds in and there would be no reveal at all.
          clearTimeout(failsafe);
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            reveal(entry.target);
            self.unobserve(entry.target); // one-time; no re-animation on scroll back
          });
        },
        { threshold, rootMargin },
      );
      for (const el of targets()) observer.observe(el);
      // Only fires if the observer never calls back at all.
      failsafe = setTimeout(revealAll, failsafeMs);
    };

    if (media.matches) revealAll();
    else arm();

    const onPreferenceChange = () => {
      if (media.matches) disarm();
    };
    media.addEventListener("change", onPreferenceChange);

    return () => {
      media.removeEventListener("change", onPreferenceChange);
      observer?.disconnect();
      clearTimeout(failsafe);
      node.removeAttribute("data-motion");
    };
  }, [root, threshold, rootMargin, failsafeMs]);
}
