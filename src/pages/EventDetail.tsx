import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useNavigationType, useParams } from "react-router-dom";
import { CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, Clock, ExternalLink, MapPin, Share2, UserRound } from "lucide-react";
import { EventRow, Poster, PosterCard } from "../components/EventCards";
import PosterViewer from "../components/PosterViewer";
import CalendarSheet from "../components/CalendarSheet";
import StickyAction from "../components/StickyAction";
import { events, isUpcoming, formatDate, formatTime, calendarDataUri, pastEvents, upcomingEvents, statusLabel } from "../lib/data";
import { useTitle } from "../lib/useTitle";
import { useMediaQuery, PHONE } from "../lib/useMediaQuery";
import { prefersReducedMotion } from "../lib/motion";
import NotFound from "./NotFound";
import { Reveal, RevealWords, Tilt } from "../components/Motion";

/** Google Maps search for a venue, or "" when the venue is online only (there is nothing to find on a map). */
const mapsUrl = (venue?: string) =>
  venue && !/\b(online|google meet|zoom|webinar)\b/i.test(venue) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}` : "";

/**
 * Phones: was this history entry opened straight from the Events list? The list notes the event you tap (OPENED,
 * written by the Events page); the entry's key is then remembered for this tab, so it still counts after going
 * forward and back or reloading. The entry before it stays the list, so "Events" can simply go back.
 */
const OPENED = "events-opened", FROM_LIST = "events-from-list";
function openedFromList(key: string, pathname: string, pushed: boolean) {
  if (key === "default") return false;
  try {
    const keys = JSON.parse(sessionStorage.getItem(FROM_LIST) || "[]") as unknown;
    const seen = Array.isArray(keys) ? keys.filter((k): k is string => typeof k === "string") : [];
    if (seen.includes(key)) return true;
    if (!pushed || sessionStorage.getItem(OPENED) !== pathname) return false;
    sessionStorage.removeItem(OPENED);
    sessionStorage.setItem(FROM_LIST, JSON.stringify([...seen, key].slice(-20)));
    return true;
  } catch { return false; }
}

/** Phones: one 56px fact row with an icon tile. */
function Fact({ Icon, label, children, sub, trailing }: { Icon: ElementType; label: string; children: ReactNode; sub?: string; trailing?: ReactNode }) {
  return (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-raised text-violet-soft"><Icon size={19} aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] leading-5 text-mute">{label}</span>
        <span className="block leading-6">{children}</span>
        {sub && <span className="block text-[15px] leading-6 text-cream/80">{sub}</span>}
      </span>
      {trailing}
    </>
  );
}

export default function EventDetail() {
  const { slug } = useParams();
  const e = events.find(x => x.slug === slug);
  useTitle(e?.title || "Event not found", e?.summary, !e);
  const [copied, setCopied] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const phone = useMediaQuery(PHONE);
  const location = useLocation(), navigate = useNavigate(), navType = useNavigationType();
  // Worked out once when the page opens (the check uses up the list's note; running it again gives the same answer)
  const [fromList] = useState(() => openedFromList(location.key, location.pathname, navType === "PUSH"));
  const [viewer, setViewer] = useState(false), [sheet, setSheet] = useState(false), [bar, setBar] = useState(false);
  // Leaving the phone layout (turning the phone sideways) closes the viewer and the sheet, so they don't reopen by themselves later
  const [wasPhone, setWasPhone] = useState(phone);
  if (wasPhone !== phone) { setWasPhone(phone); setViewer(false); setSheet(false); }
  const posterBtn = useRef<HTMLButtonElement>(null), calendarBtn = useRef<HTMLButtonElement>(null), settle = useRef<HTMLDivElement>(null);
  const copiedTimer = useRef(0);
  const upcoming = !!e && isUpcoming(e);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  // Phones: the action bar slides up just after the page has come in
  useEffect(() => {
    if (!phone || !upcoming) return;
    const t = window.setTimeout(() => setBar(true), prefersReducedMotion() ? 0 : 350);
    return () => clearTimeout(t);
  }, [phone, upcoming]);

  // Phones: the poster settles in, tipping back from a slight angle as it fades up
  useEffect(() => {
    const el = settle.current;
    if (!el || prefersReducedMotion()) return;
    const anim = el.animate([{ opacity: 0, transform: "perspective(900px) rotateX(8deg) translateY(12px)" }, { opacity: 1, transform: "none" }],
      { duration: 600, delay: 120, easing: "cubic-bezier(.2,.7,.2,1)", fill: "backwards" });
    return () => anim.cancel();
  }, [phone]);

  if (!e) return <NotFound />;
  const more = pastEvents().filter(x => x.slug !== e.slug).slice(0, 4);

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) { try { await navigator.share({ title: e.title, text: e.summary, url }); } catch { /* closed */ } }
    else {
      try { await navigator.clipboard.writeText(url); } catch { return; }
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const facts = [
    { Icon: CalendarDays, label: "Date", value: formatDate(e) },
    { Icon: Clock, label: "Time", value: formatTime(e.time) },
    { Icon: MapPin, label: "Venue", value: e.venue },
    { Icon: UserRound, label: "Coordinator", value: e.coordinator },
  ].filter(f => f.value);

  if (phone) {
    const hasPoster = !!e.poster && !posterFailed;
    const time = formatTime(e.time), maps = mapsUrl(e.venue);
    const listHref = upcoming ? "/events" : "/events?tab=past";
    // "Events" goes back when this page was opened from the Events list (keeping your place in it), otherwise it opens the list
    const backCls = "press -ml-2 inline-flex min-h-[44px] items-center gap-0.5 rounded-full pl-1 pr-3 text-[15px] text-mute active:bg-raised";
    // Upcoming events first, then past events that have a poster
    const moreRows = [...upcomingEvents(), ...pastEvents().filter(x => x.poster), ...pastEvents().filter(x => !x.poster)].filter(x => x.slug !== e.slug).slice(0, 3);
    const shareLabel = (short: boolean) => copied ? <><Check size={17} aria-hidden /> {short ? "Copied" : "Link copied"}</> : <><Share2 size={17} aria-hidden /> Share</>;

    return (
      <>
        <div className="wrap pt-2">
          {fromList
            ? <button type="button" onClick={() => navigate(-1)} className={backCls}><ChevronLeft size={20} aria-hidden />Events</button>
            : <Link to={listHref} className={backCls}><ChevronLeft size={20} aria-hidden />Events</Link>}
        </div>

        <article className="wrap">
          {/* Poster band: its height is reserved up front, so nothing jumps when the poster loads */}
          <div className="relative -mx-5 mt-1 overflow-hidden py-5">
            {/* Behind it, a blurred copy of the poster (a plain glow on low-power devices), fading out at the top and bottom */}
            <div aria-hidden className="absolute inset-0 [-webkit-mask-image:linear-gradient(180deg,transparent,#000_22%,#000_68%,transparent)] [mask-image:linear-gradient(180deg,transparent,#000_22%,#000_68%,transparent)]">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(91,59,168,.55),rgba(24,17,40,.6)_60%,transparent)]" />
              {hasPoster && <img alt="" src={e.poster} decoding="async" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-2xl [html[data-tier=low]_&]:hidden" />}
            </div>
            <div className="relative flex h-[min(46svh,calc(100vw-40px))] justify-center">
              <div ref={settle} className="h-full">
                {hasPoster ? (
                  <button ref={posterBtn} type="button" onClick={() => setViewer(true)} aria-haspopup="dialog" className="press block h-full rounded-2xl">
                    <Tilt className="h-full rounded-2xl" max={3}>
                      <img src={e.poster} alt={`${e.title} poster`} onError={() => setPosterFailed(true)}
                        className="h-full w-auto max-w-[calc(100vw-40px)] rounded-2xl border border-line object-contain shadow-[0_24px_60px_-24px_rgba(139,92,246,.7)]" />
                    </Tilt>
                    <span className="sr-only">. View full screen</span>
                  </button>
                ) : (
                  <div className="aspect-[4/5] h-full overflow-hidden rounded-2xl border border-line"><Poster e={e} /></div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className={`inline-flex h-7 items-center rounded-full px-3 text-[14px] font-medium ${upcoming ? "bg-violet/20 text-violet-soft" : "bg-raised text-mute"}`}>{statusLabel(e)}</span>
            <p className="text-[15px] text-gold">{[e.series, e.type, e.domain && `${e.domain} domain`].filter(Boolean).join(", ")}</p>
          </div>
          <RevealWords as="h1" text={e.title} className="mt-3 text-[28px] font-semibold leading-[1.15]" />
          <p className="mt-4 text-[17px] text-cream/90">{e.summary}</p>

          <ul className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
            <li className="flex min-h-[56px] items-center gap-3.5 px-4 py-2.5">
              <Fact Icon={CalendarDays} label={time ? "Date and time" : "Date"} sub={time}>{formatDate(e)}</Fact>
            </li>
            {e.venue && (
              <li>
                {maps ? (
                  <a href={maps} target="_blank" rel="noopener" className="press flex min-h-[56px] items-center gap-3.5 px-4 py-2.5 active:bg-raised">
                    <Fact Icon={MapPin} label="Venue" trailing={<ExternalLink size={17} aria-hidden className="shrink-0 text-mute" />}>
                      {e.venue}<span className="sr-only"> (opens Google Maps in a new tab)</span>
                    </Fact>
                  </a>
                ) : (
                  <div className="flex min-h-[56px] items-center gap-3.5 px-4 py-2.5"><Fact Icon={MapPin} label="Venue">{e.venue}</Fact></div>
                )}
              </li>
            )}
            {e.coordinator && (
              <li className="flex min-h-[56px] items-center gap-3.5 px-4 py-2.5"><Fact Icon={UserRound} label="Coordinator">{e.coordinator}</Fact></li>
            )}
          </ul>

          {!upcoming && (
            <>
              <button className="btn-ghost mt-4 min-h-[48px] w-full" onClick={share}>{shareLabel(false)}</button>
              <p className="mt-3 text-[15px] text-mute">This event has ended. Follow us to hear about the next one.</p>
            </>
          )}
          <div className="mt-8 space-y-4 text-[17px] leading-relaxed text-mute"><p>{e.description}</p></div>
        </article>

        {moreRows.length > 0 && (
          <section className="wrap mt-12 border-t border-line pt-10">
            <RevealWords text="More events" className="h-section" />
            <ul className="mt-4 divide-y divide-line/70">
              {moreRows.map((x, i) => <Reveal as="li" key={x.slug} delay={i * 50}><EventRow e={x} /></Reveal>)}
              <Reveal as="li" delay={150}>
                <Link to="/events" className="press -mx-5 flex min-h-[56px] items-center justify-between gap-3 px-5 font-medium text-violet-soft active:bg-raised/60">
                  All events <ChevronRight size={18} aria-hidden />
                </Link>
              </Reveal>
            </ul>
          </section>
        )}

        {hasPoster && (
          <PosterViewer open={viewer} src={e.poster!} alt={`${e.title} poster`} onClose={() => { setViewer(false); posterBtn.current?.focus({ preventScroll: true }); }} />
        )}
        {upcoming && (
          <>
            <CalendarSheet open={sheet} e={e} onClose={() => { setSheet(false); calendarBtn.current?.focus({ preventScroll: true }); }} />
            <StickyAction show={bar} label="Event actions">
              {e.register && <a className="btn-gold min-h-[48px] min-w-0 flex-1 whitespace-nowrap px-4" href={e.register} target="_blank" rel="noopener">Register<span className="sr-only"> (opens in a new tab)</span></a>}
              <button ref={calendarBtn} type="button" onClick={() => setSheet(true)} aria-haspopup="dialog"
                className={`btn-ghost min-h-[48px] gap-1.5 whitespace-nowrap px-3 ${e.register ? "shrink-0" : "flex-1"}`}><CalendarPlus size={17} aria-hidden /> Calendar</button>
              <button type="button" onClick={share} className={`btn-ghost min-h-[48px] gap-1.5 whitespace-nowrap px-3 ${e.register ? "shrink-0" : "flex-1"}`}>{shareLabel(true)}</button>
            </StickyAction>
          </>
        )}
        {/* Screen readers hear when the link has been copied (the button label changes too) */}
        <span className="sr-only" aria-live="polite">{copied ? "Link copied" : ""}</span>
      </>
    );
  }

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
            {upcoming && e.date && <a className="btn-ghost" href={calendarDataUri(e)} download={`${e.slug}.ics`}>Add to calendar</a>}
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
