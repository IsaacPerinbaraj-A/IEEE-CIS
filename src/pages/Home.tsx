import { Link } from "react-router-dom";
import type { CSSProperties } from "react";
import { CalendarDays, MapPin } from "lucide-react";
import ParticleStory from "../components/particles/ParticleStory";
import { Reveal, Tilt, Marquee } from "../components/Motion";
import { CisLogoTile } from "../components/Brand";
import { PosterCard } from "../components/EventCards";
import { domainIcon } from "../lib/icons";
import { upcomingEvents, pastEvents, events, sessions, formatDate, formatTime } from "../lib/data";
import { useTitle } from "../lib/useTitle";

const technical: Record<string, string> = {
  "machine-learning": "Models that learn from data, from classic algorithms to neural networks and LLMs.",
  "data-science": "Cleaning, analysing and visualising data to answer real questions.",
  "computer-vision": "Teaching machines to understand images and video.",
  iot: "Sensors, microcontrollers and connected devices you can build and hold.",
  "web-development": "Building the chapter's web presence, including this site.",
};
const support: Record<string, string> = {
  management: "Runs the chapter", design: "Posters and visual identity",
  "event-management": "Plans and runs every event", "public-relations": "Outreach and social media",
};

const ideas = [
  { title: "Neural networks", color: "#22D3EE",
    text: "Layers of simple units that learn patterns from data. Stack enough of them and you get image recognition and large language models.",
    where: <>We covered them in the <Link className="link" to="/events/llm-tuned">LLM Tuned</Link> workshop.</> },
  { title: "Fuzzy systems", color: "#F472B6",
    text: "Reasoning with \"mostly\" and \"a little\" instead of strict true or false. Each hill is a membership function, and one value can belong to several at once.",
    where: <>Used in control systems, home appliances and decision support.</> },
  { title: "Evolutionary computation", color: "#F2B544",
    text: "Algorithms that breed better solutions over many generations, keeping the fittest and mutating the rest. The helix is a nod to the DNA idea behind them.",
    where: <>Used for scheduling, design and optimisation problems too big to brute-force.</> },
  { title: "Swarm intelligence", color: "#22D3EE",
    text: "Many simple agents following simple rules, finding answers together, like a flock of birds. Every particle here is now moving on its own.",
    where: <>Used in routing, robotics and search.</> },
];
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
          <p className="max-w-[30ch] text-[15px] leading-snug text-mute">Student chapter at Rajalakshmi Engineering College, Chennai</p>
        </div>
        <h1 className="hero-title intro-item mt-8 font-semibold leading-[1.04] tracking-[-0.03em]" style={d(120)}>Where REC learns how machines learn.</h1>
        <p className="hero-lede intro-item mt-6 max-w-[44ch] text-lg text-cream/80" style={d(240)}>Workshops, talks, trainings and competitions in machine learning, data science, computer vision and IoT, run by students for students.</p>
        <div className="intro-item mt-9 flex flex-wrap gap-3" style={d(360)}>
          <Link to="/join" className="btn-gold">Join the chapter</Link>
          <Link to="/events" className="btn-ghost bg-ink/40 backdrop-blur">See our events</Link>
        </div>
      </div>
      <div className="hero-cue intro-item absolute bottom-8 left-5 flex items-center gap-4 sm:left-8" style={d(700)}>
        <span aria-hidden className="scroll-cue block h-9 w-6 shrink-0 rounded-full border-2 border-mute/60" />
        <p className="max-w-[34ch] text-[14px] leading-snug text-mute">Move your cursor through the particles, then scroll to watch them become the four ideas of computational intelligence.</p>
      </div>
    </div>
  );

  const steps = ideas.map((idea, i) => (
    <div key={idea.title} className="wrap w-full">
      <Reveal className="step-card rounded-3xl border border-line/80 bg-ink/60 p-7 backdrop-blur-md sm:p-9">
        <p className="flex items-center gap-3 text-[15px] text-mute">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: idea.color, boxShadow: `0 0 16px ${idea.color}` }} />
          {i + 1} of 4
        </p>
        <h2 className="h-section mt-4">{idea.title}</h2>
        <p className="mt-4 text-lg text-cream/85">{idea.text}</p>
        <p className="mt-6 border-t border-line pt-4 text-[15px] text-mute">{idea.where}</p>
      </Reveal>
    </div>
  ));

  return (
    <>
      <ParticleStory hero={hero} steps={steps} />

      {/* Next (or latest) event */}
      {spotlight && (
        <Reveal className="wrap relative z-10 mt-20">
          <Link to={`/events/${spotlight.slug}`} className="group flex flex-col gap-5 rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-violet-soft sm:flex-row sm:items-center sm:p-6">
            {spotlight.poster && <img src={spotlight.poster} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />}
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
      )}

      {/* Event names, moving with your scroll */}
      <div className="mt-24"><Marquee items={events.map(e => e.title.split(":")[0])} /></div>

      {/* Domains */}
      <section className="wrap mt-28 grid gap-12 lg:grid-cols-[minmax(0,380px)_1fr]">
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <h2 className="h-section">Nine teams, one chapter</h2>
          <p className="lede mt-4">Five technical domains do the learning and building. Four more keep the chapter running. Pick the one that fits you.</p>
          <Link to="/team" className="link mt-6 inline-block">Meet the {current.label} team</Link>
        </Reveal>
        <div>
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.keys(technical).map(k => groups.find(g => g.slug === k)).filter((g): g is NonNullable<typeof g> => !!g).map((g, i) => {
              const Icon = domainIcon[g.slug];
              const heads = g.members.filter(m => /head/i.test(m.role)).map(m => m.name);
              return (
                <Reveal key={g.slug} delay={i * 90} className={i === 0 ? "sm:col-span-2" : ""}>
                  <Tilt className="h-full rounded-2xl" max={6}>
                    <Link to={`/team?domain=${g.slug}`} className="group block h-full rounded-2xl border border-line bg-panel p-6 transition-colors hover:border-violet-soft hover:bg-raised">
                      <Icon className="text-violet-soft" size={26} />
                      <h3 className="mt-5 text-xl font-semibold">{g.domain}</h3>
                      <p className="mt-2 text-mute">{technical[g.slug]}</p>
                      <p className="mt-4 text-[14px] text-mute/90">{heads.length ? `Led by ${heads.join(" and ")}` : `${g.members.length} members`}</p>
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
      <section className="wrap mt-28">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="h-section">Recent events</h2>
            <p className="lede mt-3">From Power BI and AWS to LLMs and IoT hardware.</p>
          </div>
          <Link to="/events?tab=past" className="btn-ghost">All events</Link>
        </Reveal>
        <div className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {recent.map((e, i) => <Reveal key={e.slug} delay={i * 110}><PosterCard e={e} /></Reveal>)}
        </div>
      </section>

      {/* About */}
      <Reveal as="section" className="wrap mt-28 grid gap-10 border-t border-line pt-16 lg:grid-cols-2">
        <h2 className="h-section max-w-[18ch]">Learn the ideas underneath the AI hype.</h2>
        <div className="space-y-5 text-lg text-mute">
          <p>Computational intelligence is the part of AI that borrows from nature: brains, human reasoning, evolution and flocks. It powers the tools you use every day.</p>
          <p>We're the REC chapter of the IEEE Computational Intelligence Society. We help students learn these ideas properly, build with them, and get ready for placements.</p>
          <Link to="/about" className="link inline-block text-base">More about the chapter</Link>
        </div>
      </Reveal>

      {/* Join */}
      <Reveal as="section" className="wrap mt-28">
        <div className="join-band relative overflow-hidden rounded-3xl border border-violet/40 p-8 sm:p-12">
          <div aria-hidden className="join-ring absolute -bottom-24 -right-16 h-72 w-72 rounded-full border-[28px] border-gold/80" />
          <div className="relative max-w-[640px]">
            <h2 className="h-section">Join IEEE CIS REC</h2>
            <p className="mt-4 text-lg text-cream/85">Become an IEEE student member, add the Computational Intelligence Society, and tell us you've joined. All three steps happen online.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/join" className="btn-gold">How to join</Link>
              <Link to="/contact" className="btn-ghost">Ask us a question</Link>
            </div>
          </div>
        </div>
      </Reveal>
    </>
  );
}
