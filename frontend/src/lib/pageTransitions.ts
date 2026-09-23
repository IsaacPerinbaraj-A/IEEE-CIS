import { useEffect } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import { prefersReducedMotion } from "./motion";
import { pageAt } from "./routes";

/** Fired on window when a page transition has finished and the curtain is gone (e.g. to start header particles then). */
export const PAGE_TRANSITION_END = "cis:pagetransitionend";
/** The longest a click waits for the next page's code before opening the page anyway (without the curtain). */
const CODE_WAIT_MS = 1000;

// Module level, so they survive the effect re-running when the location (and with it `navigate`) changes
let activeTransition: object | null = null; // the running transition, only compared by identity
let lastClick = 0;

/**
 * Clicking a link to another page of the site plays a short transition: the old page sinks back while a
 * purple curtain with a gold edge sweeps up and reveals the new page (styles in index.css, "Page transitions").
 * It uses the browser's View Transitions API, so no animation library is needed. Browsers without the API,
 * visitors who prefer reduced motion, Back/Forward, new-tab clicks and same-page links behave exactly as before.
 *
 * Pages other than Home load their code on demand (src/lib/routes.ts). It is almost always here before the click;
 * if not, the current page stays until it arrives, so the curtain never uncovers an empty page.
 */
export function usePageTransitions() {
  const navigate = useNavigate();
  useEffect(() => {
    const html = document.documentElement;
    const withCurtain = (to: string) => {
      const transition = document.startViewTransition(() => {
        html.dataset.pageTransition = "on";
        flushSync(() => navigate(to));
        window.scrollTo(0, 0);
      });
      activeTransition = transition;
      const end = () => {
        if (activeTransition !== transition) return; // a newer transition took over; it reports its own end
        activeTransition = null;
        delete html.dataset.pageTransition;
        window.dispatchEvent(new Event(PAGE_TRANSITION_END));
      };
      transition.finished.then(end, end);
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[href]");
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname || url.pathname.startsWith("/admin")) return;

      const curtain = "startViewTransition" in document && !prefersReducedMotion();
      const page = pageAt(url.pathname);
      const needsCode = !!page && !page.ready();
      if (!curtain && !needsCode) return; // React Router's own link handler navigates, exactly as before

      // Runs before React Router's own link handler (capture phase), which then sees the click is handled
      e.preventDefault();
      const to = url.pathname + url.search + url.hash;
      const click = ++lastClick;
      if (!needsCode) { withCurtain(to); return; }

      // Keep the current page until the next one's code is here. A newer click or Back/Forward in the meantime wins.
      const from = window.location.href;
      let settled = false;
      const go = (ready: boolean) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (click !== lastClick || window.location.href !== from) return;
        if (ready && curtain) withCurtain(to); else navigate(to);
      };
      const timer = window.setTimeout(() => go(false), CODE_WAIT_MS);
      page.preload().then(() => go(true), () => go(false)); // a failed download opens the page's error message
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [navigate]);
}
