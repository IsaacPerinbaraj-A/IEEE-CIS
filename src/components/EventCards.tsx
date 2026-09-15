import { Link } from "react-router-dom";
import { CalendarDays, MapPin } from "lucide-react";
import { type ChapterEvent, formatDate } from "../lib/data";
import { Tilt } from "./Motion";

/** Shows the poster, or a typographic stand-in for events that don't have one yet. */
export function Poster({ e, className = "" }: { e: ChapterEvent; className?: string }) {
  if (e.poster) return <img src={e.poster} alt={`${e.title} poster`} loading="lazy" className={`h-full w-full object-cover ${className}`} />;
  return (
    <div className={`relative flex h-full w-full flex-col justify-between overflow-hidden bg-gradient-to-br from-violet-deep via-panel to-ink p-6 ${className}`}>
      <div aria-hidden className="absolute -right-12 top-[30%] h-40 w-40 rounded-full border-[18px] border-gold/70" />
      <span className="relative max-w-[60%] text-[14px] text-violet-soft">{e.series || e.type}</span>
      <span className="relative break-words font-display text-[clamp(1.2rem,2.3vw,1.7rem)] font-semibold leading-tight">{e.title}</span>
    </div>
  );
}

export function PosterCard({ e }: { e: ChapterEvent }) {
  return (
    <Link to={`/events/${e.slug}`} className="group block" data-cursor="View">
      <Tilt className="rounded-2xl">
        <div className="aspect-[4/5] overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_20px_50px_-20px_rgba(139,92,246,.45)] transition-colors duration-200 group-hover:border-violet-soft">
          <Poster e={e} className="transition-transform duration-500 group-hover:scale-[1.04]" />
        </div>
      </Tilt>
      <div className="mt-4 flex items-center gap-2 text-[14px] text-mute"><span className="text-violet-soft">{e.type}</span><span aria-hidden>/</span><span>{formatDate(e)}</span></div>
      <h3 className="mt-1 text-lg font-semibold group-hover:text-violet-soft">{e.title}</h3>
      <p className="mt-1 text-[15px] text-mute">{e.summary}</p>
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
