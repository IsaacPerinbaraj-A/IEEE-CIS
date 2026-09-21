import { useSyncExternalStore } from "react";

/** Phone widths (below Tailwind's sm breakpoint). */
export const PHONE = "(max-width: 639px)";

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
