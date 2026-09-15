import { Link } from "react-router-dom";
import type { CSSProperties } from "react";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import ParticleStory from "../components/particles/ParticleStory";
import { Reveal, RevealWords, Tilt, Marquee, Magnetic, RollLabel, PlayWhenVisible } from "../components/Motion";
import { CisLogoTile } from "../components/Brand";
import { PosterCard } from "../components/EventCards";
import { domainIcon } from "../lib/icons";
import { upcomingEvents, pastEvents, events, sessions, formatDate, formatTime, home } from "../lib/data";
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

export default function Home() {
  useTitle();
  const next = upcomingEvents()[0];
  const spotlight = next || pastEvents().find(e => e.date);
  const recent = pastEvents().slice(0, 4);
  const current = sessions[0];
  const groups = current.groups;

  const hero = (
    <div className="wrap hero-wrap relative w-full">
      <div className="hero-copy">
        <div className="intro-item flex flex-wrap items-center gap-4" style={d(0)}>
          <CisLogoTile />
          <p className="max-w-[30ch] text-[15px] leading-snug text-mute">{home.hero.eyebrow}</p>
        </div>
        <h1 className="hero-title intro-item mt-8 font-semibold leading-[1.04] tracking-[-0.03em]" style={d(120)}>{home.hero.title}</h1>
        <p className="intro-item mt-4 font-display text-[clamp(1rem,1.7vw,1.3rem)] font-medium tracking-tight text-violet-soft" style={d(200)}>{home.hero.tagline}</p>
        <p className="hero-lede intro-item mt-5 max-w-[56ch] text-[17px] text-cream/80 sm:text-lg" style={d(280)}>{home.hero.intro}</p>
        <div className="intro-item mt-8 flex flex-wrap gap-3" style={d(360)}>
          <Magnetic><Link to={home.hero.primaryLink} className="btn-gold"><RollLabel>{home.hero.primaryLabel}</RollLabel></Link></Magnetic>
          <Link to={home.hero.secondaryLink} className="btn-ghost bg-ink/40 backdrop-blur">{home.hero.secondaryLabel}</Link>
        </div>
        {/* The next (or latest) event, reachable from the first screen */}
        {spotlight && (
          <div className="intro-item mt-6" style={d(480)}>
            <Link to={`/events/${spotlight.slug}`} className="group inline-flex max-w-full items-center gap-2.5 rounded-full border border-line bg-ink/50 py-2 pl-3.5 pr-4 text-[14px] text-mute backdrop-blur transition-colors hover:border-violet-soft hover:text-cream">
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
  const steps = items.map((item, i) => {
    const color = STEP_COLORS[i % STEP_COLORS.length];
    return (
      <div key={item.title} className="wrap w-full">
        <Reveal className="step-card rounded-3xl border border-line/80 bg-ink/60 p-7 backdrop-blur-md sm:p-9">
          <p className="flex items-center gap-3 text-[15px] text-mute">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 16px ${color}` }} />
            {home.whatWeDo.label} · {i + 1} of {items.length}
          </p>
          {i === 0 && <p className="mt-3 font-display text-lg font-medium text-violet-soft">{home.whatWeDo.title}</p>}
          <h2 className="h-section mt-4">{item.title}</h2>
          <p className="mt-4 text-lg text-cream/85">{item.text}</p>
        </Reveal>
      </div>
    );
  });

  return (
    <>
      <ParticleStory hero={hero} steps={steps} labels={items.map(item => item.title)} skipTo={spotlight ? "home-next-event" : undefined} />

      {/* Next (or latest) event */}
      {spotlight && (
        <div id="home-next-event" className="scroll-mt-28">
        <Reveal className="wrap relative z-10 mt-14 sm:mt-20">
          <Link to={`/events/${spotlight.slug}`} className="group flex flex-col gap-5 rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-violet-soft sm:flex-row sm:items-center sm:p-6">
            {spotlight.poster && <img src={spotlight.poster} alt="" onError={ev => { ev.currentTarget.hidden = true; }} className="h-20 w-20 shrink-0 rounded-xl object-cover" />}
            <div className="min-w-0 flex-1">
              <p className={`text-[14px] ${next ? "text-gold" : "text-mute"}`}>{next ? "Next event" : "Most recent event"}</p>
              <p className="mt-1 font-display text-xl font-semibold group-hover:text-violet-soft">{spotlight.title}</p>
              <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-mute">
                <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} />{formatDate(spotlight)}{spotlight.time ? `, ${formatTime(spotlight.time)}` : ""}</span>
                {spotlight.venue && <span className="inline-flex items-center gap-1.5"><MapPin size={15} />{spotlight.venue}</span>}
              </p>
            </div>
            <span className={next ? "btn-gold shrink-0" : "btn-ghost shrink-0"}>{next ? "Details and registration" : "See what happened"}</span>
          </Link>
        </Reveal>
        </div>
      )}

      {/* Event names, moving with your scroll */}
      <div className="mt-16 sm:mt-24"><Marquee items={events.map(e => e.title.split(":")[0])} /></div>

      {/* Domains */}
      <section className="wrap mt-20 grid gap-10 sm:mt-28 sm:gap-12 lg:grid-cols-[minmax(0,380px)_1fr]">
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <RevealWords text="Nine teams, one chapter" className="h-section" />
          <p className="lede mt-4">Five technical domains do the learning and building. Four more keep the chapter running. Pick the one that fits you.</p>
          <Link to="/team" className="link mt-6 inline-block">Meet the {current.label} team</Link>
        </Reveal>
        <div>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            {Object.keys(technical).map(k => groups.find(g => g.slug === k)).filter((g): g is NonNullable<typeof g> => !!g).map((g, i) => {
              const Icon = domainIcon[g.slug];
              const heads = g.members.filter(m => /head/i.test(m.role)).map(m => m.name);
              return (
                <Reveal key={g.slug} delay={i * 90} className={i === 0 ? "sm:col-span-2" : ""}>
                  <Tilt className="h-full rounded-2xl" max={6}>
                    {/* Phones: icon beside the text in a compact row; larger screens: a tile */}
                    <Link to={`/team?domain=${g.slug}`} className="group flex h-full items-start gap-4 rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-violet-soft hover:bg-raised sm:block sm:p-6">
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
                    <Link to={`/team?domain=${g.slug}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-panel">
                      <Icon size={20} className="shrink-0 text-mute" />
                      <span><span className="block font-medium">{g.domain}</span><span className="block text-[14px] text-mute">{support[g.slug]}</span></span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* Recent events */}
      <section className="wrap mt-20 sm:mt-28">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <RevealWords text="Recent events" className="h-section" />
            <p className="lede mt-3">From Power BI and AWS to LLMs and IoT hardware.</p>
          </div>
          <Link to="/events?tab=past" className="btn-ghost">All events</Link>
        </Reveal>
        {/* Phones swipe through the posters sideways instead of scrolling past four tall cards */}
        <div className="snap-row snap-row-cards mt-8 sm:mt-10 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4">
          {recent.map((e, i) => <Reveal key={e.slug} delay={i * 110}><PosterCard e={e} /></Reveal>)}
        </div>
      </section>

      {/* About */}
      <Reveal as="section" className="wrap mt-20 grid gap-10 border-t border-line pt-12 sm:mt-28 sm:pt-16 lg:grid-cols-2">
        <div>
          <p className="text-[15px] font-medium text-violet-soft">{home.about.label}</p>
          <RevealWords text={home.about.title} className="h-section mt-3 max-w-[20ch]" />
        </div>
        <div className="space-y-5 text-lg text-mute">
          {home.about.paragraphs.slice(0, 2).map((p, i) => <p key={i}>{richText(p)}</p>)}
          <Link to="/about" className="link inline-block text-base">More about the society</Link>
        </div>
      </Reveal>

      {/* Join */}
      <Reveal as="section" className="wrap mt-20 sm:mt-28">
        <PlayWhenVisible className="join-band relative overflow-hidden rounded-3xl border border-violet/40 p-8 sm:p-12">
          <div aria-hidden className="join-ring absolute -bottom-24 -right-16 h-72 w-72 rounded-full border-[28px] border-gold/80" />
          <div className="relative max-w-[640px]">
            <RevealWords text="Join IEEE CIS REC" className="h-section" />
            <p className="mt-4 text-lg text-cream/85">Become an IEEE student member, add the Computational Intelligence Society, and tell us you've joined. All three steps happen online.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Magnetic><Link to="/join" className="btn-gold"><RollLabel>How to join</RollLabel></Link></Magnetic>
              <Link to="/contact" className="btn-ghost">Ask us a question</Link>
            </div>
          </div>
        </PlayWhenVisible>
      </Reveal>
    </>
  );
}
