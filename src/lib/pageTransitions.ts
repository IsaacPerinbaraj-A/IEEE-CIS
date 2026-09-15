import { useEffect } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import { prefersReducedMotion } from "./motion";

/**
 * Clicking a link to another page of the site plays a short transition: the old page sinks back while a
 * purple curtain with a gold edge sweeps up and reveals the new page (styles in index.css, "Page transitions").
 * It uses the browser's View Transitions API, so no animation library is needed. Browsers without the API,
 * visitors who prefer reduced motion, Back/Forward, new-tab clicks and same-page links behave exactly as before.
 */
export function usePageTransitions() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!("startViewTransition" in document)) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || prefersReducedMotion()) return;
      const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[href]");
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname || url.pathname.startsWith("/admin")) return;

      // Runs before React Router's own link handler (capture phase), which then sees the click is handled
      e.preventDefault();
      const html = document.documentElement;
      const transition = document.startViewTransition(() => {
        html.dataset.pageTransition = "on";
        flushSync(() => navigate(url.pathname + url.search + url.hash));
        window.scrollTo(0, 0);
      });
      transition.finished.finally(() => { delete html.dataset.pageTransition; });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [navigate]);
}
