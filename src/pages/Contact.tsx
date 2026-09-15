import { useState } from "react";
import { Mail, MapPin } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { Linkedin, Instagram } from "../lib/icons";
import { site } from "../lib/data";
import { useTitle } from "../lib/useTitle";
import { Reveal, Tilt } from "../components/Motion";

const topics = ["Joining the chapter", "An event", "Collaboration or sponsorship", "Something else"];

export default function Contact() {
  useTitle("Contact", "Questions about joining, an idea for an event, or a collaboration? Reach IEEE CIS REC by email, Instagram or LinkedIn.");
  const [f, setF] = useState({ name: "", email: "", topic: topics[0], message: "" });
  const [error, setError] = useState("");
  const send = () => {
    if (!f.name.trim() || !f.message.trim()) { setError("Add your name and a message so we know who's writing and what about."); return; }
    setError("");
    const body = `${f.message}\n\n${f.name}${f.email ? ` (${f.email})` : ""}`;
    window.location.href = `mailto:${site.email}?subject=${encodeURIComponent(`${f.topic}: message from ${f.name}`)}&body=${encodeURIComponent(body)}`;
  };
  const field = "mt-2 w-full rounded-xl border border-line bg-ink px-4 py-3 text-cream placeholder:text-mute/60 focus:border-violet-soft focus:outline-none";
  const channels = [
    { Icon: Mail, label: "Email", value: site.email, href: `mailto:${site.email}` },
    { Icon: Instagram, label: "Instagram", value: "@ieee_cis_rec", href: site.instagram },
    { Icon: Linkedin, label: "LinkedIn", value: "IEEE CIS REC", href: site.linkedin },
    { Icon: MapPin, label: "Campus", value: `${site.college}, ${site.city}`, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.mapQuery)}` },
  ];
  return (
    <>
      <PageHeader title="Contact" shape="ripple">Questions about joining, an idea for an event, or a collaboration? We read everything.</PageHeader>
      <section className="wrap mt-14 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <ul className="min-w-0 space-y-3">
          {channels.map(({ Icon, label, value, href }, i) => (
            <Reveal as="li" key={label} delay={i * 90}>
              <Tilt className="rounded-2xl" max={6}><a href={href} target={href.startsWith("mailto") ? undefined : "_blank"} rel="noopener" className="flex items-center gap-4 rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-violet-soft hover:bg-raised">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-raised text-violet-soft"><Icon size={19} /></span>
                <span className="min-w-0"><span className="block text-[14px] text-mute">{label}</span><span className="block truncate">{value}</span></span>
              </a></Tilt>
            </Reveal>
          ))}
        </ul>
        <Reveal delay={150} className="min-w-0 rounded-3xl border border-line bg-panel p-6 sm:p-9">
          <h2 className="text-2xl font-semibold">Send a message</h2>
          <p className="mt-2 text-[15px] text-mute">This opens your email app with the message filled in.</p>
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <label className="text-[15px]">Your name<input className={field} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} autoComplete="name" /></label>
            <label className="text-[15px]">Your email <span className="text-mute">(optional)</span><input type="email" className={field} value={f.email} onChange={e => setF({ ...f, email: e.target.value })} autoComplete="email" /></label>
          </div>
          <label className="mt-5 block text-[15px]">Topic
            <select className={field} value={f.topic} onChange={e => setF({ ...f, topic: e.target.value })}>{topics.map(t => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="mt-5 block text-[15px]">Message<textarea rows={5} className={field} value={f.message} onChange={e => setF({ ...f, message: e.target.value })} /></label>
          {error && <p role="alert" className="mt-4 text-[15px] text-gold">{error}</p>}
          <button className="btn-gold mt-6" onClick={send}>Write the email</button>
        </Reveal>
      </section>
      <section className="wrap mt-16">
        <iframe title="Map showing Rajalakshmi Engineering College" loading="lazy" referrerPolicy="no-referrer-when-downgrade"
          className="h-[360px] w-full rounded-3xl border border-line [filter:invert(.9)_hue-rotate(200deg)_saturate(.6)]"
          src={`https://www.google.com/maps?q=${encodeURIComponent(site.mapQuery)}&output=embed`} />
      </section>
    </>
  );
}
