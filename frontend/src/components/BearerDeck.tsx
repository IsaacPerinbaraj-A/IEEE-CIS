import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Member } from "../lib/data";
import { initials } from "../lib/data";
import { Linkedin, Github, Instagram } from "../lib/icons";
import { prefersReducedMotion } from "../lib/motion";

function BearerCard({ m, i, total }: { m: Member; i: number; total: number }) {
  const socials = [
    { href: m.linkedin, label: "LinkedIn", Icon: Linkedin },
    { href: m.github, label: "GitHub", Icon: Github },
    { href: m.instagram, label: "Instagram", Icon: Instagram },
  ].filter(s => s.href);
  // Fall back to initials if the photo file is missing or fails to load
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto = m.photo && failedSrc !== m.photo;
  return (
    <article role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${total}`}
      className="flex w-[64vw] shrink-0 snap-center flex-col overflow-hidden rounded-3xl border border-line bg-panel shadow-[0_12px_28px_-18px_rgba(139,92,246,.6)]">
      <div className="aspect-square bg-raised">
        {showPhoto
          ? <img src={m.photo} alt="" decoding="async" onError={() => setFailedSrc(m.photo ?? null)} className="h-full w-full object-cover" />
          : <div aria-hidden className="grid h-full w-full place-items-center bg-gradient-to-br from-violet-deep to-panel font-display text-4xl text-violet-soft">{initials(m.name)}</div>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-sans text-[18px] font-semibold leading-snug tracking-normal">{m.name}</h3>
        <p className="text-[15px] text-mute">{m.role}</p>
        {socials.length > 0 && (
          <div className="mt-auto flex gap-2 pt-3">
            {socials.map(({ href, label, Icon }) => (
              <a key={label} href={href} target="_blank" rel="noopener" aria-label={`${m.name} on ${label}`}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line text-mute transition-[transform,color,background-color] duration-200 active:scale-[.97] active:bg-raised active:text-cream">
                <Icon size={17} aria-hidden />
              </a>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * Phones: the office bearers as a swipeable deck of portrait cards, with the cards on either side peeking in.
 * Cards away from the centre shrink and dim a little (scale and opacity only, no rotation: the Home What We Do deck
 * stays the one 3D moment). Larger screens keep the photo grid.
 */
export default function BearerDeck({ members, label }: { members: Member[]; label: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = track.current!;
    const still = prefersReducedMotion();
    let raf = 0;
    const update = () => {
      raf = 0;
      const mid = el.scrollLeft + el.clientWidth / 2;
      let best = 0, bestDist = Infinity;
      (Array.from(el.children) as HTMLElement[]).forEach((card, i) => {
        const dist = card.offsetLeft + card.offsetWidth / 2 - mid;
        if (Math.abs(dist) < bestDist) { bestDist = Math.abs(dist); best = i; }
        if (still) return;
        const k = Math.min(1, Math.abs(dist) / card.offsetWidth);
        card.style.transform = `scale(${(1 - k * 0.08).toFixed(3)})`;
        card.style.opacity = (1 - k * 0.4).toFixed(3);
      });
      setIndex(best);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [members]);

  const go = (i: number) => {
    const el = track.current!, card = el.children[Math.max(0, Math.min(members.length - 1, i))] as HTMLElement;
    el.scrollTo({ left: card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };
  const two = (n: number) => String(n).padStart(2, "0");

  return (
    <div role="region" aria-roledescription="carousel" aria-label={label}>
      <div ref={track} className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-[18vw] pb-6 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {members.map((m, i) => <BearerCard key={m.name} m={m} i={i} total={members.length} />)}
      </div>
      {members.length > 1 && (
        <div className="flex items-center justify-center gap-5">
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous" className="btn-ghost h-11 min-h-0 w-11 px-0 disabled:opacity-40"><ChevronLeft size={20} aria-hidden /></button>
          <p className="min-w-[4.5rem] text-center text-[15px] tabular-nums text-mute" aria-live="polite"><span className="text-cream">{two(index + 1)}</span> / {two(members.length)}</p>
          <button type="button" onClick={() => go(index + 1)} disabled={index === members.length - 1} aria-label="Next" className="btn-ghost h-11 min-h-0 w-11 px-0 disabled:opacity-40"><ChevronRight size={20} aria-hidden /></button>
        </div>
      )}
    </div>
  );
}
