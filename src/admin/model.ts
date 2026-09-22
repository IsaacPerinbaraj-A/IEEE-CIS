import type { ChapterEvent, Member, SectionContent, SiteSettings } from "../../shared/content.ts";
import type { SectionKey } from "../../shared/sections.ts";

/** Every section's content (the same shape as src/data/*.json and the database). */
export type Content = SectionContent;
export type ContentKey = SectionKey;
export type Site = SiteSettings;
export type {
  ChapterEvent, Session, Achievement, Member, Faculty, Group, JoinContent, JoinStep, JoinBenefit, Faq, ResourceGroup, ResourceLink,
  HomeContent, HomeHero, HomeAbout, HomeWhatWeDo, WhatWeDoItem,
} from "../../shared/content.ts";
// The rules are the same ones the admin server checks (shared/validate.ts)
export {
  isUrl, isEmail, isSafeLink, validateEvent, validateMember, validateSite, validateJoin, validateHome, validateWhatWeDoItem, type Errors,
} from "../../shared/validate.ts";
export { slugify } from "../../shared/text.ts";

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Academic year for a date: June onwards belongs to the year that starts then. */
export const sessionFor = (date: string) => {
  const d = new Date(date + "T00:00:00"), y = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
};

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
