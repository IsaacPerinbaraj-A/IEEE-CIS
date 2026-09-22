/**
 * The site's content types. They match src/data/*.json exactly; the website (src/lib/data.ts), the admin, the
 * admin server and the build script all use these. Optional fields may be missing or empty ("" means not set).
 */
import type { SectionKey } from "./sections.ts";

/* ---------- Events (src/data/events.json) ---------- */

export type ChapterEvent = {
  slug: string; title: string; type: string; domain?: string; series?: string;
  session: string;           // academic year, e.g. "2025-26"
  date?: string;             // "YYYY-MM-DD", optional
  endDate?: string; time?: string; venue?: string;
  summary: string; description: string; poster?: string; register?: string; coordinator?: string;
};

/* ---------- Team (src/data/team.json) ---------- */

export type Member = { name: string; role: string; photo?: string; linkedin?: string; github?: string; instagram?: string };
export type Faculty = { name: string; role: string };
export type Group = { domain: string; slug: string; members: Member[] };
/** One academic year of the team. The first session in the list is the one the Team page shows by default. */
export type Session = { id: string; label: string; note?: string; faculty: Faculty[]; groups: Group[] };
export type TeamContent = { sessions: Session[] };

/* ---------- Achievements (src/data/achievements.json) ---------- */

export type Achievement = { title: string; year: string; description: string; people?: string; link?: string; image?: string };

/* ---------- Site settings (src/data/site.json) ---------- */

export type SiteSettings = {
  name: string; fullName: string; college: string; city: string; email: string;
  linkedin: string; instagram: string;
  /** The chapter's membership form. Empty until the club has one; the Join page then offers "email us". */
  memberForm: string;
  mapQuery: string;
};

/* ---------- Join page (src/data/join.json) ---------- */

/** A step with `useMemberForm` links to the membership form from Site settings instead of its own `href`. */
export type JoinStep = { title: string; text: string; cta: string; href: string; useMemberForm?: boolean };
export type JoinBenefit = { title: string; text: string };
export type JoinContent = { steps: JoinStep[]; benefits: JoinBenefit[] };

/* ---------- FAQs and resources (src/data/faqs.json, src/data/resources.json) ---------- */

export type Faq = { q: string; a: string };
export type ResourceLink = { title: string; url: string; note: string };
export type ResourceGroup = { domain: string; links: ResourceLink[] };

/* ---------- Home and About copy (src/data/home.json). `**text**` marks bold. ---------- */

export type HomeHero = {
  eyebrow: string; title: string; tagline: string; intro: string;
  primaryLabel: string; primaryLink: string; secondaryLabel: string; secondaryLink: string;
};
export type HomeAbout = { label: string; title: string; paragraphs: string[] };
export type WhatWeDoItem = { icon: string; title: string; text: string };
export type HomeWhatWeDo = { label: string; title: string; items: WhatWeDoItem[] };
export type HomeContent = { hero: HomeHero; about: HomeAbout; whatWeDo: HomeWhatWeDo };

/**
 * Icon keys a What We Do item may use. src/lib/icons.ts maps each one to an icon (`pillarIcon`) and is checked
 * against this list, so the admin, the validators and the site always agree.
 */
export const PILLAR_ICONS = ["learning", "innovation", "research", "collaboration", "events", "industry"] as const;
export type PillarIcon = (typeof PILLAR_ICONS)[number];
export const PILLAR_ICON_LABELS: Record<PillarIcon, string> = {
  learning: "Learning (graduation cap)",
  innovation: "Innovation (light bulb)",
  research: "Research (flask)",
  collaboration: "Collaboration (people)",
  events: "Events (presentation)",
  industry: "Industry (briefcase)",
};
export const isPillarIcon = (v: unknown): v is PillarIcon => typeof v === "string" && (PILLAR_ICONS as readonly string[]).includes(v);

/** The Home scroll story shows the first six What We Do items, one particle formation each (STEPS in ParticleStory.tsx). */
export const HOME_STORY_STEPS = 6;

/* ---------- All sections ---------- */

type SectionContentMap = {
  events: ChapterEvent[];
  team: TeamContent;
  achievements: Achievement[];
  site: SiteSettings;
  join: JoinContent;
  faqs: Faq[];
  resources: ResourceGroup[];
  home: HomeContent;
};
/** The content of each section, keyed like SECTION_KEYS (a missing or extra key here is a type error). */
export type SectionContent = { [K in SectionKey]: SectionContentMap[K] };
/** Content of some sections, for example only the ones an editor changed. */
export type PartialContent = Partial<SectionContent>;
