import type { ChapterEvent, Session, Achievement, Member, JoinContent, JoinStep } from "../lib/data";
import eventsJson from "../data/events.json";
import teamJson from "../data/team.json";
import siteJson from "../data/site.json";
import faqsJson from "../data/faqs.json";
import resourcesJson from "../data/resources.json";
import achievementsJson from "../data/achievements.json";
import joinJson from "../data/join.json";
import adminJson from "../data/admin.json";

export type Site = typeof siteJson;
export type Faq = { q: string; a: string };
export type ResourceLink = { title: string; url: string; note: string };
export type ResourceGroup = { domain: string; links: ResourceLink[] };
export type Content = {
  events: ChapterEvent[];
  team: { sessions: Session[] };
  site: Site;
  faqs: Faq[];
  resources: ResourceGroup[];
  achievements: Achievement[];
  join: JoinContent;
};
export type ContentKey = keyof Content;
export type { ChapterEvent, Session, Achievement, Member, JoinContent, JoinStep };

/** Where each piece of content lives in the repository. */
export const FILES: Record<ContentKey, string> = {
  events: "src/data/events.json",
  team: "src/data/team.json",
  site: "src/data/site.json",
  faqs: "src/data/faqs.json",
  resources: "src/data/resources.json",
  achievements: "src/data/achievements.json",
  join: "src/data/join.json",
};
export const LABELS: Record<ContentKey, string> = {
  events: "Events", team: "Team", site: "Site settings", faqs: "FAQs", resources: "Resources", achievements: "Achievements", join: "Join page",
};

/** The content that was built into this copy of the site (used offline and as a fallback). */
export const bundled: Content = {
  events: eventsJson as ChapterEvent[],
  team: teamJson as { sessions: Session[] },
  site: siteJson,
  faqs: faqsJson,
  resources: resourcesJson,
  achievements: achievementsJson as Achievement[],
  join: joinJson as JoinContent,
};
export const adminConfig = adminJson as { repo: string; branch: string };

export const serialize = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export const isUrl = (s: string) => { try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; } };
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + "T00:00:00").getTime());
const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Academic year for a date: June onwards belongs to the year that starts then. */
export const sessionFor = (date: string) => {
  const d = new Date(date + "T00:00:00"), y = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
};

export type Errors = Record<string, string>;

export function validateEvent(e: ChapterEvent, all: ChapterEvent[], originalSlug?: string): Errors {
  const err: Errors = {};
  if (!e.title.trim()) err.title = "Give the event a title.";
  if (!e.slug) err.slug = "Add a page address (letters, numbers and dashes).";
  else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.slug)) err.slug = "Use lowercase letters, numbers and single dashes only.";
  else if (all.some(x => x.slug === e.slug && x.slug !== originalSlug)) err.slug = "Another event already uses this address.";
  if (!e.type.trim()) err.type = "Choose or type an event type.";
  if (!/^\d{4}-\d{2}$/.test(e.session)) err.session = "Use the format 2026-27.";
  if (e.date && !isDate(e.date)) err.date = "Pick a valid date.";
  if (e.endDate && !isDate(e.endDate)) err.endDate = "Pick a valid date.";
  if (e.date && e.endDate && e.endDate < e.date) err.endDate = "The end date is before the start date.";
  if (e.endDate && !e.date) err.date = "Add a start date too.";
  const [a, b] = (e.time || "").split("-");
  if (e.time && (!isTime(a) || (b !== undefined && !isTime(b)))) err.time = "Use start and end times like 14:00 and 16:30.";
  if (!e.summary.trim()) err.summary = "Add a one-sentence summary for the event cards.";
  if (!e.description.trim()) err.description = "Add a description for the event page.";
  if (e.register && !isUrl(e.register)) err.register = "Paste a full link starting with https://";
  return err;
}

export function validateMember(m: Member): Errors {
  const err: Errors = {};
  if (!m.name.trim()) err.name = "Add the member's name.";
  if (!m.role.trim()) err.role = "Add their role, for example ML Head.";
  (["linkedin", "github", "instagram"] as const).forEach(k => { if (m[k] && !isUrl(m[k]!)) err[k] = "Paste the full profile link starting with https://"; });
  return err;
}

export function validateSite(s: Site): Errors {
  const err: Errors = {};
  if (!s.name.trim()) err.name = "The chapter name can't be empty.";
  if (s.email && !isEmail(s.email)) err.email = "That doesn't look like an email address.";
  (["linkedin", "instagram", "memberForm"] as const).forEach(k => { if (s[k] && !isUrl(s[k])) err[k] = "Paste a full link starting with https://"; });
  return err;
}

/** Join page steps and benefits. Keys look like "steps.0.title" and "benefits.2.text". */
export function validateJoin(j: JoinContent): Errors {
  const err: Errors = {};
  j.steps.forEach((s, i) => {
    const k = `steps.${i}.`;
    if (!s.title.trim()) err[k + "title"] = "Give the step a title.";
    // Phones remember ticked steps by title, so two steps can't share one
    else if (j.steps.some((x, n) => n < i && x.title.trim() === s.title.trim())) err[k + "title"] = "Another step already has this title.";
    if (!s.text.trim()) err[k + "text"] = "Say what to do in this step.";
    if (!s.cta.trim()) err[k + "cta"] = "Add the button text, for example Visit IEEE CIS.";
    if (!s.useMemberForm) {
      if (!s.href.trim()) err[k + "href"] = "Paste the link the button opens.";
      else if (!isUrl(s.href.trim())) err[k + "href"] = "Paste a full link starting with https://";
    }
  });
  j.benefits.forEach((b, i) => {
    if (!b.title.trim()) err[`benefits.${i}.title`] = "Give the benefit a short title.";
    if (!b.text.trim()) err[`benefits.${i}.text`] = "Add a sentence about it.";
  });
  return err;
}

export const emptyEvent = (): ChapterEvent => ({
  slug: "", title: "", type: "Workshop", domain: "", series: "", session: sessionFor(new Date().toISOString().slice(0, 10)),
  date: "", endDate: "", time: "", venue: "Rajalakshmi Engineering College", summary: "", description: "",
  poster: "", register: "", coordinator: "",
});
export const emptyMember = (): Member => ({ name: "", role: "", photo: "", linkedin: "", github: "", instagram: "" });

/** Drop empty optional fields so the JSON stays tidy. Title, slug, type, session, summary, description are kept. */
export function tidyEvent(e: ChapterEvent): ChapterEvent {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e)) {
    const keep = ["slug", "title", "type", "session", "summary", "description"].includes(k);
    const val = typeof v === "string" ? v.trim() : v;
    if (keep || (val !== "" && val !== undefined)) out[k] = val;
  }
  return out as ChapterEvent;
}
