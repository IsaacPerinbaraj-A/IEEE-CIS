import { Link } from "react-router-dom";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import PageHeader from "../components/PageHeader";
import { ChevronRight, ExternalLink, Lightbulb } from "lucide-react";
import { CisLogoTile } from "../components/Brand";
import { events, sessions, home, initials, type Member } from "../lib/data";
import { useTitle } from "../lib/useTitle";
import { richText } from "../lib/richText";
import { pillarIcon } from "../lib/icons";
import { prefersReducedMotion } from "../lib/motion";
import { useMediaQuery, PHONE } from "../lib/useMediaQuery";
import { Reveal, RevealWords, Tilt, Marquee } from "../components/Motion";

/**
 * Phones: colour for each event type in the track-record bar. Fixed per type (in the admin's type order), so a type
 * keeps its colour when the counts change; checked for colour-blind separation on the panel colour. Types added
 * later fall back to a neutral tone, and the legend always names every type with its count.
 */
const TYPE_COLORS: Record<string, string> = {
  Workshop: "#8B5CF6", Talk: "#0891B2", Webinar: "#DB2777", Training: "#D9620F", Competition: "#12A06E", Hackathon: "#5B6EE8",
};
const TYPE_ORDER = Object.keys(TYPE_COLORS);
const OTHER_COLOR = "#8A7FA3";

/** True once the element has scrolled into view (straight away with reduced motion), for one-time entrances. */
function useSeen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(prefersReducedMotion);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: "0px 0px -12% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

/** A number that counts up from zero over 600ms once `run` is true (shows the final value with reduced motion). */
function CountUp({ to, run }: { to: number; run: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !run || prefersReducedMotion()) return;
    let raf = 0, t0 = 0;
    const tick = (t: number) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / 600);
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    const wait = window.setTimeout(() => { raf = requestAnimationFrame(tick); }, 150);
    return () => { clearTimeout(wait); cancelAnimationFrame(raf); };
  }, [run, to]);
  return <span ref={ref} aria-hidden>{run && prefersReducedMotion() ? to : 0}</span>;
}

/** Round team photo for the phone team row, with initials when the photo is missing or fails to load. */
function Avatar({ m }: { m: Member }) {
  const [failed, setFailed] = useState(false);
  return m.photo && !failed
    ? <img src={m.photo} alt="" loading="lazy" decoding="async" width={40} height={40} onError={() => setFailed(true)} className="h-full w-full rounded-full object-cover" />
    : <span className="grid h-full w-full place-items-center rounded-full bg-gradient-to-br from-violet-deep to-panel font-display text-[14px] text-violet-soft">{initials(m.name)}</span>;
}

/** Phones: every number comes from events.json at runtime (the total and a count per event type). */
function TrackRecord({ counts, years, label }: { counts: [string, number][]; years: number; label: (t: string, n: number) => string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  // Most frequent type first; ties keep the fixed type order, so neighbouring colours stay the checked pairs
  const rank = (t: string) => { const i = TYPE_ORDER.indexOf(t); return i < 0 ? TYPE_ORDER.length : i; };
  const typeCounts = [...counts].sort((a, b) => b[1] - a[1] || rank(a[0]) - rank(b[0]));
  const total = typeCounts.reduce((s, [, n]) => s + n, 0);
  const color = (t: string) => TYPE_COLORS[t] ?? OTHER_COLOR;
  const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <Reveal>
      <div ref={ref} className="overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="p-5">
          <h3 className="text-lg font-semibold">What we've run so far</h3>
          <p className="mt-3 flex items-center gap-3.5">
            <span className="min-w-[1.3ch] font-display text-[44px] font-semibold leading-none"><CountUp to={total} run={seen} /></span>
            <span className="text-[15px] leading-snug text-mute">
              <span className="sr-only">{total} </span>
              <span className="block text-[17px] font-medium text-cream">{total === 1 ? "event" : "events"}</span>
              across {years} academic {years === 1 ? "year" : "years"} on record
            </span>
          </p>
          {/* One segment per type, sized by its count, with a 2px gap between segments; they grow in once */}
          <div aria-hidden className="mt-5 flex h-3 gap-[2px] overflow-hidden rounded-[4px]">
            {typeCounts.map(([t, n], i) => (
              <span key={t} style={{ flexGrow: n, flexBasis: 0, backgroundColor: color(t), transitionDelay: `${150 + i * 60}ms` }}
                className={`origin-left transition-transform duration-700 ease-[cubic-bezier(.2,.7,.2,1)] ${seen ? "scale-x-100" : "scale-x-0"}`} />
            ))}
          </div>
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[15px] text-mute">
            {typeCounts.map(([t, n]) => (
              <li key={t} className="flex items-center gap-2">
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: color(t) }} />
                {sentence(label(t, n))}{" "}<span className="font-medium text-cream">{n}</span>
              </li>
            ))}
          </ul>
        </div>
        <Link to="/events?tab=past" className="press flex min-h-[48px] items-center justify-between gap-3 border-t border-line px-5 font-medium text-violet-soft active:bg-raised">
          See every event <ChevronRight size={18} aria-hidden />
        </Link>
      </div>
    </Reveal>
  );
}

export default function About() {
  useTitle("About", "IEEE CIS REC is the student chapter of the IEEE Computational Intelligence Society at Rajalakshmi Engineering College, Chennai.");
  const phone = useMediaQuery(PHONE);
  const typeCounts = Object.entries(events.reduce<Record<string, number>>((a, e) => ({ ...a, [e.type]: (a[e.type] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const plural = (t: string, n: number) => n === 1 ? t.toLowerCase() : t === "Training" ? "training programs" : `${t.toLowerCase()}s`;
  const years = new Set(events.map(e => e.session)).size;
  const people = sessions[0].groups.flatMap(g => g.members);
  const teamLine = `${sessions[0].groups.reduce((n, g) => n + g.members.length, 0)} students across ${sessions[0].groups.length} teams in ${sessions[0].label}.`;
  const paragraphs = home.about.paragraphs;
  return (
    <>
      <PageHeader title="About the chapter" shape="sphere">IEEE CIS REC is the student chapter of the IEEE Computational Intelligence Society at Rajalakshmi Engineering College, Chennai.</PageHeader>

      <section className="wrap mt-20 grid gap-12 max-sm:mt-8 lg:grid-cols-2">
        {phone ? (
          // Phones: the first paragraph as the lede, the last one as a pull quote; each paragraph fades in on its own
          <div>
            <Reveal>
              <p className="text-[15px] font-medium text-violet-soft">{home.about.label}</p>
              <RevealWords text={home.about.title} className="h-section mt-3" />
            </Reveal>
            {paragraphs.map((p, i) => {
              const quote = paragraphs.length >= 3 && i === paragraphs.length - 1;
              return (
                <Reveal key={i} className={i === 0 ? "mt-5" : quote ? "mt-7" : "mt-4"}>
                  <p className={i === 0 ? "text-[19px] leading-[1.5] text-cream"
                    : quote ? "border-l-2 border-violet pl-4 text-[18px] leading-[1.5] text-cream/85"
                    : "text-[17px] leading-[1.6] text-mute"}>{richText(p)}</p>
                </Reveal>
              );
            })}
          </div>
        ) : (
          <Reveal>
            <p className="text-[15px] font-medium text-violet-soft">{home.about.label}</p>
            <RevealWords text={home.about.title} className="h-section mt-3" />
            <div className="mt-5 space-y-4 text-lg text-mute">
              {home.about.paragraphs.map((p, i) => <p key={i}>{richText(p)}</p>)}
            </div>
          </Reveal>
        )}
        {phone ? <TrackRecord counts={typeCounts} years={years} label={plural} /> : (
          <Reveal delay={150}><Tilt className="rounded-3xl" max={5}><div className="rounded-3xl border border-line bg-panel p-8">
            <h3 className="text-xl font-semibold">What we've run so far</h3>
            <p className="mt-2 text-mute">Across {years} academic years on record:</p>
            <ul className="mt-6 divide-y divide-line">
              {typeCounts.map(([t, n]) => (
                <li key={t} className="flex items-baseline justify-between py-3"><span className="capitalize">{plural(t, n)}</span><span className="font-display text-2xl text-violet-soft">{n}</span></li>
              ))}
            </ul>
            <Link to="/events?tab=past" className="link mt-6 inline-block">See every event</Link>
          </div></Tilt></Reveal>
        )}
      </section>

      <section className="wrap mt-28 max-sm:mt-12">
        <p className="text-[15px] font-medium text-violet-soft">{home.whatWeDo.label}</p>
        <RevealWords text={home.whatWeDo.title} className="h-section mt-3" />
        {phone ? (
          // Phones: hairline rows instead of tall cards; each icon turns in slightly, once, as its row appears
          <ul className="mt-6 divide-y divide-line border-y border-line">
            {home.whatWeDo.items.map(item => {
              const Icon = pillarIcon[item.icon] ?? Lightbulb;
              return (
                <Reveal as="li" key={item.title} className="group flex gap-4 py-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-raised text-violet-soft transition-transform duration-[600ms] ease-[cubic-bezier(.2,.7,.2,1)] [transform:perspective(400px)_rotateY(-30deg)] group-data-[shown=1]:[transform:none]">
                    <Icon size={22} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-sans text-[17px] font-semibold leading-snug tracking-normal">{item.title}</h3>
                    <p className="mt-1 text-[15.5px] leading-[1.5] text-mute">{item.text}</p>
                  </div>
                </Reveal>
              );
            })}
          </ul>
        ) : (
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {home.whatWeDo.items.map((item, i) => {
            const Icon = pillarIcon[item.icon] ?? Lightbulb;
            return (
              <Reveal key={item.title} delay={(i % 3) * 110} className="h-full">
                <Tilt className="h-full rounded-2xl" max={6}>
                  <div className="h-full rounded-2xl border border-line bg-panel p-6 transition-colors hover:border-violet-soft">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-raised text-violet-soft"><Icon size={22} aria-hidden /></span>
                    <h3 className="mt-5 font-sans text-lg font-semibold">{item.title}</h3>
                    <p className="mt-2 text-mute">{item.text}</p>
                  </div>
                </Tilt>
              </Reveal>
            );
          })}
        </div>
        )}
      </section>

      <div className="mt-28 max-sm:mt-12"><Marquee items={sessions[0].groups.map(g => g.domain).concat(home.whatWeDo.items.map(item => item.title))} /></div>

      {/* Phones: inset like the other cards, the logo keeps its own width, and a full-width button */}
      <section className="wrap mt-28 grid items-start gap-10 rounded-3xl border border-line bg-panel p-8 max-sm:mx-5 max-sm:mt-12 max-sm:w-auto max-sm:gap-6 max-sm:rounded-2xl max-sm:p-6 sm:p-12 lg:grid-cols-[auto_1fr]">
        <CisLogoTile className="px-5 py-4 max-sm:justify-self-start max-sm:px-4 max-sm:py-3" />
        <div>
          <RevealWords text="Part of IEEE CIS worldwide" className="h-section" />
          <p className="mt-4 max-w-[62ch] text-lg text-mute max-sm:text-[17px]">The IEEE Computational Intelligence Society is IEEE's professional society for computational intelligence and related fields. It runs international conferences and competitions and publishes leading journals. As a student chapter, we bring that community to REC.</p>
          {phone
            ? <a href="https://cis.ieee.org" target="_blank" rel="noopener" className="btn-ghost mt-6 min-h-[48px] w-full">Visit IEEE CIS <ExternalLink size={16} aria-hidden /></a>
            : <a href="https://cis.ieee.org" target="_blank" rel="noopener" className="link mt-5 inline-block">Visit IEEE CIS</a>}
        </div>
      </section>

      {phone ? (
        // Phones: one tappable row for the team (faces, how many, where it goes) and the gold join button, full width
        <section className="wrap mt-12 border-t border-line pt-10">
          <RevealWords text="The people behind it" className="h-section" />
          <Reveal className="group mt-5">
            <Link to="/team" className="press flex items-center gap-3 rounded-2xl border border-line bg-panel p-4 active:bg-raised">
              <span className="min-w-0 flex-1">
                <span aria-hidden className="flex">
                  {[...people.filter(m => m.photo), ...people.filter(m => !m.photo)].slice(0, 6).map((m, i) => (
                    <span key={m.name} style={{ transitionDelay: `${i * 40}ms` } as CSSProperties}
                      className="-ml-2.5 h-10 w-10 shrink-0 translate-x-[-8px] rounded-full bg-panel opacity-0 ring-2 ring-panel transition-[transform,opacity] duration-500 ease-[cubic-bezier(.2,.7,.2,1)] first:ml-0 group-data-[shown=1]:translate-x-0 group-data-[shown=1]:opacity-100">
                      <Avatar m={m} />
                    </span>
                  ))}
                  {people.length > 6 && (
                    <span style={{ transitionDelay: "240ms" }}
                      className="-ml-2.5 grid h-10 min-w-10 shrink-0 translate-x-[-8px] place-items-center rounded-full bg-raised px-1.5 text-[14px] font-medium text-cream opacity-0 ring-2 ring-panel transition-[transform,opacity] duration-500 ease-[cubic-bezier(.2,.7,.2,1)] group-data-[shown=1]:translate-x-0 group-data-[shown=1]:opacity-100">
                      +{people.length - 6}
                    </span>
                  )}
                </span>
                <span className="mt-3 block font-semibold">Meet the team</span>
                <span className="mt-0.5 block text-[15px] leading-snug text-mute">{teamLine}</span>
              </span>
              <ChevronRight size={20} aria-hidden className="shrink-0 text-mute" />
            </Link>
          </Reveal>
          <Link to="/join" className="btn-gold mt-3 min-h-[48px] w-full">Join the chapter</Link>
        </section>
      ) : (
        <section className="wrap mt-28 flex flex-col items-start justify-between gap-6 border-t border-line pt-14 md:flex-row md:items-center">
          <div>
            <RevealWords text="The people behind it" className="h-section" />
            <p className="lede mt-3">{teamLine}</p>
          </div>
          <div className="flex gap-3"><Link to="/team" className="btn-ghost">Meet the team</Link><Link to="/join" className="btn-gold">Join the chapter</Link></div>
        </section>
      )}
    </>
  );
}
