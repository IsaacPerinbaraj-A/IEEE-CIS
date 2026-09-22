import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronRight, MapPin } from "lucide-react";
import { type ChapterEvent, formatDate, isUpcoming, shortDate, statusLabel } from "../lib/data";
import { Tilt } from "./Motion";

/**
 * Shows the poster, or a typographic stand-in for events that don't have one yet (or whose poster file fails to load).
 * `mini` is the small stand-in for list-row thumbnails: the gold ring and the first letter of the title.
 */
export function Poster({ e, className = "", mini }: { e: ChapterEvent; className?: string; mini?: boolean }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (e.poster && failedSrc !== e.poster) {
    return <img src={e.poster} alt={`${e.title} poster`} loading="lazy" decoding="async" onError={() => setFailedSrc(e.poster ?? null)} className={`h-full w-full object-cover ${className}`} />;
  }
  if (mini) {
    return (
      <div aria-hidden className={`relative h-full w-full overflow-hidden bg-gradient-to-br from-violet-deep via-panel to-ink ${className}`}>
        <div className="absolute -right-5 top-[36%] h-14 w-14 rounded-full border-[7px] border-gold/70" />
        <span className="absolute left-2.5 top-2 font-display text-[22px] font-semibold leading-none text-cream/90">{e.title.trim()[0]}</span>
      </div>
    );
  }
  return (
    <div className={`relative flex h-full w-full flex-col justify-between overflow-hidden bg-gradient-to-br from-violet-deep via-panel to-ink p-6 ${className}`}>
      <div aria-hidden className="absolute -right-12 top-[30%] h-40 w-40 rounded-full border-[18px] border-gold/70" />
      <span className="relative max-w-[60%] text-[14px] text-violet-soft">{e.series || e.type}</span>
      <span className="relative break-words font-display text-[clamp(1.2rem,2.3vw,1.7rem)] font-semibold leading-tight">{e.title}</span>
    </div>
  );
}

/** `compact` drops the summary (the phone swipe row on Home). */
export function PosterCard({ e, compact }: { e: ChapterEvent; compact?: boolean }) {
  return (
    <Link to={`/events/${e.slug}`} className="press group block" data-cursor="View">
      <Tilt className="rounded-2xl">
        <div className="aspect-[4/5] overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_20px_50px_-20px_rgba(139,92,246,.45)] transition-colors duration-200 group-hover:border-violet-soft">
          <Poster e={e} className="transition-transform duration-500 group-hover:scale-[1.04]" />
        </div>
      </Tilt>
      <div className="mt-4 flex items-center gap-2 text-[14px] text-mute"><span className="text-violet-soft">{e.type}</span><span aria-hidden>/</span><span>{formatDate(e)}</span></div>
      <h3 className="mt-1 text-lg font-semibold group-hover:text-violet-soft">{e.title}</h3>
      {!compact && <p className="mt-1 text-[15px] text-mute">{e.summary}</p>}
    </Link>
  );
}

/**
 * Phones: one event as a list row (about 120px): poster thumbnail, a meta line, a two-line title, a one-line summary
 * and a chevron. Upcoming events show how soon they start in the meta line; past events show their type.
 * It bleeds to the screen edge so the press tint spans the whole row; use it inside `.wrap`.
 */
export function EventRow({ e }: { e: ChapterEvent }) {
  const upcoming = isUpcoming(e);
  return (
    <Link to={`/events/${e.slug}`} className="press -mx-5 flex items-center gap-3.5 px-5 py-3 active:bg-raised/60">
      <Tilt className="shrink-0 rounded-xl" max={3}>
        <div className="h-[95px] w-[76px] overflow-hidden rounded-xl border border-line bg-panel"><Poster e={e} mini /></div>
      </Tilt>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] text-mute">
          <span className="text-violet-soft">{upcoming ? statusLabel(e) : e.type}</span><span aria-hidden> · </span><span className="sr-only">, </span>{shortDate(e)}
        </p>
        <h3 className="mt-1 line-clamp-2 text-[16px] font-semibold leading-snug">{e.title}</h3>
        <p className="mt-1 truncate text-[14px] text-mute">{e.summary}</p>
      </div>
      <ChevronRight size={18} aria-hidden className="shrink-0 text-mute" />
    </Link>
  );
}

export function UpcomingCard({ e }: { e: ChapterEvent }) {
  return (
    <article className="grid overflow-hidden rounded-3xl border border-line bg-panel md:grid-cols-[minmax(0,320px)_1fr]">
      <div className="aspect-[4/5] md:aspect-auto"><Poster e={e} /></div>
      <div className="flex flex-col gap-4 p-7 md:p-10">
        <span className="text-[15px] text-gold">{e.type}{e.domain ? ` in ${e.domain}` : ""}</span>
        <h3 className="text-[clamp(1.6rem,3vw,2.4rem)] font-semibold">{e.title}</h3>
        <p className="max-w-[52ch] text-mute">{e.summary}</p>
        <ul className="space-y-2 text-[15px]">
          <li className="flex items-center gap-2"><CalendarDays size={17} className="text-violet-soft" />{formatDate(e)}</li>
          {e.venue && <li className="flex items-center gap-2"><MapPin size={17} className="text-violet-soft" />{e.venue}</li>}
        </ul>
        <div className="mt-auto flex flex-wrap gap-3 pt-2">
          {e.register && <a className="btn-gold" href={e.register} target="_blank" rel="noopener">Register</a>}
          <Link className="btn-ghost" to={`/events/${e.slug}`}>Event details</Link>
        </div>
      </div>
    </article>
  );
}
