import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { prefersReducedMotion } from "../lib/motion";

/**
 * Phones: the poster full screen in a native modal dialog. Escape, the close button or a tap outside the poster
 * closes it (the caller puts focus back on the poster in `onClose`). The poster can be pinch-zoomed.
 * It fades in while the poster settles from 94% to full size; with reduced motion it simply appears.
 */
export default function PosterViewer({ open, src, alt, onClose }: { open: boolean; src: string; alt: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!open || !d) return;
    if (!d.open) d.showModal();
    // The page behind stays put while the viewer is open
    const root = document.documentElement, overflow = root.style.overflow;
    root.style.overflow = "hidden";
    const anims = prefersReducedMotion() ? [] : [
      d.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "ease-out" }),
      ...(img.current ? [img.current.animate([{ transform: "scale(.94)" }, { transform: "none" }], { duration: 320, easing: "cubic-bezier(.2,.7,.2,1)" })] : []),
    ];
    return () => {
      anims.forEach(a => a.cancel());
      root.style.overflow = overflow;
      if (d.open) d.close();
    };
  }, [open]);

  const close = () => dialog.current?.close();

  return (
    <dialog ref={dialog} onClose={onClose} aria-label={alt}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-hidden overscroll-contain border-0 bg-ink/95 p-0 text-cream backdrop:bg-transparent">
      {/* Tapping anywhere but the poster closes the viewer */}
      <div className="flex h-full w-full items-center justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))]"
        onClick={ev => { if (ev.target === ev.currentTarget) close(); }}>
        {/* Pinch to zoom; panning stays on so a zoomed-in poster can be moved around with one finger */}
        <img ref={img} src={src} alt={alt} decoding="async" className="max-h-full max-w-full rounded-xl object-contain [touch-action:pan-x_pan-y_pinch-zoom]" />
      </div>
      <button type="button" onClick={close} aria-label="Close"
        className="press absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-full border border-line bg-panel text-cream active:bg-raised">
        <X size={20} aria-hidden />
      </button>
    </dialog>
  );
}
