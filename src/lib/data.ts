import eventsJson from "../data/events.json";
import teamJson from "../data/team.json";
import siteJson from "../data/site.json";
import achievementsJson from "../data/achievements.json";
import homeJson from "../data/home.json";
import joinJson from "../data/join.json";

/** Home and About page copy (hero, About the Society, What We Do), edited in src/data/home.json. `**text**` marks bold. */
export type HomeContent = {
  hero: { eyebrow: string; title: string; tagline: string; intro: string; primaryLabel: string; primaryLink: string; secondaryLabel: string; secondaryLink: string };
  about: { label: string; title: string; paragraphs: string[] };
  whatWeDo: { label: string; title: string; items: { icon: string; title: string; text: string }[] };
};
export const home = homeJson as HomeContent;

/**
 * Join page content, edited in src/data/join.json. A step with `useMemberForm` links to the chapter form from
 * Site settings (site.json `memberForm`); while that is empty the page offers "email us" instead.
 */
export type JoinStep = { title: string; text: string; cta: string; href: string; useMemberForm?: boolean };
export type JoinContent = { steps: JoinStep[]; benefits: { title: string; text: string }[] };
export const join = joinJson as JoinContent;

export type ChapterEvent = {
  slug: string; title: string; type: string; domain?: string; series?: string;
  session: string;           // academic year, e.g. "2025-26"
  date?: string;             // "YYYY-MM-DD", optional
  endDate?: string; time?: string; venue?: string;
  summary: string; description: string; poster?: string; register?: string; coordinator?: string;
};
export type Member = { name: string; role: string; photo?: string; linkedin?: string; github?: string; instagram?: string };
export type Group = { domain: string; slug: string; members: Member[] };
export type Session = { id: string; label: string; note?: string; faculty: { name: string; role: string }[]; groups: Group[] };
export type Achievement = { title: string; year: string; description: string; people?: string; link?: string; image?: string };

export const site = siteJson;
export const events = eventsJson as ChapterEvent[];
export const sessions = (teamJson as { sessions: Session[] }).sessions;
export const achievements = achievementsJson as Achievement[];

const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const parse = (s?: string) => (s ? new Date(s + "T00:00:00") : null);

/** An event is upcoming until the end of its last day. Events without a date count as past. */
export const isUpcoming = (e: ChapterEvent) => { const end = parse(e.endDate || e.date); return !!end && end >= today(); };

/** Newest first; undated events sort to the top of their academic year. */
export const byNewest = (a: ChapterEvent, b: ChapterEvent) => {
  if (a.session !== b.session) return b.session.localeCompare(a.session);
  return (b.date || "9999").localeCompare(a.date || "9999");
};
export const upcomingEvents = () => events.filter(isUpcoming).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
export const pastEvents = () => events.filter(e => !isUpcoming(e)).sort(byNewest);
/** How soon an upcoming event starts, for short labels: "today", "tomorrow", "in 5 days", or "on now" once it has started. */
export function countdown(e: ChapterEvent) {
  const start = parse(e.date);
  if (!start) return "";
  const days = Math.round((start.getTime() - today().getTime()) / 86400000);
  return days < 0 ? "on now" : days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
}

export const sessionLabel = (id: string) => id.replace("-", "–");

const fmt = (s: string, opts: Intl.DateTimeFormatOptions) => new Date(s + "T00:00:00").toLocaleDateString("en-IN", opts);
export function formatDate(e: ChapterEvent): string {
  if (!e.date) return `${sessionLabel(e.session)} season`;
  if (e.endDate && e.endDate !== e.date) {
    const sameMonth = e.date.slice(0, 7) === e.endDate.slice(0, 7);
    return sameMonth
      ? `${fmt(e.date, { day: "numeric" })}–${fmt(e.endDate, { day: "numeric", month: "long", year: "numeric" })}`
      : `${fmt(e.date, { day: "numeric", month: "short" })} – ${fmt(e.endDate, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  return fmt(e.date, { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}
export function formatTime(t?: string) {
  if (!t) return "";
  const to12 = (hm: string) => { const [h, m] = hm.split(":").map(Number); const p = h >= 12 ? "pm" : "am"; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${p}`; };
  const [a, b] = t.split("-");
  return b ? `${to12(a)} – ${to12(b)}` : to12(a);
}

/** Short date for list rows: "18 Sept 2025", "3–6 Mar 2026", "28 Feb – 2 Mar 2026", or "2025–26 season" when undated. */
export function shortDate(e: ChapterEvent): string {
  if (!e.date) return `${sessionLabel(e.session)} season`;
  const full = { day: "numeric", month: "short", year: "numeric" } as const;
  if (!e.endDate || e.endDate === e.date) return fmt(e.date, full);
  return e.date.slice(0, 7) === e.endDate.slice(0, 7)
    ? `${fmt(e.date, { day: "numeric" })}–${fmt(e.endDate, full)}`
    : `${fmt(e.date, { day: "numeric", month: "short" })} – ${fmt(e.endDate, full)}`;
}

/** countdown() as a label that starts a line: "In 5 days", "Tomorrow", "Today", "On now". Past events say "Ended". */
export function statusLabel(e: ChapterEvent): string {
  if (!isUpcoming(e)) return "Ended";
  const c = countdown(e);
  return c ? c[0].toUpperCase() + c.slice(1) : "";
}

/* ---------- Add to calendar ----------
   Dates are worked out with local date arithmetic (never toISOString, which moves midnight in India back a day).
   Timed events are written in India time; an event over several days with a time repeats daily at that time. */
const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
const addDays = (s: string, n: number) => { const d = parse(s)!; d.setDate(d.getDate() + n); return d; };
const hms = (hm: string) => { const [h, m] = hm.trim().split(":").map(Number); return `${pad2(h)}${pad2(m || 0)}00`; };

type CalendarTimes = { allDay: boolean; start: string; end: string; days: number };
function calendarTimes(e: ChapterEvent): CalendarTimes | null {
  if (!e.date || isNaN(parse(e.date)!.getTime())) return null;
  const last = e.endDate && e.endDate > e.date ? e.endDate : e.date;
  const days = Math.round((parse(last)!.getTime() - parse(e.date)!.getTime()) / 86400000) + 1;
  const [from, to] = (e.time || "").split("-");
  if (from && to) {
    const a = hms(from), b = hms(to);
    // An evening that runs past midnight ends on the next day
    return { allDay: false, start: `${ymd(parse(e.date)!)}T${a}`, end: `${ymd(addDays(e.date, b > a ? 0 : 1))}T${b}`, days };
  }
  // All-day: the end date is the day after the last day
  return { allDay: true, start: ymd(parse(e.date)!), end: ymd(addDays(last, 1)), days: 1 };
}

const eventUrl = (e: ChapterEvent) => (typeof window === "undefined" ? "" : `${window.location.origin}/events/${e.slug}`);
const calendarTitle = (e: ChapterEvent) => `${e.title} (IEEE CIS REC)`;

/** The event as an .ics calendar file (text). Empty when the event has no date. */
export function calendarIcs(e: ChapterEvent): string {
  const t = calendarTimes(e);
  if (!t) return "";
  // Text values escape \ ; , and new lines; long lines fold at 75 bytes
  const utf8 = new TextEncoder();
  const text = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const fold = (line: string) => {
    const out: string[] = []; let cur = "", bytes = 0;
    for (const ch of line) {
      const n = utf8.encode(ch).length;
      if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
      cur += ch; bytes += n;
    }
    out.push(cur);
    return out.join("\r\n ");
  };
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//IEEE CIS REC//Events//EN", "CALSCALE:GREGORIAN"];
  if (!t.allDay) lines.push("BEGIN:VTIMEZONE", "TZID:Asia/Kolkata", "BEGIN:STANDARD", "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0530", "TZOFFSETTO:+0530", "TZNAME:IST", "END:STANDARD", "END:VTIMEZONE");
  lines.push("BEGIN:VEVENT", `UID:${e.slug}@ieee-cis-rec`, `DTSTAMP:${stamp}`);
  if (t.allDay) lines.push(`DTSTART;VALUE=DATE:${t.start}`, `DTEND;VALUE=DATE:${t.end}`);
  else {
    lines.push(`DTSTART;TZID=Asia/Kolkata:${t.start}`, `DTEND;TZID=Asia/Kolkata:${t.end}`);
    if (t.days > 1) lines.push(`RRULE:FREQ=DAILY;COUNT=${t.days}`);
  }
  lines.push(`SUMMARY:${text(calendarTitle(e))}`);
  if (e.venue) lines.push(`LOCATION:${text(e.venue)}`);
  lines.push(`DESCRIPTION:${text(e.summary)}`);
  const url = eventUrl(e);
  if (url) lines.push(`URL:${url}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** The .ics file as a data: link, for a plain download link that needs no object URL. */
export const calendarDataUri = (e: ChapterEvent) => `data:text/calendar;charset=utf-8,${encodeURIComponent(calendarIcs(e))}`;

/** Builds the .ics file when asked, downloads it, then releases the object URL. */
export function downloadCalendar(e: ChapterEvent) {
  const ics = calendarIcs(e);
  if (!ics) return;
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${e.slug}.ics`; a.hidden = true;
  document.body.appendChild(a); a.click(); a.remove();
  // Some browsers read the file a moment after the click, so release it a little later
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** A Google Calendar "add event" link with the title, dates, details and location filled in. */
export function googleCalendarUrl(e: ChapterEvent): string {
  const t = calendarTimes(e);
  if (!t) return "";
  const url = eventUrl(e);
  const p = new URLSearchParams({ action: "TEMPLATE", text: calendarTitle(e), dates: `${t.start}/${t.end}`, details: url ? `${e.summary}\n\n${url}` : e.summary });
  if (e.venue) p.set("location", e.venue);
  if (!t.allDay) {
    p.set("ctz", "Asia/Kolkata");
    if (t.days > 1) p.set("recur", `RRULE:FREQ=DAILY;COUNT=${t.days}`);
  }
  return `https://calendar.google.com/calendar/render?${p}`;
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
