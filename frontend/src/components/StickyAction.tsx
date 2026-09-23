import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Phones only: an action bar fixed to the bottom of the screen, within thumb reach (Register on an upcoming event,
 * "Become a member" on Join). It slides up when `show` is true. While it shows, back-to-top moves up above it and
 * the page gets room at the bottom, so the bar never covers the footer (styles: .action-bar in index.css).
 * Hidden from 640px up, where pages keep their normal inline buttons.
 */
export default function StickyAction({ show, label, children }: { show: boolean; label: string; children: ReactNode }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = document.documentElement, el = bar.current;
    if (show) root.dataset.actionBar = "1"; else delete root.dataset.actionBar;
    // A hidden bar can't be tabbed to or read out
    if (el) { if (show) el.removeAttribute("inert"); else el.setAttribute("inert", ""); }
    return () => { delete root.dataset.actionBar; };
  }, [show]);
  return createPortal(
    <div ref={bar} role="region" aria-label={label} data-show={show ? "1" : "0"}
      className="action-bar fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/95 px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 sm:hidden">
      <div className="mx-auto flex max-w-[560px] items-center gap-2">{children}</div>
    </div>,
    document.body,
  );
}
