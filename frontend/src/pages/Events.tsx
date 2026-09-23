import { useEffect, useMemo, useRef, type MouseEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarDays, Filter } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { EventRow, PosterCard, UpcomingCard } from "../components/EventCards";
import { Reveal } from "../components/Motion";
import { upcomingEvents, pastEvents, sessionLabel, site, type ChapterEvent } from "../lib/data";
import { useTitle } from "../lib/useTitle";
import { prefersReducedMotion, revealChip } from "../lib/motion";
import { useMediaQuery, PHONE } from "../lib/useMediaQuery";

/** A friendly panel for when there's nothing to list, with the gold ring from the poster stand-ins. Compact on phones. */
function EmptyPanel({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children: ReactNode }) {
  return (
    <div role="status" className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-violet-deep/40 via-panel to-ink p-8 max-sm:p-6 sm:p-12">
      <div aria-hidden className="absolute -right-20 -top-20 h-64 w-64 rounded-full border-[22px] border-gold/60 max-sm:-right-14 max-sm:-top-14 max-sm:h-36 max-sm:w-36 max-sm:border-[14px] sm:h-80 sm:w-80" />
      <div aria-hidden className="absolute right-10 top-40 hidden h-20 w-20 rounded-full border-[8px] border-violet-soft/25 sm:block" />
      <div className="relative max-w-[56ch]">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-raised text-violet-soft max-sm:h-11 max-sm:w-11">{icon}</span>
        <h2 className="mt-6 text-2xl font-semibold max-sm:mt-5 max-sm:text-xl sm:text-3xl">{title}</h2>
        <p className="mt-3 text-mute max-sm:mt-2">{text}</p>
        <div className="mt-7 flex flex-wrap gap-3 max-sm:mt-6 max-sm:flex-col max-sm:[&>*]:min-h-[48px]">{children}</div>
      </div>
    </div>
  );
}

type Tab = "upcoming" | "past";

/**
 * Phones: Upcoming / Past as one full-width 48px segmented control. The light thumb slides to the chosen side.
 * The buttons fill the whole height (the thumb sits 4px inside), so each tab is a full-size tap target.
 */
function Segmented({ tab, counts, onPick }: { tab: Tab; counts: Record<Tab, number>; onPick: (t: Tab) => void }) {
  return (
    <div role="tablist" aria-label="Event timing" className="relative grid h-12 grid-cols-2 rounded-full border border-line">
      <span aria-hidden className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-cream transition-transform duration-[280ms] ease-[cubic-bezier(.2,.7,.2,1)]"
        style={{ transform: tab === "past" ? "translateX(100%)" : "none" }} />
      {(["upcoming", "past"] as const).map(t => {
        const on = tab === t;
        // Two copies of the label crossfade (mute on the dark track, ink on the light thumb), so only opacity animates
        const label = (cls: string) => (
          <>
            {t === "upcoming" ? "Upcoming" : "Past"}
            <span className={`min-w-[1.5rem] rounded-full px-1.5 text-center text-[14px] leading-6 tabular-nums ${cls}`}>{counts[t]}</span>
          </>
        );
        return (
          <button key={t} role="tab" aria-selected={on} onClick={() => onPick(t)} className="relative rounded-full text-[15px] font-medium">
            <span className={`flex h-full items-center justify-center gap-2 text-mute transition-opacity duration-[280ms] ${on ? "opacity-0" : ""}`}>{label("bg-raised")}</span>
            <span aria-hidden className={`absolute inset-0 flex items-center justify-center gap-2 text-ink transition-opacity duration-[280ms] ${on ? "" : "opacity-0"}`}>{label("bg-ink/10")}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Notes which event is being opened from this list, so that event's "Events" control can go back here and keep your
 * place (EventDetail reads it under the same name). Cleared when you leave the list, so it never goes stale.
 */
const OPENED = "events-opened";
const markOpened = (ev: MouseEvent<HTMLElement>) => {
  const href = (ev.target as Element).closest("a[href]")?.getAttribute("href");
  try { if (href) sessionStorage.setItem(OPENED, href); } catch { /* storage blocked */ }
};

/** Phones: a list of event rows. Rows fade in as they scroll into view, with a short stagger. */
function Rows({ list }: { list: ChapterEvent[] }) {
  return <ul onClickCapture={markOpened} className="divide-y divide-line/70">{list.map((e, i) => <Reveal as="li" key={e.slug} delay={Math.min(i, 3) * 50}><EventRow e={e} /></Reveal>)}</ul>;
}

export default function Events() {
  useTitle("Events", "Workshops, talks, trainings and competitions in machine learning, data science, computer vision and IoT, run by IEEE CIS REC.");
  const [params, setParams] = useSearchParams();
  const phone = useMediaQuery(PHONE);
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

  // A row tapped without opening its event (e.g. opened in a new tab) must not count for a later visit
  useEffect(() => () => { try { sessionStorage.removeItem(OPENED); } catch { /* storage blocked */ } }, []);

  // Phones: the list crossfades in when you switch between Upcoming and Past (not on the first load)
  const listRef = useRef<HTMLDivElement>(null), lastTab = useRef(tab);
  useEffect(() => {
    if (lastTab.current === tab) return;
    lastTab.current = tab;
    const el = listRef.current;
    if (!el || prefersReducedMotion()) return;
    const anim = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
    return () => anim.cancel();
  }, [tab]);

  const noUpcoming = (
    <EmptyPanel icon={<CalendarDays size={22} aria-hidden />} title="Nothing scheduled right now"
      text="New events are announced on Instagram and LinkedIn first. Follow us there, or look through what we've run before.">
      <a className="btn-gold" href={site.instagram} target="_blank" rel="noopener">Follow on Instagram<span className="sr-only"> (opens in a new tab)</span></a>
      <a className="btn-ghost" href={site.linkedin} target="_blank" rel="noopener">Follow on LinkedIn<span className="sr-only"> (opens in a new tab)</span></a>
      <Link className="btn-ghost" to="/events?tab=past">Browse past events</Link>
    </EmptyPanel>
  );
  // A type filter that matches nothing (e.g. an old shared link)
  const noMatch = (
    <EmptyPanel icon={<Filter size={22} aria-hidden />} title={`No ${type.toLowerCase()} events here`}
      text={`There are no ${tab} events of this type. Show every event instead.`}>
      <button className="btn-gold" onClick={() => set({ type: "" })}>Show all events</button>
    </EmptyPanel>
  );

  if (phone) {
    return (
      <>
        <PageHeader title="Events" shape="rings">Workshops, talks, trainings and competitions through the year. Everything here was organised by IEEE CIS REC.</PageHeader>
        <div className="wrap mt-8">
          <Segmented tab={tab} counts={{ upcoming: upcoming.length, past: past.length }} onPick={t => set({ tab: t, type: "" })} />
          {list.length > 1 && types.length > 2 && (
            <div className="snap-row snap-row-fade mt-3 flex gap-2" role="group" aria-label="Filter by type">
              {types.map(t => (
                <button key={t} aria-pressed={type === t} onClick={e => { set({ type: t === "All" ? "" : t }); revealChip(e.currentTarget); }} className={`chip min-h-[44px] gap-2 ${type === t ? "chip-on" : ""}`}>
                  {t} <span className="tabular-nums opacity-70">{t === "All" ? list.length : list.filter(x => x.type === t).length}</span>
                </button>
              ))}
            </div>
          )}

          <div ref={listRef} className="mt-5">
            {tab === "upcoming" && upcoming.length === 0 && noUpcoming}
            {/* Nothing coming up: a slim note at the top of the past events, since Past opens by default */}
            {tab === "past" && upcoming.length === 0 && (
              <Reveal className="mb-4">
                <div role="status" className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-line bg-panel py-1.5 pl-3 pr-1.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-raised text-violet-soft"><CalendarDays size={18} aria-hidden /></span>
                  <p className="min-w-0 flex-1 text-[15px] leading-snug">Nothing scheduled yet</p>
                  <a className="press inline-flex min-h-[44px] shrink-0 items-center rounded-full px-3.5 text-[15px] font-medium text-violet-soft active:bg-raised" href={site.instagram} target="_blank" rel="noopener">
                    Follow<span className="sr-only"> on Instagram (opens in a new tab)</span>
                  </a>
                </div>
              </Reveal>
            )}
            {list.length > 0 && shown.length === 0 && noMatch}
            {tab === "upcoming" && shown.length > 0 && <Rows list={shown} />}
            {tab === "past" && bySession.map(([s, evs]) => (
              <section key={s} className="mb-6">
                {/* Sticks under the slim header while you scroll through that year, like a phone contacts list */}
                <div className="sticky top-[56px] z-20 -mx-5 flex h-12 items-center gap-2 border-b border-line bg-ink/95 px-5">
                  <h2 className="text-[16px] font-semibold">{sessionLabel(s)}</h2>
                  <span className="text-[15px] text-mute"><span aria-hidden>· </span>{evs.length} {evs.length === 1 ? "event" : "events"}</span>
                </div>
                <Rows list={evs} />
              </section>
            ))}
          </div>
        </div>
      </>
    );
  }

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
          {tab === "upcoming" && upcoming.length === 0 && noUpcoming}
          {list.length > 0 && shown.length === 0 && noMatch}
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
