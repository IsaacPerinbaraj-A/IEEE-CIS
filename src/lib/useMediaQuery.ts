import { useSyncExternalStore } from "react";

/** Phone widths: exactly the query Tailwind uses for max-sm:, so JS and CSS agree even at fractional widths (browser zoom). */
export const PHONE = "not all and (min-width: 640px)";

/** Live result of a CSS media query; updates when the window is resized or the phone is rotated. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    notify => {
      const m = window.matchMedia(query);
      m.addEventListener("change", notify);
      return () => m.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
