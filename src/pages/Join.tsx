import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import Accordion from "../components/Accordion";
import faqs from "../data/faqs.json";
import { site } from "../lib/data";
import { useTitle } from "../lib/useTitle";
import { Reveal, Tilt } from "../components/Motion";

const steps = [
  { title: "Become an IEEE student member", text: "Sign up on the IEEE website using your college email.", cta: "Go to IEEE membership", href: "https://www.ieee.org/membership/join" },
  { title: "Add the Computational Intelligence Society", text: "Add CIS to your IEEE membership so you count as a member of the chapter.", cta: "Visit IEEE CIS", href: "https://cis.ieee.org" },
  { title: "Tell us you've joined", text: "Fill in the chapter form so we can add you to the member group and invite you to events.", cta: "Open the chapter form", href: site.memberForm },
];
const benefits = [
  ["Hands-on workshops", "Machine learning, data science, computer vision, IoT, cloud and security."],
  ["Placement preparation", "Sessions like Placement Unfiltered on resumes and interviews."],
  ["A team to build with", "Join a domain team and work on real projects with seniors."],
  ["Leadership roles", "Run events, design posters or lead a domain as an office bearer."],
  ["The IEEE network", "Access IEEE and CIS resources and a global professional community."],
  ["Competitions", "Challenges like ANALYTICA, and support for hackathons like SIH."],
];

export default function Join() {
  useTitle("Join");
  return (
    <>
      <PageHeader title="Join the chapter" shape="swarm">Open to every REC student, in any department and any year. You don't need to know AI yet, just want to learn it.</PageHeader>

      <section className="wrap mt-16">
        <ol className="grid gap-6 lg:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal as="li" key={s.title} delay={i * 130}><Tilt className="h-full rounded-3xl" max={6}><div className="flex h-full flex-col rounded-3xl border border-line bg-panel p-7">
              <span className="font-display text-5xl font-semibold text-gold">{i + 1}</span>
              <h2 className="mt-6 text-xl font-semibold">{s.title}</h2>
              <p className="mt-3 text-mute">{s.text}</p>
              {s.href
                ? <a href={s.href} target="_blank" rel="noopener" className="btn-ghost mt-6 self-start">{s.cta}</a>
                : <p className="mt-auto pt-6 text-[14px] text-mute">The form link will be added soon. Until then, <a className="link" href={`mailto:${site.email}`}>email us</a>.</p>}
            </div></Tilt></Reveal>
          ))}
        </ol>
      </section>

      <section className="wrap mt-28 grid gap-12 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div><h2 className="h-section">What you get</h2><p className="lede mt-4">Here's what the chapter is actually for.</p></div>
        <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {benefits.map(([t, d], i) => (
            <Reveal as="li" key={t} delay={(i % 2) * 120} className="border-l-2 border-violet pl-5"><h3 className="font-sans text-lg font-semibold">{t}</h3><p className="mt-1 text-mute">{d}</p></Reveal>
          ))}
        </ul>
      </section>

      <section className="wrap mt-28 grid gap-12 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div>
          <h2 className="h-section">Questions</h2>
          <p className="lede mt-4">Something else? <Link to="/contact" className="link">Get in touch</Link>.</p>
        </div>
        <Reveal><Accordion items={faqs} /></Reveal>
      </section>
    </>
  );
}
