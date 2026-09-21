import { Link } from "react-router-dom";
import { useState, useRef, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, CalendarDays, ChevronDown, ChevronRight, Lightbulb, MapPin } from "lucide-react";
import ParticleStory from "../components/particles/ParticleStory";
import WhatWeDoDeck from "../components/WhatWeDoDeck";
import { Reveal, RevealWords, Tilt, Marquee, Magnetic, RollLabel, PlayWhenVisible } from "../components/Motion";
import { CisLogoTile } from "../components/Brand";
import { PosterCard } from "../components/EventCards";
import { domainIcon, pillarIcon } from "../lib/icons";
import { upcomingEvents, pastEvents, events, sessions, formatDate, formatTime, countdown, home } from "../lib/data";
import { useMediaQuery, PHONE } from "../lib/useMediaQuery";
import { useTitle } from "../lib/useTitle";
import { richText } from "../lib/richText";

const technical: Record<string, string> = {
  "machine-learning": "Models that learn from data, from classic algorithms to deep learning and LLMs.",
  "data-science": "Cleaning, analysing and visualising data to answer real questions.",
  "computer-vision": "Teaching machines to understand images and video.",
  iot: "Sensors, microcontrollers and connected devices you can build and hold.",
  "web-development": "Building the chapter's web presence, including this site.",
};
const support: Record<string, string> = {
  management: "Runs the chapter", design: "Posters and visual identity",
  "event-management": "Plans and runs every event", "public-relations": "Outreach and social media",
};

/** Dot colour for each "What We Do" step, matching the particle formation that arrives with it (ParticleStory COLORS). */
const STEP_COLORS = ["#22D3EE", "#F2B544", "#A78BFA", "#F472B6", "#22D3EE", "#F2B544"];
const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

/** Phones: a long paragraph shows about four lines, with a button that opens the rest. */
function ReadMore({ id, children }: { id: string; children: ReactNode }) {
  const [open, setOpen] = useState(false), [height, setHeight] = useState<number>();
  const box = useRef<HTMLDivElement>(null);
  const toggle = () => { setHeight(box.current?.scrollHeight); setOpen(o => !o); };
  return (
    <div>
      <div id={id} ref={box} className={`read-more ${open ? "is-open" : ""}`} style={open ? { maxHeight: height } : undefined}>{children}</div>
      <button type="button" onClick={toggle} aria-expanded={open} aria-controls={id}
        className="press mt-1 inline-flex min-h-[44px] items-center gap-1.5 text-[15px] font-medium text-violet-soft">
        {open ? "Show less" : "Read more"}
        <ChevronDown size={16} aria-hidden className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
    </div>
  );
}

export default function Home() {
  useTitle();
  const phone = useMediaQuery(PHONE);
  const next = upcomingEvents()[0];
  const spotlight = next || pastEvents().find(e => e.date);
  const recent = pastEvents().slice(0, 4);
  const current = sessions[0];
  const groups = current.groups;

  const hero = (
    <div className="wrap hero-wrap relative w-full">
      {/* Phones: title, tagline, both buttons and the event link fit on the first screen; the intro paragraph follows */}
      <div className="hero-copy max-sm:flex max-sm:flex-col">
        <div className="intro-item flex flex-wrap items-center gap-4" style={d(0)}>
          <CisLogoTile />
          <p className="max-w-[30ch] text-[15px] leading-snug text-mute">{home.hero.eyebrow}</p>
        </div>
        <h1 className="hero-title intro-item mt-8 font-semibold leading-[1.04] tracking-[-0.03em]" style={d(120)}>{home.hero.title}</h1>
        <p className="intro-item mt-4 font-display text-[clamp(1rem,1.7vw,1.3rem)] font-medium tracking-tight text-violet-soft" style={d(200)}>{home.hero.tagline}</p>
        <p className="hero-lede intro-item mt-5 max-w-[56ch] text-[17px] text-cream/80 max-sm:order-last max-sm:mt-7 sm:text-lg" style={d(280)}>{home.hero.intro}</p>
        <div className="intro-item mt-8 flex flex-wrap gap-3 max-sm:mt-7 max-sm:flex-col" style={d(360)}>
          <Magnetic className="max-sm:w-full"><Link to={home.hero.primaryLink} className="btn-gold max-sm:min-h-[50px] max-sm:w-full"><RollLabel>{home.hero.primaryLabel}</RollLabel></Link></Magnetic>
          <Link to={home.hero.secondaryLink} className="btn-ghost bg-ink/40 backdrop-blur max-sm:min-h-[50px] max-sm:w-full">{home.hero.secondaryLabel}</Link>
        </div>
        {/* The next (or latest) event, reachable from the first screen */}
        {spotlight && (
          <div className="intro-item mt-6" style={d(480)}>
            <Link to={`/events/${spotlight.slug}`} className="press group inline-flex max-w-full items-center gap-2.5 rounded-full border border-line bg-ink/50 py-2 pl-3.5 pr-4 text-[14px] text-mute backdrop-blur transition-colors hover:border-violet-soft hover:text-cream max-sm:flex max-sm:min-h-[44px] max-sm:w-full">
              <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${next ? "bg-gold" : "bg-violet-soft"}`} />
              <span className="shrink-0">{next ? "Next event" : "Latest event"}</span>
              <span className="truncate font-medium text-cream">{spotlight.title}</span>
              <ArrowRight size={15} aria-hidden className="shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        )}
      </div>
      <div className="hero-cue intro-item absolute bottom-8 left-5 flex items-center gap-4 sm:left-8" style={d(700)}>
        <span aria-hidden className="scroll-cue block h-9 w-6 shrink-0 rounded-full border-2 border-mute/60" />
        <p className="max-w-[34ch] text-[14px] leading-snug text-mute">Move your cursor through the particles, then scroll to see what we do.</p>
      </div>
    </div>
  );

  // "What We Do": one scroll step per item, each arriving with its own particle formation
  // The particle story has six formations (ParticleStory STEPS), so it shows the first six items
  const items = home.whatWeDo.items.slice(0, 6);
  // Cards alternate sides on wide screens (step-card-right); the particles sit on the other side
  const steps = items.map((item, i) => {
    const color = STEP_COLORS[i % STEP_COLORS.length];
    const Icon = pillarIcon[item.icon] ?? Lightbulb;
    return (
      <div key={item.title} className="wrap w-full">
        <Reveal className={`step-card relative overflow-hidden rounded-3xl border border-line/80 bg-ink/60 p-7 backdrop-blur-md sm:p-10 ${i % 2 ? "step-card-right" : ""}`}>
          <span aria-hidden className="step-number pointer-events-none absolute -right-1 -top-5 font-display text-[clamp(6rem,11vw,9.5rem)] font-semibold leading-none">{String(i + 1).padStart(2, "0")}</span>
          <div className="relative">
            <p className="flex items-center gap-3 text-[15px] text-mute">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-raised" style={{ color }}><Icon size={20} aria-hidden /></span>
              {home.whatWeDo.label} · {i + 1} of {items.length}
            </p>
            {i === 0 && <p className="mt-4 font-display text-lg font-medium text-violet-soft">{home.whatWeDo.title}</p>}
            <h2 className="mt-4 text-[clamp(1.8rem,3.3vw,2.8rem)] font-semibold">{item.title}</h2>
            <p className="mt-4 text-lg text-cream/85 sm:text-xl">{item.text}</p>
          </div>
        </Reveal>
      </div>
    );
  });

  return (
    <>
      <ParticleStory hero={hero} steps={steps}
        deck={<WhatWeDoDeck label={home.whatWeDo.label} title={home.whatWeDo.title} items={items} colors={STEP_COLORS} />} />

      {/* Next (or latest) event. Phones only show it for an upcoming event (the hero link already names the latest one). */}
      {spotlight && (
        <Reveal className={`wrap relative z-10 mt-14 sm:mt-20 ${next ? "" : "max-sm:hidden"}`}>
          <Link to={`/events/${spotlight.slug}`} className="press group flex items-center gap-4 rounded-2xl border border-line bg-panel p-4 transition-colors hover:border-violet-soft sm:gap-5 sm:p-6">
            {spotlight.poster && <img src={spotlight.poster} alt="" onError={ev => { ev.currentTarget.hidden = true; }} className="h-[100px] w-20 shrink-0 rounded-xl object-cover sm:h-20" />}
            <div className="min-w-0 flex-1">
              <p className={`text-[14px] ${next ? "text-gold" : "text-mute"}`}>
                {next ? "Next event" : "Most recent event"}{next && <span className="sm:hidden"> · {countdown(next)}</span>}
              </p>
              <p className="mt-1 font-display text-xl font-semibold group-hover:text-violet-soft max-sm:line-clamp-2 max-sm:text-lg">{spotlight.title}</p>
              <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-mute">
                <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} />{formatDate(spotlight)}{spotlight.time ? `, ${formatTime(spotlight.time)}` : ""}</span>
                {spotlight.venue && <span className="inline-flex items-center gap-1.5"><MapPin size={15} />{spotlight.venue}</span>}
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-[14px] font-medium text-gold sm:hidden">Details and registration <ArrowRight size={14} aria-hidden /></span>
            </div>
            <span className={`${next ? "btn-gold" : "btn-ghost"} shrink-0 max-sm:hidden`}>{next ? "Details and registration" : "See what happened"}</span>
          </Link>
        </Reveal>
      )}

      {/* Event names, moving with your scroll */}
      <div className="mt-16 sm:mt-24"><Marquee items={events.map(e => e.title.split(":")[0])} /></div>

      {/* Domains */}
      <section className="wrap mt-20 grid gap-10 sm:mt-28 sm:gap-12 lg:grid-cols-[minmax(0,380px)_1fr]">
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <RevealWords text="Nine teams, one chapter" className="h-section" />
          <p className="lede mt-4">Five technical domains do the learning and building. Four more keep the chapter running. Pick the one that fits you.</p>
          <Link to="/team" className="link mt-6 inline-block max-sm:hidden">Meet the {current.label} team</Link>
        </Reveal>
        {phone ? (
          <Reveal>
            <p className="text-[14px] font-medium text-mute">Technical domains · {Object.keys(technical).length}</p>
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
              {Object.keys(technical).map(k => groups.find(g => g.slug === k)).filter((g): g is NonNullable<typeof g> => !!g).map(g => {
                const Icon = domainIcon[g.slug];
                return (
                  <li key={g.slug}>
                    <Link to={`/team?domain=${g.slug}`} className="press flex min-h-[76px] items-center gap-3.5 px-4 py-3.5 active:bg-raised">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-raised text-violet-soft"><Icon size={20} aria-hidden /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{g.domain}</span>
                        <span className="mt-0.5 line-clamp-2 text-[14px] leading-snug text-mute">{technical[g.slug]}</span>
                      </span>
                      <ChevronRight size={18} aria-hidden className="shrink-0 text-mute" />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="mt-7 text-[14px] font-medium text-mute">Running the chapter · {groups.filter(g => support[g.slug]).length}</p>
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
              {groups.filter(g => support[g.slug]).map(g => {
                const Icon = domainIcon[g.slug];
                return (
                  <li key={g.slug}>
                    <Link to={`/team?domain=${g.slug}`} className="press flex min-h-[64px] items-center gap-3.5 px-4 py-3 active:bg-raised">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-raised text-mute"><Icon size={19} aria-hidden /></span>
                      <span className="min-w-0 flex-1"><span className="block font-medium">{g.domain}</span><span className="block text-[14px] text-mute">{support[g.slug]}</span></span>
                      <ChevronRight size={18} aria-hidden className="shrink-0 text-mute" />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Link to="/team" className="btn-ghost mt-6 min-h-[48px] w-full">Meet the {current.label} team</Link>
          </Reveal>
        ) : (
        <div>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            {Object.keys(technical).map(k => groups.find(g => g.slug === k)).filter((g): g is NonNullable<typeof g> => !!g).map((g, i) => {
              const Icon = domainIcon[g.slug];
              const heads = g.members.filter(m => /head/i.test(m.role)).map(m => m.name);
              return (
                <Reveal key={g.slug} delay={i * 90} className={i === 0 ? "sm:col-span-2" : ""}>
                  <Tilt className="h-full rounded-2xl" max={6}>
                    {/* Phones: icon beside the text in a compact row; larger screens: a tile */}
                    <Link to={`/team?domain=${g.slug}`} className="press group flex h-full items-start gap-4 rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-violet-soft hover:bg-raised sm:block sm:p-6">
                      <Icon className="mt-0.5 shrink-0 text-violet-soft" size={26} />
                      <div className="min-w-0 sm:mt-5">
                        <h3 className="text-lg font-semibold sm:text-xl">{g.domain}</h3>
                        <p className="mt-1 text-[15px] text-mute sm:mt-2 sm:text-[17px]">{technical[g.slug]}</p>
                        <p className="mt-2 text-[14px] text-mute/90 sm:mt-4">{heads.length ? `Led by ${heads.join(" and ")}` : `${g.members.length} members`}</p>
                      </div>
                    </Link>
                  </Tilt>
                </Reveal>
              );
            })}
          </div>
          <Reveal delay={200}>
            <ul className="mt-4 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
              {groups.filter(g => support[g.slug]).map(g => {
                const Icon = domainIcon[g.slug];
                return (
                  <li key={g.slug} className="bg-ink">
                    <Link to={`/team?domain=${g.slug}`} className="press flex items-center gap-4 px-5 py-4 transition-colors hover:bg-panel active:bg-panel">
                      <Icon size={20} className="shrink-0 text-mute" />
                      <span><span className="block font-medium">{g.domain}</span><span className="block text-[14px] text-mute">{support[g.slug]}</span></span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Reveal>
        </div>
        )}
      </section>

      {/* Recent events */}
      <section className="wrap mt-20 sm:mt-28">
        <Reveal className="flex flex-wrap items-end justify-between gap-4 max-sm:items-center max-sm:gap-y-1">
          <div className="max-sm:contents">
            <RevealWords text="Recent events" className="h-section" />
            <p className="lede mt-3 max-sm:order-2 max-sm:mt-0 max-sm:w-full">From Power BI and AWS to LLMs and IoT hardware.</p>
          </div>
          <Link to="/events?tab=past" className="btn-ghost max-sm:hidden">All events</Link>
          <Link to="/events?tab=past" className="press inline-flex min-h-[44px] items-center gap-1 text-[15px] font-medium text-violet-soft sm:hidden">All events <ArrowRight size={15} aria-hidden /></Link>
        </Reveal>
        {/* Phones swipe through smaller posters sideways, ending on a "See all" tile */}
        {phone ? (
          <Reveal className="snap-row snap-row-cards snap-row-66 mt-6">
            {recent.map(e => <div key={e.slug}><PosterCard e={e} compact /></div>)}
            <Link to="/events?tab=past" className="press flex aspect-[4/5] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-panel/60 p-5 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-raised text-violet-soft"><ArrowRight size={20} aria-hidden /></span>
              <span className="font-semibold">See all events</span>
              <span className="text-[14px] text-mute">{events.length} so far</span>
            </Link>
          </Reveal>
        ) : (
          <div className="mt-8 sm:mt-10 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4">
            {recent.map((e, i) => <Reveal key={e.slug} delay={i * 110}><PosterCard e={e} /></Reveal>)}
          </div>
        )}
      </section>

      {/* About */}
      <Reveal as="section" className="wrap mt-20 grid gap-10 border-t border-line pt-12 sm:mt-28 sm:pt-16 lg:grid-cols-2">
        <div>
          <p className="text-[15px] font-medium text-violet-soft">{home.about.label}</p>
          <RevealWords text={home.about.title} className="h-section mt-3 max-w-[20ch]" />
        </div>
        <div className="space-y-5 text-lg text-mute max-sm:space-y-4 max-sm:text-[17px]">
          {home.about.paragraphs.slice(0, 2).map((p, i) => phone && i === 1
            ? <ReadMore key={i} id="about-more"><p>{richText(p)}</p></ReadMore>
            : <p key={i} className={i === 0 ? "max-sm:text-cream/85" : ""}>{richText(p)}</p>)}
          <Link to="/about" className="link inline-block text-base max-sm:inline-flex max-sm:min-h-[44px] max-sm:items-center">More about the society</Link>
        </div>
      </Reveal>

      {/* Join */}
      <Reveal as="section" className="wrap mt-20 sm:mt-28">
        <PlayWhenVisible className="join-band relative overflow-hidden rounded-3xl border border-violet/40 p-6 sm:p-12">
          <div aria-hidden className="join-ring absolute -bottom-24 -right-16 h-72 w-72 rounded-full border-[28px] border-gold/80 max-sm:-bottom-16 max-sm:-right-14 max-sm:h-40 max-sm:w-40 max-sm:border-[18px]" />
          <div className="relative max-w-[640px]">
            <RevealWords text="Join IEEE CIS REC" className="h-section" />
            <p className="mt-4 text-lg text-cream/85 max-sm:text-[17px]">Become an IEEE student member, add the Computational Intelligence Society, and tell us you've joined. All three steps happen online.</p>
            <div className="mt-8 flex flex-wrap gap-3 max-sm:mt-6 max-sm:flex-col">
              <Magnetic className="max-sm:w-full"><Link to="/join" className="btn-gold max-sm:min-h-[50px] max-sm:w-full"><RollLabel>How to join</RollLabel></Link></Magnetic>
              <Link to="/contact" className="btn-ghost max-sm:min-h-[50px] max-sm:w-full max-sm:bg-ink/40">Ask us a question</Link>
            </div>
          </div>
        </PlayWhenVisible>
      </Reveal>
    </>
  );
}
