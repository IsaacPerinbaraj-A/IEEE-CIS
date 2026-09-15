/** True when the visitor has asked their device for less motion. */
export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Slides a tapped chip fully into view when its filter row scrolls sideways (phones). */
export const revealChip = (el: HTMLElement) =>
  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
