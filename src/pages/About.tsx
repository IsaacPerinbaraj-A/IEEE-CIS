import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { Lightbulb } from "lucide-react";
import { CisLogoTile } from "../components/Brand";
import { events, sessions, home } from "../lib/data";
import { useTitle } from "../lib/useTitle";
import { richText } from "../lib/richText";
import { pillarIcon } from "../lib/icons";
import { Reveal, RevealWords, Tilt, Marquee } from "../components/Motion";

export default function About() {
  useTitle("About", "IEEE CIS REC is the student chapter of the IEEE Computational Intelligence Society at Rajalakshmi Engineering College, Chennai.");
  const typeCounts = Object.entries(events.reduce<Record<string, number>>((a, e) => ({ ...a, [e.type]: (a[e.type] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const plural = (t: string, n: number) => n === 1 ? t.toLowerCase() : t === "Training" ? "training programs" : `${t.toLowerCase()}s`;
  return (
    <>
      <PageHeader title="About the chapter" shape="sphere">IEEE CIS REC is the student chapter of the IEEE Computational Intelligence Society at Rajalakshmi Engineering College, Chennai.</PageHeader>

      <section className="wrap mt-20 grid gap-12 lg:grid-cols-2">
        <Reveal>
          <p className="text-[15px] font-medium text-violet-soft">{home.about.label}</p>
          <RevealWords text={home.about.title} className="h-section mt-3" />
          <div className="mt-5 space-y-4 text-lg text-mute">
            {home.about.paragraphs.map((p, i) => <p key={i}>{richText(p)}</p>)}
          </div>
        </Reveal>
        <Reveal delay={150}><Tilt className="rounded-3xl" max={5}><div className="rounded-3xl border border-line bg-panel p-8">
          <h3 className="text-xl font-semibold">What we've run so far</h3>
          <p className="mt-2 text-mute">Across {new Set(events.map(e => e.session)).size} academic years on record:</p>
          <ul className="mt-6 divide-y divide-line">
            {typeCounts.map(([t, n]) => (
              <li key={t} className="flex items-baseline justify-between py-3"><span className="capitalize">{plural(t, n)}</span><span className="font-display text-2xl text-violet-soft">{n}</span></li>
            ))}
          </ul>
          <Link to="/events?tab=past" className="link mt-6 inline-block">See every event</Link>
        </div></Tilt></Reveal>
      </section>

      <section className="wrap mt-28">
        <p className="text-[15px] font-medium text-violet-soft">{home.whatWeDo.label}</p>
        <RevealWords text={home.whatWeDo.title} className="h-section mt-3" />
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
      </section>

      <div className="mt-28"><Marquee items={sessions[0].groups.map(g => g.domain).concat(home.whatWeDo.items.map(item => item.title))} /></div>

      <section className="wrap mt-28 grid items-start gap-10 rounded-3xl border border-line bg-panel p-8 sm:p-12 lg:grid-cols-[auto_1fr]">
        <CisLogoTile className="px-5 py-4" />
        <div>
          <RevealWords text="Part of IEEE CIS worldwide" className="h-section" />
          <p className="mt-4 max-w-[62ch] text-lg text-mute">The IEEE Computational Intelligence Society is IEEE's professional society for computational intelligence and related fields. It runs international conferences and competitions and publishes leading journals. As a student chapter, we bring that community to REC.</p>
          <a href="https://cis.ieee.org" target="_blank" rel="noopener" className="link mt-5 inline-block">Visit IEEE CIS</a>
        </div>
      </section>

      <section className="wrap mt-28 flex flex-col items-start justify-between gap-6 border-t border-line pt-14 md:flex-row md:items-center">
        <div>
          <RevealWords text="The people behind it" className="h-section" />
          <p className="lede mt-3">{sessions[0].groups.reduce((n, g) => n + g.members.length, 0)} students across {sessions[0].groups.length} teams in {sessions[0].label}.</p>
        </div>
        <div className="flex gap-3"><Link to="/team" className="btn-ghost">Meet the team</Link><Link to="/join" className="btn-gold">Join the chapter</Link></div>
      </section>
    </>
  );
}
