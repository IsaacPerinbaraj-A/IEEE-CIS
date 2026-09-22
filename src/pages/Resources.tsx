import { useEffect, useLayoutEffect, useRef, useState } from "react";
import PageHeader from "../components/PageHeader";
import resources from "../data/resources.json";
import { ExternalLink } from "lucide-react";
import { useTitle } from "../lib/useTitle";
import { prefersReducedMotion } from "../lib/motion";
import { useMediaQuery, PHONE } from "../lib/useMediaQuery";
import { Reveal, Tilt } from "../components/Motion";

/** Height of the slim site header on phones; the domain bar sticks just under it. */
const HEADER = 56;

/** Puts the sliding pill under a chip. It is two round ends and a middle strip, so it can move and change width with transforms only. */
function placePill(p: HTMLSpanElement | null, c: HTMLElement | null, animate: boolean) {
  if (!c || !p) return;
  const x = c.offsetLeft, w = c.offsetWidth, [l, m, r] = Array.from(p.children) as HTMLElement[];
  if (!animate) p.dataset.still = "1";
  l.style.transform = `translateX(${x}px)`;
  m.style.transform = `translateX(${x + 22}px) scaleX(${Math.max(0, w - 44)})`;
  r.style.transform = `translateX(${x + w - 44}px)`;
  if (!animate) { void p.offsetWidth; delete p.dataset.still; }
}

/** The last domain whose top has passed a line 35% of the way down the screen (the first domain until one has). */
function domainAtLine(sections: (HTMLElement | null)[]) {
  const line = window.innerHeight * 0.35;
  return sections.reduce((a, s, i) => (s && s.getBoundingClientRect().top <= line ? i : a), 0);
}

/**
 * Phones: a bar of domain chips that stays under the header. Tapping a chip scrolls to that domain; while you scroll,
 * the chip for the domain in view lights up and a violet pill slides to it. Each domain is a short list of link rows.
 */
function PhoneResources() {
  const [active, setActive] = useState(0);
  const bar = useRef<HTMLDivElement>(null), row = useRef<HTMLDivElement>(null), pill = useRef<HTMLSpanElement>(null);
  const chips = useRef<(HTMLButtonElement | null)[]>([]), sections = useRef<(HTMLElement | null)[]>([]);
  const locked = useRef(false), placed = useRef(false);

  // Move the pill to the active chip, and bring that chip into view if the row has scrolled it away
  const activeRef = useRef(active);
  useLayoutEffect(() => {
    activeRef.current = active;
    placePill(pill.current, chips.current[active], placed.current); placed.current = true;
    const c = chips.current[active], rw = row.current;
    if (!c || !rw) return;
    if (c.offsetLeft - 20 < rw.scrollLeft || c.offsetLeft + c.offsetWidth + 20 > rw.scrollLeft + rw.clientWidth)
      rw.scrollTo({ left: c.offsetLeft - 20, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [active]);

  // Chip widths change when the web font arrives or the phone rotates: keep the pill on its chip without sliding
  useEffect(() => {
    const ro = new ResizeObserver(() => placePill(pill.current, chips.current[activeRef.current], false));
    chips.current.forEach(c => c && ro.observe(c));
    return () => ro.disconnect();
  }, []);

  // The domain crossing a line about a third of the way down the screen is the active one. The thin band catches a
  // domain crossing that line; the whole-screen observer catches jumps (such as back-to-top) that skip past the band.
  useEffect(() => {
    const update = () => { if (!locked.current) setActive(domainAtLine(sections.current)); };
    const band = new IntersectionObserver(update, { rootMargin: "-35% 0px -64% 0px" }), screen = new IntersectionObserver(update);
    sections.current.forEach(s => { if (s) { band.observe(s); screen.observe(s); } });
    return () => { band.disconnect(); screen.disconnect(); };
  }, []);

  // A tapped chip stays active while the page scrolls to its domain, so the pill doesn't flick through the others
  const unlock = useRef<() => void>(() => {});
  useEffect(() => () => unlock.current(), []);
  const jump = (i: number) => {
    const s = sections.current[i];
    if (!s) return;
    unlock.current();
    setActive(i); locked.current = true;
    let timer = 0;
    const done = () => {
      clearTimeout(timer); window.removeEventListener("scrollend", done);
      locked.current = false; unlock.current = () => {};
      setActive(domainAtLine(sections.current));
    };
    unlock.current = () => { clearTimeout(timer); window.removeEventListener("scrollend", done); locked.current = false; };
    window.addEventListener("scrollend", done);
    timer = window.setTimeout(done, 1200);
    const top = s.getBoundingClientRect().top + window.scrollY - HEADER - (bar.current?.offsetHeight ?? 57);
    window.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    // Like an in-page link: keyboard and screen-reader users continue from the domain they jumped to
    s.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  };

  return (
    <div>
      <div ref={bar} className="sticky top-[56px] z-30 border-b border-line bg-ink/95">
        <nav aria-label="Domains" className="wrap">
          <div ref={row} className="snap-row snap-row-fade relative">
            <span ref={pill} aria-hidden className="group pointer-events-none absolute left-0 top-[6px] h-11 w-0">
              {["h-11 w-11 rounded-full", "h-11 w-px origin-left", "h-11 w-11 rounded-full"].map((c, i) => (
                <span key={i} className={`absolute left-0 top-0 bg-violet transition-transform duration-300 ease-[cubic-bezier(.2,.7,.2,1)] group-data-[still=1]:transition-none ${c}`} />
              ))}
            </span>
            {resources.map((r, i) => (
              <button key={r.domain} type="button" ref={el => { chips.current[i] = el; }} onClick={() => jump(i)} aria-current={active === i ? "true" : undefined}
                className={`chip relative min-h-[44px] whitespace-nowrap ${active === i ? "border-transparent text-white hover:border-transparent hover:text-white" : ""}`}>
                {r.domain}
              </button>
            ))}
          </div>
        </nav>
      </div>
      <div className="wrap pb-2">
        {resources.map((r, i) => (
          <section key={r.domain} ref={el => { sections.current[i] = el; }} className="py-6 last:pb-0">
            <Reveal>
              <h2 tabIndex={-1} className="text-xl font-semibold outline-none">{r.domain}</h2>
              <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
                {r.links.map(l => (
                  <li key={l.url}>
                    <a href={l.url} target="_blank" rel="noopener" className="press flex min-h-[64px] items-center gap-3 px-4 py-2 active:bg-raised">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium leading-tight">{l.title}</span>
                        <span className="mt-1 line-clamp-2 text-[14px] leading-[1.3] text-mute">{l.note}</span>
                        <span className="sr-only"> (opens in a new tab)</span>
                      </span>
                      <ExternalLink size={16} aria-hidden className="shrink-0 text-mute" />
                    </a>
                  </li>
                ))}
              </ul>
            </Reveal>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function Resources() {
  useTitle("Resources", "Free, trustworthy places to keep learning after a workshop, sorted by domain.");
  const phone = useMediaQuery(PHONE);
  return (
    <>
      <PageHeader title="Resources" shape="helix">Free, trustworthy places to keep learning after a workshop, sorted by domain.</PageHeader>
      {phone ? <PhoneResources /> : (
      <div className="wrap mt-6">
        {resources.map(r => (
          <Reveal as="section" key={r.domain} className="grid gap-6 border-b border-line py-12 lg:grid-cols-[280px_1fr]">
            <h2 className="text-xl font-semibold">{r.domain}</h2>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {r.links.map(l => (
                <li key={l.url}>
                  <Tilt className="h-full rounded-2xl" max={7}><a href={l.url} target="_blank" rel="noopener" className="press group flex h-full flex-col rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-violet-soft hover:bg-raised">
                    <span className="flex items-start justify-between gap-3 font-medium">{l.title}<ExternalLink size={16} className="mt-1 shrink-0 text-mute group-hover:text-violet-soft" /></span>
                    <span className="mt-2 text-[15px] text-mute">{l.note}</span>
                  </a></Tilt>
                </li>
              ))}
            </ul>
          </Reveal>
        ))}
      </div>
      )}
    </>
  );
}
