import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { AreaGlyph } from "../components/Icons";
import { CisLogoTile } from "../components/Brand";
import { events, sessions } from "../lib/data";
import { useTitle } from "../lib/useTitle";
import { Reveal, RevealWords, Tilt, Marquee } from "../components/Motion";

const areas = [
  { kind: "neural", title: "Neural networks", text: "Layers of simple units that learn patterns from data. The foundation of deep learning and large language models." },
  { kind: "fuzzy", title: "Fuzzy systems", text: "Reasoning with \"mostly\" and \"a little\" instead of strict true or false. Used in control systems and decision support." },
  { kind: "evolution", title: "Evolutionary computation", text: "Algorithms that breed better solutions over generations, keeping the fittest. Good for problems too big to brute-force." },
  { kind: "swarm", title: "Swarm intelligence", text: "Many simple agents following simple rules, finding answers together. The particles on our home page end as one." },
] as const;

export default function About() {
  useTitle("About", "IEEE CIS REC is the student chapter of the IEEE Computational Intelligence Society at Rajalakshmi Engineering College, Chennai.");
  const typeCounts = Object.entries(events.reduce<Record<string, number>>((a, e) => ({ ...a, [e.type]: (a[e.type] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const plural = (t: string, n: number) => n === 1 ? t.toLowerCase() : t === "Training" ? "training programs" : `${t.toLowerCase()}s`;
  return (
    <>
      <PageHeader title="About the chapter" shape="sphere">IEEE CIS REC is the student chapter of the IEEE Computational Intelligence Society at Rajalakshmi Engineering College, Chennai.</PageHeader>

      <section className="wrap mt-20 grid gap-12 lg:grid-cols-2">
        <Reveal>
          <RevealWords text="Our mission" className="h-section" />
          <p className="mt-5 text-lg text-mute">To help students push the boundaries of computational intelligence through hands-on learning and collaboration, in areas like machine learning, data science and IoT, while building leadership and professional skills along the way.</p>
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
        <RevealWords text="What computational intelligence covers" className="h-section max-w-[22ch]" />
        <p className="lede mt-4">The four core areas of the IEEE Computational Intelligence Society. Gold in each drawing marks the best result: the output, the fittest, the goal.</p>
        <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {areas.map((a, i) => (
            <Reveal key={a.title} delay={i * 110} className="border-t border-line pt-8">
              <AreaGlyph kind={a.kind} />
              <h3 className="mt-6 text-lg font-semibold">{a.title}</h3>
              <p className="mt-2 text-mute">{a.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <div className="mt-28"><Marquee items={sessions[0].groups.map(g => g.domain).concat(["Neural Networks", "Fuzzy Systems", "Evolutionary Computation", "Swarm Intelligence"])} /></div>

      <section className="wrap mt-28 grid items-start gap-10 rounded-3xl border border-line bg-panel p-8 sm:p-12 lg:grid-cols-[auto_1fr]">
        <CisLogoTile className="px-5 py-4" />
        <div>
          <RevealWords text="Part of IEEE CIS worldwide" className="h-section" />
          <p className="mt-4 max-w-[62ch] text-lg text-mute">The IEEE Computational Intelligence Society is IEEE's professional society for neural networks, fuzzy systems, evolutionary computation and related fields. It runs international conferences and competitions and publishes leading journals. As a student chapter, we bring that community to REC.</p>
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
