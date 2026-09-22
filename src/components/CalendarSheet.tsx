import { useEffect, useRef } from "react";
import { CalendarPlus, Download, ExternalLink, X } from "lucide-react";
import { type ChapterEvent, downloadCalendar, googleCalendarUrl } from "../lib/data";
import { prefersReducedMotion } from "../lib/motion";

/**
 * Phones: a small bottom sheet (native modal dialog) with the two ways to add an event to a calendar:
 * a Google Calendar link, or an .ics file for Apple Calendar and everything else (built only when tapped).
 * Escape, the close button or a tap above the sheet closes it; the caller puts focus back in `onClose`.
 */
export default function CalendarSheet({ open, e, onClose }: { open: boolean; e: ChapterEvent; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!open || !d) return;
    if (!d.open) d.showModal();
    const root = document.documentElement, overflow = root.style.overflow;
    root.style.overflow = "hidden";
    const anims: Animation[] = [];
    if (!prefersReducedMotion()) {
      anims.push(d.animate([{ transform: "translateY(100%)" }, { transform: "none" }], { duration: 250, easing: "cubic-bezier(.2,.7,.2,1)" }));
      // The dimmed backdrop fades in with it, where the browser can animate ::backdrop
      try { anims.push(d.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: "ease-out", pseudoElement: "::backdrop" })); } catch { /* not supported */ }
    }
    return () => {
      anims.forEach(a => a.cancel());
      root.style.overflow = overflow;
      if (d.open) d.close();
    };
  }, [open]);

  const close = () => dialog.current?.close();
  const google = googleCalendarUrl(e);
  const row = "press flex min-h-[56px] w-full items-center gap-3.5 px-4 py-2 text-left active:bg-raised";
  const tile = "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-raised text-violet-soft";

  return (
    <dialog ref={dialog} onClose={onClose} aria-labelledby="calendar-sheet-title"
      onClick={ev => { if (ev.target === ev.currentTarget) close(); }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85vh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-3xl border border-b-0 border-line bg-panel p-0 text-cream backdrop:bg-ink/70">
      <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="calendar-sheet-title" className="text-lg font-semibold">Add to calendar</h2>
          <button type="button" onClick={close} aria-label="Close" className="press -mr-1.5 grid h-11 w-11 place-items-center rounded-full border border-line text-cream active:bg-raised">
            <X size={20} aria-hidden />
          </button>
        </div>
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-ink/40">
          {google && (
            <li>
              <a href={google} target="_blank" rel="noopener" onClick={close} className={row}>
                <span className={tile}><CalendarPlus size={19} aria-hidden /></span>
                <span className="min-w-0 flex-1 font-medium">Google Calendar<span className="sr-only"> (opens in a new tab)</span></span>
                <ExternalLink size={17} aria-hidden className="shrink-0 text-mute" />
              </a>
            </li>
          )}
          <li>
            <button type="button" onClick={() => { downloadCalendar(e); close(); }} className={row}>
              <span className={tile}><Download size={19} aria-hidden /></span>
              <span className="min-w-0 flex-1 font-medium">Apple or other (.ics)</span>
            </button>
          </li>
        </ul>
      </div>
    </dialog>
  );
}
