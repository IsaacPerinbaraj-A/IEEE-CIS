import { useMemo, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarDays, Filter } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { PosterCard, UpcomingCard } from "../components/EventCards";
import { Reveal } from "../components/Motion";
import { upcomingEvents, pastEvents, sessionLabel, site } from "../lib/data";
import { useTitle } from "../lib/useTitle";
import { revealChip } from "../lib/motion";

/** A friendly panel for when there's nothing to list, with the gold ring from the poster stand-ins. */
function EmptyPanel({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children: ReactNode }) {
  return (
    <div role="status" className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-violet-deep/40 via-panel to-ink p-8 sm:p-12">
      <div aria-hidden className="absolute -right-20 -top-20 h-64 w-64 rounded-full border-[22px] border-gold/60 sm:h-80 sm:w-80" />
      <div aria-hidden className="absolute right-10 top-40 hidden h-20 w-20 rounded-full border-[8px] border-violet-soft/25 sm:block" />
      <div className="relative max-w-[56ch]">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-raised text-violet-soft">{icon}</span>
        <h2 className="mt-6 text-2xl font-semibold sm:text-3xl">{title}</h2>
        <p className="mt-3 text-mute">{text}</p>
        <div className="mt-7 flex flex-wrap gap-3">{children}</div>
      </div>
    </div>
  );
}

export default function Events() {
  useTitle("Events", "Workshops, talks, trainings and competitions in machine learning, data science, computer vision and IoT, run by IEEE CIS REC.");
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
          <div className="snap-row snap-row-fade mt-6 flex gap-2 sm:flex-wrap" role="group" aria-label="Filter by type">
            {types.map(t => (
              <button key={t} aria-pressed={type === t} onClick={e => { set({ type: t === "All" ? "" : t }); revealChip(e.currentTarget); }} className={`chip gap-1.5 ${type === t ? "chip-on" : ""}`}>
                {t} <span className="tabular-nums opacity-70">({t === "All" ? list.length : list.filter(x => x.type === t).length})</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-12">
          {tab === "upcoming" && upcoming.length === 0 && (
            <EmptyPanel icon={<CalendarDays size={22} aria-hidden />} title="Nothing scheduled right now"
              text="New events are announced on Instagram and LinkedIn first. Follow us there, or look through what we've run before.">
              <a className="btn-gold" href={site.instagram} target="_blank" rel="noopener">Follow on Instagram<span className="sr-only"> (opens in a new tab)</span></a>
              <a className="btn-ghost" href={site.linkedin} target="_blank" rel="noopener">Follow on LinkedIn<span className="sr-only"> (opens in a new tab)</span></a>
              <Link className="btn-ghost" to="/events?tab=past">Browse past events</Link>
            </EmptyPanel>
          )}
          {/* A type filter that matches nothing (e.g. an old shared link) */}
          {list.length > 0 && shown.length === 0 && (
            <EmptyPanel icon={<Filter size={22} aria-hidden />} title={`No ${type.toLowerCase()} events here`}
              text={`There are no ${tab} events of this type. Show every event instead.`}>
              <button className="btn-gold" onClick={() => set({ type: "" })}>Show all events</button>
            </EmptyPanel>
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
