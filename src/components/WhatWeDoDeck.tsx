import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Lightbulb } from "lucide-react";
import { pillarIcon } from "../lib/icons";
import { prefersReducedMotion } from "../lib/motion";

type Item = { icon: string; title: string; text: string };

/**
 * Phones: the What We Do items as one swipeable deck instead of six full-screen steps. The cards beside the
 * centre one turn slightly away in 3D (coverflow-lite), and the particle formation behind the deck follows the
 * swipe (ParticleStory reads the scroll position of [data-deck-track]). Larger screens keep the vertical story.
 */
export default function WhatWeDoDeck({ label, title, items, colors }: { label: string; title: string; items: Item[]; colors: string[] }) {
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
        const centre = card.offsetLeft + card.offsetWidth / 2, dist = centre - mid;
        if (Math.abs(dist) < bestDist) { bestDist = Math.abs(dist); best = i; }
        if (still) return;
        const k = Math.max(-1, Math.min(1, dist / card.offsetWidth));
        card.style.transform = `perspective(900px) rotateY(${(-k * 12).toFixed(2)}deg) scale(${(1 - Math.abs(k) * 0.06).toFixed(3)})`;
        card.style.opacity = (1 - Math.abs(k) * 0.35).toFixed(3);
      });
      setIndex(best);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, []);

  const go = (i: number) => {
    const el = track.current!, card = el.children[Math.max(0, Math.min(items.length - 1, i))] as HTMLElement;
    el.scrollTo({ left: card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };
  const two = (n: number) => String(n).padStart(2, "0");

  return (
    <section className="flex w-full flex-col" aria-roledescription="carousel" aria-label={label}>
      <div className="wrap">
        <p className="text-[15px] font-medium text-violet-soft">{label}</p>
        <h2 className="h-section mt-2">{title}</h2>
      </div>
      <div ref={track} data-deck-track className="deck-track mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-[8vw] pb-3 pt-1">
        {items.map((item, i) => {
          const Icon = pillarIcon[item.icon] ?? Lightbulb;
          return (
            <article key={item.title} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${items.length}`}
              className="deck-card flex w-[84vw] shrink-0 snap-center flex-col rounded-3xl border border-line/80 bg-ink/90 p-6">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-raised" style={{ color: colors[i % colors.length] }}><Icon size={20} aria-hidden /></span>
              <h3 className="mt-4 text-[1.35rem] font-semibold leading-tight">{item.title}</h3>
              <p className="mt-3 text-[16px] leading-relaxed text-cream/85">{item.text}</p>
            </article>
          );
        })}
      </div>
      <div className="wrap mt-2 flex items-center justify-between">
        <p className="text-[15px] tabular-nums text-mute" aria-live="polite"><span className="text-cream">{two(index + 1)}</span> / {two(items.length)}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous" className="btn-ghost h-11 min-h-0 w-11 px-0 disabled:opacity-40"><ChevronLeft size={20} aria-hidden /></button>
          <button type="button" onClick={() => go(index + 1)} disabled={index === items.length - 1} aria-label="Next" className="btn-ghost h-11 min-h-0 w-11 px-0 disabled:opacity-40"><ChevronRight size={20} aria-hidden /></button>
        </div>
      </div>
    </section>
  );
}
