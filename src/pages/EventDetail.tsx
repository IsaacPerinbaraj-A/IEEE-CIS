import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CalendarDays, Clock, MapPin, UserRound, Share2, Check } from "lucide-react";
import { Poster, PosterCard } from "../components/EventCards";
import { events, isUpcoming, formatDate, formatTime, calendarFile, pastEvents } from "../lib/data";
import { useTitle } from "../lib/useTitle";
import NotFound from "./NotFound";
import { Reveal, RevealWords, Tilt } from "../components/Motion";

export default function EventDetail() {
  const { slug } = useParams();
  const e = events.find(x => x.slug === slug);
  useTitle(e?.title || "Event not found", e?.summary, !e);
  const [copied, setCopied] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  if (!e) return <NotFound />;
  const upcoming = isUpcoming(e);
  const more = pastEvents().filter(x => x.slug !== e.slug).slice(0, 4);

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) { try { await navigator.share({ title: e.title, text: e.summary, url }); } catch { /* closed */ } }
    else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  const facts = [
    { Icon: CalendarDays, label: "Date", value: formatDate(e) },
    { Icon: Clock, label: "Time", value: formatTime(e.time) },
    { Icon: MapPin, label: "Venue", value: e.venue },
    { Icon: UserRound, label: "Coordinator", value: e.coordinator },
  ].filter(f => f.value);

  return (
    <>
      <div className="wrap pt-8">
        <Link to={upcoming ? "/events" : "/events?tab=past"} className="text-[15px] text-mute hover:text-cream">Events</Link>
        <span className="mx-2 text-mute/60">/</span><span className="text-[15px]">{e.title}</span>
      </div>
      <article className="wrap mt-8 grid gap-10 lg:grid-cols-[minmax(0,440px)_1fr] lg:gap-16">
        <div className="lg:sticky lg:top-24 lg:self-start">
          {e.poster && !posterFailed
            ? <Tilt className="rounded-3xl" max={8}><img src={e.poster} alt={`${e.title} poster`} onError={() => setPosterFailed(true)} className="w-full rounded-3xl border border-line shadow-[0_30px_80px_-30px_rgba(139,92,246,.7)]" /></Tilt>
            : <div className="aspect-[4/5] overflow-hidden rounded-3xl border border-line"><Poster e={e} /></div>}
        </div>
        <div>
          <p className="text-[15px] text-gold">{[e.series, e.type, e.domain && `${e.domain} domain`].filter(Boolean).join(", ")}</p>
          <RevealWords as="h1" text={e.title} className="h-page mt-3" />
          <p className="mt-5 text-xl text-cream/90">{e.summary}</p>
          <dl className="mt-8 grid gap-4 rounded-2xl border border-line bg-panel p-6 sm:grid-cols-2">
            {facts.map(({ Icon, label, value }) => (
              <div key={label} className="flex gap-3">
                <Icon size={19} className="mt-1 shrink-0 text-violet-soft" />
                <div><dt className="text-[14px] text-mute">{label}</dt><dd>{value}</dd></div>
              </div>
            ))}
          </dl>
          <div className="mt-8 max-w-[62ch] space-y-4 text-lg text-mute"><p>{e.description}</p></div>
          <div className="mt-10 flex flex-wrap gap-3">
            {upcoming && e.register && <a className="btn-gold" href={e.register} target="_blank" rel="noopener">Register</a>}
            {upcoming && e.date && <a className="btn-ghost" href={calendarFile(e)} download={`${e.slug}.ics`}>Add to calendar</a>}
            <button className="btn-ghost" onClick={share}>{copied ? <><Check size={17} /> Link copied</> : <><Share2 size={17} /> Share</>}</button>
          </div>
          {!upcoming && <p className="mt-5 text-[15px] text-mute">This event has ended. Follow us to hear about the next one.</p>}
        </div>
      </article>
      {more.length > 0 && (
        <section className="wrap mt-24 border-t border-line pt-14">
          <RevealWords text="More events" className="h-section" />
          <div className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">{more.map((x, i) => <Reveal key={x.slug} delay={i * 100}><PosterCard e={x} /></Reveal>)}</div>
        </section>
      )}
    </>
  );
}
