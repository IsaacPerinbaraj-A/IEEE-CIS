import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { PosterCard, UpcomingCard } from "../components/EventCards";
import { Reveal } from "../components/Motion";
import { upcomingEvents, pastEvents, sessionLabel, site } from "../lib/data";
import { useTitle } from "../lib/useTitle";

export default function Events() {
  useTitle("Events");
  const [params, setParams] = useSearchParams();
  const upcoming = upcomingEvents(), past = pastEvents();
  const tab = params.get("tab") === "past" || (!params.get("tab") && upcoming.length === 0) ? "past" : "upcoming";
  const type = params.get("type") || "All";
  const list = tab === "upcoming" ? upcoming : past;
  const types = useMemo(() => ["All", ...Array.from(new Set(list.map(e => e.type)))], [list]);
  const shown = list.filter(e => type === "All" || e.type === type);
  const bySession = useMemo(() => {
    const m = new Map<string, typeof shown>();
    shown.forEach(e => m.set(e.session, [...(m.get(e.session) || []), e]));
    return [...m.entries()];
  }, [shown]);

  const set = (next: Record<string, string>) => setParams(p => { Object.entries(next).forEach(([k, v]) => v ? p.set(k, v) : p.delete(k)); return p; }, { replace: true });

  return (
    <>
      <PageHeader title="Events" shape="rings">Workshops, talks, trainings and competitions through the year. Everything here was organised by IEEE CIS REC.</PageHeader>
      <div className="wrap mt-10">
        <div role="tablist" aria-label="Event timing" className="inline-flex rounded-full border border-line p-1">
          {(["upcoming", "past"] as const).map(t => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => set({ tab: t, type: "" })}
              className={`rounded-full px-5 py-2 text-[15px] transition-colors ${tab === t ? "bg-cream text-ink" : "text-mute hover:text-cream"}`}>
              {t === "upcoming" ? "Upcoming" : "Past"} <span className="opacity-70">({t === "upcoming" ? upcoming.length : past.length})</span>
            </button>
          ))}
        </div>
        {list.length > 1 && types.length > 2 && (
          <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter by type">
            {types.map(t => <button key={t} aria-pressed={type === t} onClick={() => set({ type: t === "All" ? "" : t })} className={`chip ${type === t ? "chip-on" : ""}`}>{t}</button>)}
          </div>
        )}

        <div className="mt-12">
          {tab === "upcoming" && upcoming.length === 0 && (
            <div className="rounded-3xl border border-dashed border-line p-8 sm:p-12">
              <h2 className="text-2xl font-semibold">Nothing scheduled right now</h2>
              <p className="mt-3 max-w-[52ch] text-mute">New events are announced on Instagram and LinkedIn first. Follow us there, or look through what we've run before.</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a className="btn-gold" href={site.instagram} target="_blank" rel="noopener">Follow on Instagram</a>
                <Link className="btn-ghost" to="/events?tab=past">Browse past events</Link>
              </div>
            </div>
          )}
          {tab === "upcoming" && <div className="space-y-6">{shown.map((e, i) => <Reveal key={e.slug} delay={i * 120}><UpcomingCard e={e} /></Reveal>)}</div>}
          {tab === "past" && bySession.map(([s, evs]) => (
            <section key={s} className="mb-16">
              <div className="mb-8 flex items-baseline gap-4 border-b border-line pb-4">
                <h2 className="text-2xl font-semibold">{sessionLabel(s)}</h2>
                <span className="text-mute">{evs.length} {evs.length === 1 ? "event" : "events"}</span>
              </div>
              <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">{evs.map((e, i) => <Reveal key={e.slug} delay={(i % 4) * 100}><PosterCard e={e} /></Reveal>)}</div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
