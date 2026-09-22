import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/** Where each history entry was last scrolled to, for this tab. */
const positions = new Map<string, number>();
/** Scrolling or pressing a key yourself stops any restore still in progress. */
const USER_INPUT = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
/** How long a restore keeps trying while the page is still too short to reach the saved spot. */
const RESTORE_FOR_MS = 2000;

/**
 * New pages start at the top, and Back/Forward return to where you were on that page (e.g. Events -> an event
 * -> Back lands on the same poster). Filter and hash changes on the same page (?type=Talk, #main) keep the scroll.
 */
export function useScrollMemory() {
  const location = useLocation();
  const navType = useNavigationType();
  const lastPath = useRef(location.pathname);
  const currentKey = useRef(location.key);

  // One listener keeps the position of whichever entry is on screen
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const save = () => positions.set(currentKey.current, window.scrollY);
    window.addEventListener("scroll", save, { passive: true });
    return () => window.removeEventListener("scroll", save);
  }, []);

  useLayoutEffect(() => {
    currentKey.current = location.key;
    const samePage = lastPath.current === location.pathname;
    lastPath.current = location.pathname;
    if (location.hash || (samePage && navType !== "POP")) return;
    const saved = navType === "POP" ? positions.get(location.key) : undefined;
    window.scrollTo(0, saved ?? 0);
    if (!saved) return;
    // Images and particles can change the page height just after the first paint, so settle once more. If the page
    // is still too short to reach the spot (its code or content still arriving), keep trying for a while.
    const start = performance.now();
    let timer = 0;
    const stop = () => {
      clearTimeout(timer);
      USER_INPUT.forEach(type => window.removeEventListener(type, stop));
    };
    const settle = () => {
      window.scrollTo(0, saved);
      const reachable = document.documentElement.scrollHeight - window.innerHeight >= saved - 1;
      if (!reachable && performance.now() - start < RESTORE_FOR_MS) timer = window.setTimeout(settle, 100);
      else stop();
    };
    USER_INPUT.forEach(type => window.addEventListener(type, stop, { passive: true }));
    timer = window.setTimeout(settle, 150);
    return stop;
  }, [location, navType]);
}
