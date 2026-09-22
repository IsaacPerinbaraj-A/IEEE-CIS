import eventsJson from "../data/events.json";
import teamJson from "../data/team.json";
import siteJson from "../data/site.json";
import achievementsJson from "../data/achievements.json";
import homeJson from "../data/home.json";

/** Home and About page copy (hero, About the Society, What We Do), edited in src/data/home.json. `**text**` marks bold. */
export type HomeContent = {
  hero: { eyebrow: string; title: string; tagline: string; intro: string; primaryLabel: string; primaryLink: string; secondaryLabel: string; secondaryLink: string };
  about: { label: string; title: string; paragraphs: string[] };
  whatWeDo: { label: string; title: string; items: { icon: string; title: string; text: string }[] };
};
export const home = homeJson as HomeContent;

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

/** Builds a downloadable .ics calendar file for an event. */
export function calendarFile(e: ChapterEvent): string {
  const d = (s: string) => s.replace(/-/g, "");
  const [start, end] = (e.time || "").split("-");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//IEEE CIS REC//Events//EN", "BEGIN:VEVENT",
    `UID:${e.slug}@ieee-cis-rec`, `DTSTAMP:${stamp}`];
  if (e.date && start && end) {
    lines.push(`DTSTART;TZID=Asia/Kolkata:${d(e.date)}T${start.replace(":", "")}00`, `DTEND;TZID=Asia/Kolkata:${d(e.date)}T${end.replace(":", "")}00`);
  } else if (e.date) {
    const last = new Date((e.endDate || e.date) + "T00:00:00"); last.setDate(last.getDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${d(e.date)}`, `DTEND;VALUE=DATE:${last.toISOString().slice(0, 10).replace(/-/g, "")}`);
  }
  lines.push(`SUMMARY:${e.title} (IEEE CIS REC)`, `LOCATION:${e.venue || ""}`, `DESCRIPTION:${e.summary}`, "END:VEVENT", "END:VCALENDAR");
  return URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar" }));
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
