/**
 * Content rules for every section, used by the admin (live form errors), the admin server (every publish) and the
 * build (before writing src/data). Errors are keyed by the field's path inside the section, joined with dots:
 * "3.title" (events), "sessions.0.groups.1.members.2.linkedin" (team), "steps.0.href" (join), "name" (site).
 * The key "" means the section as a whole.
 *
 * normalise*() turns any JSON into the exact content shape: known fields only (unknown fields are dropped), text
 * cleaned (NFC, no control characters), required text filled with "" when missing, optional fields kept only when
 * present. checkSection() does both and is what the server runs on everything it receives.
 */
import {
  HOME_STORY_STEPS, isPillarIcon,
  type Achievement, type ChapterEvent, type Faculty, type Faq, type Group, type HomeContent, type HomeHero, type JoinBenefit,
  type JoinContent, type JoinStep, type Member, type ResourceGroup, type ResourceLink, type SectionContent, type Session,
  type SiteSettings, type TeamContent, type WhatWeDoItem,
} from "./content.ts";
import { SECTION_LABELS, isImagePath, type SectionKey } from "./sections.ts";
import { isTeamIcon, isTeamKind } from "./content.ts";
import { charCount, cleanText, truncate } from "./text.ts";

export type Errors = Record<string, string>;
/** One problem with a plain-language label, for lists such as the Publish page or the starting-content report. */
export type ErrorItem = { section: SectionKey; key: string; label: string; message: string };

/* ---------- Format checks ---------- */

/** A full http(s) link without a user name or password in it. javascript:, data: and other schemes fail. */
export const isUrl = (s: string) => {
  try { const u = new URL(s); return (u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password; }
  catch { return false; }
};
/** A page on this site, such as /about or /events/rewired (one leading slash, no spaces or backslashes). */
export const isSiteLink = (s: string) => /^\/(?![/\\])[^\s\\]*$/.test(s);
/** Where a button may point: a page on this site or a full http(s) link. */
export const isSafeLink = (s: string) => isSiteLink(s) || isUrl(s);
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + "T00:00:00").getTime());
export const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
/** Event page addresses and team addresses: lowercase letters, numbers and single dashes. */
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Academic year ids such as 2025-26. */
export const SESSION_ID_RE = /^\d{4}-\d{2}$/;

/** Length limits in characters, and list limits in items. */
export const MAX = {
  title: 120, slug: 80, eventType: 40, domain: 80, teamNote: 140, series: 120, venue: 200, summary: 300, description: 5000, person: 200,
  url: 2000, name: 100, role: 100, yearLabel: 40, note: 500, email: 200, place: 200, mapQuery: 200,
  question: 300, answer: 2000, linkNote: 300, stepText: 500, buttonText: 60, benefitText: 300, achievementText: 2000,
  people: 300, year: 20, heroLine: 120, heroIntro: 1000, buttonLabel: 40, heading: 60, sectionTitle: 160, paragraph: 2000,
  itemTitle: 80, itemText: 400,
  events: 500, sessions: 30, faculty: 20, groups: 30, members: 60, achievements: 200, faqs: 100, resourceGroups: 30,
  resourceLinks: 50, steps: 20, benefits: 30, paragraphs: 12, whatWeDoItems: 12,
} as const;

const tooLong = (max: number) => `Keep this to ${max} characters or fewer.`;
const tooMany = (max: number, what: string) => `Keep this to ${max} ${what} or fewer.`;
const LINK_MESSAGE = "Paste a full link starting with https://";
const IMAGE_MESSAGE = "This image address isn't valid. Upload the image again.";

/** Adds a "too long" error unless the field already has one. */
function cap(err: Errors, key: string, value: string | undefined, max: number) {
  if (value && !err[key] && charCount(value) > max) err[key] = tooLong(max);
}
function image(err: Errors, key: string, value: string | undefined) {
  if (value && !isImagePath(value)) err[key] = IMAGE_MESSAGE;
}
/** Copies item errors into a section's errors under a path prefix. */
function nest(into: Errors, prefix: string, errors: Errors) {
  for (const [k, v] of Object.entries(errors)) into[prefix ? (k ? `${prefix}.${k}` : prefix) : k] = v;
}
const firstIndex = <T,>(list: T[], same: (x: T) => boolean) => list.findIndex(same);

/* ---------- Events ---------- */

function eventFieldErrors(e: ChapterEvent): Errors {
  const err: Errors = {};
  if (!e.title.trim()) err.title = "Give the event a title.";
  if (!e.slug) err.slug = "Add a page address (letters, numbers and dashes).";
  else if (!SLUG_RE.test(e.slug)) err.slug = "Use lowercase letters, numbers and single dashes only.";
  if (!e.type.trim()) err.type = "Choose or type an event type.";
  if (!SESSION_ID_RE.test(e.session)) err.session = "Use the format 2026-27.";
  if (e.date && !isDate(e.date)) err.date = "Pick a valid date.";
  if (e.endDate && !isDate(e.endDate)) err.endDate = "Pick a valid date.";
  if (e.date && e.endDate && e.endDate < e.date) err.endDate = "The end date is before the start date.";
  if (e.endDate && !e.date) err.date = "Add a start date too.";
  const [a, b] = (e.time || "").split("-");
  if (e.time && (!isTime(a) || (b !== undefined && !isTime(b)))) err.time = "Use start and end times like 14:00 and 16:30.";
  if (!e.summary.trim()) err.summary = "Add a one-sentence summary for the event cards.";
  if (!e.description.trim()) err.description = "Add a description for the event page.";
  if (e.register && !isUrl(e.register)) err.register = LINK_MESSAGE;
  image(err, "poster", e.poster);
  cap(err, "title", e.title, MAX.title); cap(err, "slug", e.slug, MAX.slug); cap(err, "type", e.type, MAX.eventType);
  cap(err, "domain", e.domain, MAX.domain); cap(err, "series", e.series, MAX.series); cap(err, "venue", e.venue, MAX.venue);
  cap(err, "summary", e.summary, MAX.summary); cap(err, "description", e.description, MAX.description);
  cap(err, "register", e.register, MAX.url); cap(err, "coordinator", e.coordinator, MAX.person);
  return err;
}

/** One event, as the event form checks it. `originalSlug` is the event's address before this edit (for renames). */
export function validateEvent(e: ChapterEvent, all: ChapterEvent[], originalSlug?: string): Errors {
  const err = eventFieldErrors(e);
  if (!err.slug && all.some(x => x.slug === e.slug && x.slug !== originalSlug)) err.slug = "Another event already uses this address.";
  return err;
}

export function validateEvents(list: ChapterEvent[]): Errors {
  const err: Errors = {};
  if (list.length > MAX.events) err[""] = tooMany(MAX.events, "events");
  list.forEach((e, i) => {
    const item = eventFieldErrors(e);
    if (!item.slug && firstIndex(list, x => x.slug === e.slug) !== i) item.slug = "Another event already uses this address.";
    nest(err, String(i), item);
  });
  return err;
}

/* ---------- Team ---------- */

export function validateMember(m: Member): Errors {
  const err: Errors = {};
  if (!m.name.trim()) err.name = "Add the member's name.";
  if (!m.role.trim()) err.role = "Add their role, for example ML Head.";
  (["linkedin", "github", "instagram"] as const).forEach(k => {
    const v = m[k];
    if (v && !isUrl(v)) err[k] = "Paste the full profile link starting with https://";
    cap(err, k, v, MAX.url);
  });
  image(err, "photo", m.photo);
  cap(err, "name", m.name, MAX.name); cap(err, "role", m.role, MAX.role);
  return err;
}

export function validateFaculty(f: Faculty): Errors {
  const err: Errors = {};
  if (!f.name.trim()) err.name = "Add the faculty member's name.";
  if (!f.role.trim()) err.role = "Add their role, for example Faculty Coordinator.";
  cap(err, "name", f.name, MAX.name); cap(err, "role", f.role, MAX.role);
  return err;
}

export function validateTeam(t: TeamContent): Errors {
  const err: Errors = {};
  if (!t.sessions.length) err.sessions = "Keep at least one academic year.";
  else if (t.sessions.length > MAX.sessions) err.sessions = tooMany(MAX.sessions, "academic years");
  t.sessions.forEach((s, si) => {
    const p = `sessions.${si}`;
    if (!SESSION_ID_RE.test(s.id)) err[`${p}.id`] = "Use the format 2026-27.";
    else if (firstIndex(t.sessions, x => x.id === s.id) !== si) err[`${p}.id`] = "This academic year is already in the list.";
    if (!s.label.trim()) err[`${p}.label`] = "Add the year label, for example 2026–27.";
    cap(err, `${p}.label`, s.label, MAX.yearLabel);
    cap(err, `${p}.note`, s.note, MAX.note);
    if (s.faculty.length > MAX.faculty) err[`${p}.faculty`] = tooMany(MAX.faculty, "faculty members");
    s.faculty.forEach((f, fi) => nest(err, `${p}.faculty.${fi}`, validateFaculty(f)));
    if (s.groups.length > MAX.groups) err[`${p}.groups`] = tooMany(MAX.groups, "teams");
    s.groups.forEach((g, gi) => {
      const gp = `${p}.groups.${gi}`;
      if (!g.domain.trim()) err[`${gp}.domain`] = "Give the team a name.";
      cap(err, `${gp}.domain`, g.domain, MAX.domain);
      if (g.kind !== undefined && !isTeamKind(g.kind)) err[`${gp}.kind`] = "Choose whether this team is technical or keeps the chapter running.";
      if (g.note !== undefined) cap(err, `${gp}.note`, g.note, MAX.teamNote);
      if (g.icon !== undefined && !isTeamIcon(g.icon)) err[`${gp}.icon`] = "Pick one of the icons in the list.";
      if (!SLUG_RE.test(g.slug)) err[`${gp}.slug`] = "Use letters or numbers in the team's name.";
      else if (firstIndex(s.groups, x => x.slug === g.slug) !== gi) err[`${gp}.slug`] = "Another team in this year has the same name.";
      if (g.members.length > MAX.members) err[`${gp}.members`] = tooMany(MAX.members, "members");
      g.members.forEach((m, mi) => nest(err, `${gp}.members.${mi}`, validateMember(m)));
    });
  });
  return err;
}

/* ---------- Achievements ---------- */

export function validateAchievement(a: Achievement): Errors {
  const err: Errors = {};
  if (!a.title.trim()) err.title = "Give the achievement a title.";
  if (!a.year.trim()) err.year = "Add the year, for example 2025.";
  if (!a.description.trim()) err.description = "Say what happened in a sentence or two.";
  if (a.link && !isUrl(a.link)) err.link = LINK_MESSAGE;
  image(err, "image", a.image);
  cap(err, "title", a.title, MAX.title); cap(err, "year", a.year, MAX.year); cap(err, "description", a.description, MAX.achievementText);
  cap(err, "people", a.people, MAX.people); cap(err, "link", a.link, MAX.url);
  return err;
}

export function validateAchievements(list: Achievement[]): Errors {
  const err: Errors = {};
  if (list.length > MAX.achievements) err[""] = tooMany(MAX.achievements, "achievements");
  list.forEach((a, i) => {
    const item = validateAchievement(a);
    if (!item.title && firstIndex(list, x => x.title.trim() === a.title.trim() && x.year.trim() === a.year.trim()) !== i)
      item.title = "Another achievement has the same title and year.";
    nest(err, String(i), item);
  });
  return err;
}

/* ---------- Site settings ---------- */

export function validateSite(s: SiteSettings): Errors {
  const err: Errors = {};
  if (!s.name.trim()) err.name = "The chapter name can't be empty.";
  if (s.email && !isEmail(s.email)) err.email = "That doesn't look like an email address.";
  (["linkedin", "instagram", "memberForm"] as const).forEach(k => { if (s[k] && !isUrl(s[k])) err[k] = LINK_MESSAGE; cap(err, k, s[k], MAX.url); });
  cap(err, "name", s.name, MAX.name); cap(err, "fullName", s.fullName, MAX.place); cap(err, "college", s.college, MAX.place);
  cap(err, "city", s.city, MAX.name); cap(err, "email", s.email, MAX.email); cap(err, "mapQuery", s.mapQuery, MAX.mapQuery);
  return err;
}

/* ---------- Join page ---------- */

/** Join page steps and benefits. Keys look like "steps.0.title" and "benefits.2.text". */
export function validateJoin(j: JoinContent): Errors {
  const err: Errors = {};
  if (j.steps.length > MAX.steps) err.steps = tooMany(MAX.steps, "steps");
  if (j.benefits.length > MAX.benefits) err.benefits = tooMany(MAX.benefits, "benefits");
  j.steps.forEach((s, i) => {
    const k = `steps.${i}.`;
    if (!s.title.trim()) err[k + "title"] = "Give the step a title.";
    // Phones remember ticked steps by title, so two steps can't share one
    else if (j.steps.some((x, n) => n < i && x.title.trim() === s.title.trim())) err[k + "title"] = "Another step already has this title.";
    if (!s.text.trim()) err[k + "text"] = "Say what to do in this step.";
    if (!s.cta.trim()) err[k + "cta"] = "Add the button text, for example Visit IEEE CIS.";
    if (!s.useMemberForm) {
      if (!s.href.trim()) err[k + "href"] = "Paste the link the button opens.";
      else if (!isUrl(s.href.trim())) err[k + "href"] = LINK_MESSAGE;
    } else if (s.href.trim() && !isUrl(s.href.trim())) err[k + "href"] = LINK_MESSAGE;
    cap(err, k + "title", s.title, MAX.title); cap(err, k + "text", s.text, MAX.stepText);
    cap(err, k + "cta", s.cta, MAX.buttonText); cap(err, k + "href", s.href, MAX.url);
  });
  j.benefits.forEach((b, i) => {
    if (!b.title.trim()) err[`benefits.${i}.title`] = "Give the benefit a short title.";
    if (!b.text.trim()) err[`benefits.${i}.text`] = "Add a sentence about it.";
    cap(err, `benefits.${i}.title`, b.title, MAX.title); cap(err, `benefits.${i}.text`, b.text, MAX.benefitText);
  });
  return err;
}

/* ---------- FAQs ---------- */

export function validateFaq(f: Faq): Errors {
  const err: Errors = {};
  if (!f.q.trim()) err.q = "Write the question.";
  if (!f.a.trim()) err.a = "Write the answer.";
  cap(err, "q", f.q, MAX.question); cap(err, "a", f.a, MAX.answer);
  return err;
}

export function validateFaqs(list: Faq[]): Errors {
  const err: Errors = {};
  if (list.length > MAX.faqs) err[""] = tooMany(MAX.faqs, "questions");
  list.forEach((f, i) => {
    const item = validateFaq(f);
    if (!item.q && firstIndex(list, x => x.q.trim() === f.q.trim()) !== i) item.q = "This question is already in the list.";
    nest(err, String(i), item);
  });
  return err;
}

/* ---------- Resources ---------- */

export function validateResourceLink(l: ResourceLink): Errors {
  const err: Errors = {};
  if (!l.title.trim()) err.title = "Give the link a title.";
  if (!l.url.trim()) err.url = "Paste the link.";
  else if (!isUrl(l.url)) err.url = "Needs to start with https://";
  cap(err, "title", l.title, MAX.title); cap(err, "url", l.url, MAX.url); cap(err, "note", l.note, MAX.linkNote);
  return err;
}

export function validateResources(list: ResourceGroup[]): Errors {
  const err: Errors = {};
  if (list.length > MAX.resourceGroups) err[""] = tooMany(MAX.resourceGroups, "topics");
  list.forEach((g, i) => {
    if (!g.domain.trim()) err[`${i}.domain`] = "Name the topic, for example Machine Learning.";
    else if (firstIndex(list, x => x.domain.trim() === g.domain.trim()) !== i) err[`${i}.domain`] = "Another topic has the same name.";
    cap(err, `${i}.domain`, g.domain, MAX.domain);
    if (g.links.length > MAX.resourceLinks) err[`${i}.links`] = tooMany(MAX.resourceLinks, "links");
    g.links.forEach((l, li) => {
      const item = validateResourceLink(l);
      if (!item.url && firstIndex(g.links, x => x.url.trim() === l.url.trim()) !== li) item.url = "This link is already in this topic.";
      nest(err, `${i}.links.${li}`, item);
    });
  });
  return err;
}

/* ---------- Home page ---------- */

const HERO_REQUIRED: Record<keyof HomeHero, string> = {
  eyebrow: "Add the short line above the title.",
  title: "Add the title.",
  tagline: "Add the tagline.",
  intro: "Add the introduction.",
  primaryLabel: "Add the button text.",
  primaryLink: "Add where the button goes, for example /about.",
  secondaryLabel: "Add the button text.",
  secondaryLink: "Add where the button goes, for example /join.",
};
const HERO_MAX: Record<keyof HomeHero, number> = {
  eyebrow: MAX.heroLine, title: MAX.heroLine, tagline: MAX.heroLine, intro: MAX.heroIntro,
  primaryLabel: MAX.buttonLabel, primaryLink: MAX.url, secondaryLabel: MAX.buttonLabel, secondaryLink: MAX.url,
};

export function validateWhatWeDoItem(item: WhatWeDoItem): Errors {
  const err: Errors = {};
  if (!isPillarIcon(item.icon)) err.icon = "Choose an icon from the list.";
  if (!item.title.trim()) err.title = "Give the item a title.";
  if (!item.text.trim()) err.text = "Add a sentence about it.";
  cap(err, "title", item.title, MAX.itemTitle); cap(err, "text", item.text, MAX.itemText);
  return err;
}

export function validateHome(h: HomeContent): Errors {
  const err: Errors = {};
  for (const k of Object.keys(HERO_REQUIRED) as (keyof HomeHero)[]) {
    const v = h.hero[k];
    if (!v.trim()) err[`hero.${k}`] = HERO_REQUIRED[k];
    else if ((k === "primaryLink" || k === "secondaryLink") && !isSafeLink(v.trim()))
      err[`hero.${k}`] = "Use a page on this site like /about, or a full link starting with https://";
    cap(err, `hero.${k}`, v, HERO_MAX[k]);
  }

  const { about, whatWeDo } = h;
  if (!about.label.trim()) err["about.label"] = "Add the small heading, for example About the Society.";
  if (!about.title.trim()) err["about.title"] = "Add the title.";
  cap(err, "about.label", about.label, MAX.heading); cap(err, "about.title", about.title, MAX.sectionTitle);
  if (!about.paragraphs.length) err["about.paragraphs"] = "Add at least one paragraph.";
  else if (about.paragraphs.length > MAX.paragraphs) err["about.paragraphs"] = tooMany(MAX.paragraphs, "paragraphs");
  about.paragraphs.forEach((p, i) => {
    if (!p.trim()) err[`about.paragraphs.${i}`] = "Write the paragraph or remove it.";
    cap(err, `about.paragraphs.${i}`, p, MAX.paragraph);
  });

  if (!whatWeDo.label.trim()) err["whatWeDo.label"] = "Add the small heading, for example What We Do.";
  if (!whatWeDo.title.trim()) err["whatWeDo.title"] = "Add the title.";
  cap(err, "whatWeDo.label", whatWeDo.label, MAX.heading); cap(err, "whatWeDo.title", whatWeDo.title, MAX.sectionTitle);
  if (whatWeDo.items.length < HOME_STORY_STEPS)
    err["whatWeDo.items"] = `Keep at least ${HOME_STORY_STEPS} items. The Home page shows the first ${HOME_STORY_STEPS}, one for each particle shape.`;
  else if (whatWeDo.items.length > MAX.whatWeDoItems) err["whatWeDo.items"] = tooMany(MAX.whatWeDoItems, "items");
  whatWeDo.items.forEach((item, i) => {
    const e = validateWhatWeDoItem(item);
    // The Home page tells items apart by title
    if (!e.title && firstIndex(whatWeDo.items, x => x.title.trim() === item.title.trim()) !== i) e.title = "Another item has this title.";
    nest(err, `whatWeDo.items.${i}`, e);
  });
  return err;
}

/* ---------- Any section ---------- */

const VALIDATORS: { [K in SectionKey]: (value: SectionContent[K]) => Errors } = {
  events: validateEvents,
  team: validateTeam,
  achievements: validateAchievements,
  site: validateSite,
  join: validateJoin,
  faqs: validateFaqs,
  resources: validateResources,
  home: validateHome,
};

/** Every problem in one section's content (already in the right shape; see checkSection for raw JSON). */
export function validateSection<K extends SectionKey>(key: K, value: SectionContent[K]): Errors {
  const validate: (value: SectionContent[K]) => Errors = VALIDATORS[key];
  return validate(value);
}

/* ---------- Normalising raw JSON ---------- */

type Ctx = { errors: Errors | null };
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const at = (path: string, key: string | number) => (path ? `${path}.${key}` : String(key));
const present = (v: unknown) => v !== undefined && v !== null;

function problem(ctx: Ctx, path: string, message: string) {
  if (ctx.errors && !(path in ctx.errors)) ctx.errors[path] = message;
}
function readRecord(v: unknown, path: string, ctx: Ctx): Record<string, unknown> {
  if (isRecord(v)) return v;
  if (present(v)) problem(ctx, path, "Expected a group of fields.");
  return {};
}
function readList(v: unknown, path: string, ctx: Ctx): unknown[] {
  if (Array.isArray(v)) return v;
  if (present(v)) problem(ctx, path, "Expected a list.");
  return [];
}
function readText(v: unknown, path: string, ctx: Ctx): string {
  if (typeof v === "string") return cleanText(v);
  if (present(v)) problem(ctx, path, "Expected text.");
  return "";
}

/** For each text field of T: whether it must always be there. Checked against T, so it can't drift from the type. */
type FieldRules<T> = { [K in keyof T]-?: undefined extends T[K] ? "optional" : "required" };

/** Copies T's text fields in the order the rules list them. Required fields default to ""; optional ones are kept only when present. */
function readFields<T extends { [K in keyof T]?: string }>(v: unknown, rules: FieldRules<T>, path: string, ctx: Ctx): T {
  const src = readRecord(v, path, ctx);
  const out: Record<string, string> = {};
  for (const [k, rule] of Object.entries(rules) as [string, "optional" | "required"][]) {
    if (rule === "required" || present(src[k])) out[k] = readText(src[k], at(path, k), ctx);
  }
  return out as T;
}
const readListOf = <T,>(v: unknown, path: string, ctx: Ctx, read: (item: unknown, path: string) => T): T[] =>
  readList(v, path, ctx).map((item, i) => read(item, at(path, i)));

const EVENT_FIELDS: FieldRules<ChapterEvent> = {
  slug: "required", title: "required", type: "required", domain: "optional", series: "optional", session: "required",
  date: "optional", endDate: "optional", time: "optional", venue: "optional", summary: "required", description: "required",
  poster: "optional", register: "optional", coordinator: "optional",
};
const MEMBER_FIELDS: FieldRules<Member> = { name: "required", role: "required", photo: "optional", linkedin: "optional", github: "optional", instagram: "optional" };
const FACULTY_FIELDS: FieldRules<Faculty> = { name: "required", role: "required" };
const ACHIEVEMENT_FIELDS: FieldRules<Achievement> = {
  title: "required", year: "required", description: "required", people: "optional", link: "optional", image: "optional",
};
const SITE_FIELDS: FieldRules<SiteSettings> = {
  name: "required", fullName: "required", college: "required", city: "required", email: "required",
  linkedin: "required", instagram: "required", memberForm: "required", mapQuery: "required",
};
const STEP_FIELDS: FieldRules<Omit<JoinStep, "useMemberForm">> = { title: "required", text: "required", cta: "required", href: "required" };
const BENEFIT_FIELDS: FieldRules<JoinBenefit> = { title: "required", text: "required" };
const FAQ_FIELDS: FieldRules<Faq> = { q: "required", a: "required" };
const LINK_FIELDS: FieldRules<ResourceLink> = { title: "required", url: "required", note: "required" };
const HERO_FIELDS: FieldRules<HomeHero> = {
  eyebrow: "required", title: "required", tagline: "required", intro: "required",
  primaryLabel: "required", primaryLink: "required", secondaryLabel: "required", secondaryLink: "required",
};
const ITEM_FIELDS: FieldRules<WhatWeDoItem> = { icon: "required", title: "required", text: "required" };

function readEvents(v: unknown, ctx: Ctx): ChapterEvent[] {
  return readListOf(v, "", ctx, (e, p) => readFields<ChapterEvent>(e, EVENT_FIELDS, p, ctx));
}

function readGroup(v: unknown, path: string, ctx: Ctx): Group {
  const src = readRecord(v, path, ctx);
  // kind, note and icon decide how Home lists the team; an unknown value falls back rather than failing the build
  const kind = readText(src.kind, at(path, "kind"), ctx), icon = readText(src.icon, at(path, "icon"), ctx);
  const note = readText(src.note, at(path, "note"), ctx);
  return {
    domain: readText(src.domain, at(path, "domain"), ctx),
    slug: readText(src.slug, at(path, "slug"), ctx),
    ...(isTeamKind(kind) ? { kind } : {}),
    ...(note ? { note } : {}),
    ...(isTeamIcon(icon) ? { icon } : {}),
    members: readListOf(src.members, at(path, "members"), ctx, (m, p) => readFields<Member>(m, MEMBER_FIELDS, p, ctx)),
  };
}
function readSession(v: unknown, path: string, ctx: Ctx): Session {
  const src = readRecord(v, path, ctx);
  return {
    id: readText(src.id, at(path, "id"), ctx),
    label: readText(src.label, at(path, "label"), ctx),
    ...(present(src.note) ? { note: readText(src.note, at(path, "note"), ctx) } : {}),
    faculty: readListOf(src.faculty, at(path, "faculty"), ctx, (f, p) => readFields<Faculty>(f, FACULTY_FIELDS, p, ctx)),
    groups: readListOf(src.groups, at(path, "groups"), ctx, (g, p) => readGroup(g, p, ctx)),
  };
}
function readTeam(v: unknown, ctx: Ctx): TeamContent {
  const src = readRecord(v, "", ctx);
  return { sessions: readListOf(src.sessions, "sessions", ctx, (s, p) => readSession(s, p, ctx)) };
}
function readAchievements(v: unknown, ctx: Ctx): Achievement[] {
  return readListOf(v, "", ctx, (a, p) => readFields<Achievement>(a, ACHIEVEMENT_FIELDS, p, ctx));
}
function readSite(v: unknown, ctx: Ctx): SiteSettings {
  return readFields<SiteSettings>(v, SITE_FIELDS, "", ctx);
}
function readStep(v: unknown, path: string, ctx: Ctx): JoinStep {
  const step: JoinStep = readFields<Omit<JoinStep, "useMemberForm">>(v, STEP_FIELDS, path, ctx);
  const flag = isRecord(v) ? v.useMemberForm : undefined;
  if (flag === true) step.useMemberForm = true;
  else if (present(flag) && flag !== false) problem(ctx, at(path, "useMemberForm"), "Expected yes or no.");
  return step;
}
function readJoin(v: unknown, ctx: Ctx): JoinContent {
  const src = readRecord(v, "", ctx);
  return {
    steps: readListOf(src.steps, "steps", ctx, (s, p) => readStep(s, p, ctx)),
    benefits: readListOf(src.benefits, "benefits", ctx, (b, p) => readFields<JoinBenefit>(b, BENEFIT_FIELDS, p, ctx)),
  };
}
function readFaqs(v: unknown, ctx: Ctx): Faq[] {
  return readListOf(v, "", ctx, (f, p) => readFields<Faq>(f, FAQ_FIELDS, p, ctx));
}
function readResources(v: unknown, ctx: Ctx): ResourceGroup[] {
  return readListOf(v, "", ctx, (g, p) => {
    const src = readRecord(g, p, ctx);
    return {
      domain: readText(src.domain, at(p, "domain"), ctx),
      links: readListOf(src.links, at(p, "links"), ctx, (l, lp) => readFields<ResourceLink>(l, LINK_FIELDS, lp, ctx)),
    };
  });
}
function readHome(v: unknown, ctx: Ctx): HomeContent {
  const src = readRecord(v, "", ctx);
  const about = readRecord(src.about, "about", ctx), what = readRecord(src.whatWeDo, "whatWeDo", ctx);
  return {
    hero: readFields<HomeHero>(src.hero, HERO_FIELDS, "hero", ctx),
    about: {
      label: readText(about.label, "about.label", ctx),
      title: readText(about.title, "about.title", ctx),
      paragraphs: readListOf(about.paragraphs, "about.paragraphs", ctx, (p, pp) => readText(p, pp, ctx)),
    },
    whatWeDo: {
      label: readText(what.label, "whatWeDo.label", ctx),
      title: readText(what.title, "whatWeDo.title", ctx),
      items: readListOf(what.items, "whatWeDo.items", ctx, (item, ip) => readFields<WhatWeDoItem>(item, ITEM_FIELDS, ip, ctx)),
    },
  };
}

const READERS: { [K in SectionKey]: (value: unknown, ctx: Ctx) => SectionContent[K] } = {
  events: readEvents,
  team: readTeam,
  achievements: readAchievements,
  site: readSite,
  join: readJoin,
  faqs: readFaqs,
  resources: readResources,
  home: readHome,
};
const NO_ERRORS: Ctx = { errors: null };

export const normaliseEvents = (v: unknown) => readEvents(v, NO_ERRORS);
export const normaliseTeam = (v: unknown) => readTeam(v, NO_ERRORS);
export const normaliseAchievements = (v: unknown) => readAchievements(v, NO_ERRORS);
export const normaliseSite = (v: unknown) => readSite(v, NO_ERRORS);
export const normaliseJoin = (v: unknown) => readJoin(v, NO_ERRORS);
export const normaliseFaqs = (v: unknown) => readFaqs(v, NO_ERRORS);
export const normaliseResources = (v: unknown) => readResources(v, NO_ERRORS);
export const normaliseHome = (v: unknown) => readHome(v, NO_ERRORS);

/** Any JSON as the section's exact shape (see the top of this file). Never throws. */
export function normaliseSection<K extends SectionKey>(key: K, value: unknown): SectionContent[K] {
  const read: (value: unknown, ctx: Ctx) => SectionContent[K] = READERS[key];
  return read(value, NO_ERRORS);
}

export type CheckResult<T> = { ok: boolean; value: T; errors: Errors };

/**
 * Normalises raw JSON and checks it: wrong types ("Expected text.") plus every content rule. The server runs this
 * on every section it receives and stores `value` only when `ok`.
 */
export function checkSection<K extends SectionKey>(key: K, value: unknown): CheckResult<SectionContent[K]> {
  const shape: Errors = {};
  const read: (value: unknown, ctx: Ctx) => SectionContent[K] = READERS[key];
  const normalised = read(value, { errors: shape });
  const errors = { ...validateSection(key, normalised), ...shape };
  return { ok: Object.keys(errors).length === 0, value: normalised, errors };
}

/* ---------- Plain-language labels for error keys ---------- */

const EVENT_LABELS: Record<keyof ChapterEvent, string> = {
  slug: "page address", title: "title", type: "type", domain: "domain", series: "series", session: "academic year",
  date: "start date", endDate: "end date", time: "time", venue: "venue", summary: "summary", description: "description",
  poster: "poster", register: "registration link", coordinator: "coordinator",
};
const MEMBER_LABELS: Record<keyof Member, string> = { name: "name", role: "role", photo: "photo", linkedin: "LinkedIn", github: "GitHub", instagram: "Instagram" };
const ACHIEVEMENT_LABELS: Record<keyof Achievement, string> = { title: "title", year: "year", description: "what happened", people: "people", link: "link", image: "photo" };
export const SITE_LABELS: Record<keyof SiteSettings, string> = {
  name: "Chapter name", fullName: "Full name", college: "College", city: "City", email: "Contact email",
  linkedin: "LinkedIn page", instagram: "Instagram page", memberForm: "Membership form link", mapQuery: "Map location",
};
const STEP_LABELS: Record<keyof JoinStep, string> = { title: "title", text: "what to do", cta: "button text", href: "button link", useMemberForm: "membership form" };
export const HERO_LABELS: Record<keyof HomeHero, string> = {
  eyebrow: "line above the title", title: "title", tagline: "tagline", intro: "introduction",
  primaryLabel: "first button text", primaryLink: "first button link", secondaryLabel: "second button text", secondaryLink: "second button link",
};

const field = (labels: Record<string, string>, k: string | undefined) => (k === undefined ? "" : labels[k] ?? k);
const named = (thing: string, name: string | undefined, n: number) => (name?.trim() ? `${thing} "${truncate(name)}"` : `${thing} ${n + 1}`);
const withField = (what: string, f: string) => (f ? `${what}: ${f}` : what);

/** A plain label for an error key, such as `Event "REWIRED": registration link` or `Team 2025–26, Design, Vijay R: GitHub`. */
export function errorLabel<K extends SectionKey>(section: K, value: SectionContent[K], key: string): string {
  const p = key.split(".");
  const n = (i: number) => Number(p[i]);
  const whole = SECTION_LABELS[section];
  if (!key) return whole;
  switch (section) {
    case "events": {
      const e = (value as ChapterEvent[])[n(0)];
      return withField(named("Event", e?.title || e?.slug, n(0)), field(EVENT_LABELS, p[1]));
    }
    case "achievements": {
      const a = (value as Achievement[])[n(0)];
      return withField(named("Achievement", a?.title, n(0)), field(ACHIEVEMENT_LABELS, p[1]));
    }
    case "faqs": {
      return withField(`Question ${n(0) + 1}`, field({ q: "question", a: "answer" }, p[1]));
    }
    case "resources": {
      const g = (value as ResourceGroup[])[n(0)];
      const topic = named("Resources topic", g?.domain, n(0));
      if (p[1] !== "links" || p[2] === undefined) return withField(topic, field({ domain: "name", links: "links" }, p[1]));
      const l = g?.links[n(2)];
      return withField(`${topic}, ${named("link", l?.title, n(2))}`, field({ title: "title", url: "link", note: "note" }, p[3]));
    }
    case "site":
      return withField(whole, field(SITE_LABELS, p[0]));
    case "join": {
      const j = value as JoinContent;
      if (p[0] === "steps") return p[1] === undefined ? "Join page steps" : withField(named("Join step", j.steps[n(1)]?.title, n(1)), field(STEP_LABELS, p[2]));
      if (p[0] === "benefits") return p[1] === undefined ? "Join page benefits" : withField(named("Benefit", j.benefits[n(1)]?.title, n(1)), field({ title: "title", text: "text" }, p[2]));
      return whole;
    }
    case "home": {
      const h = value as HomeContent;
      if (p[0] === "hero") return withField("Home hero", field(HERO_LABELS, p[1]));
      if (p[0] === "about") {
        if (p[1] === "paragraphs") return p[2] === undefined ? "About the Society: paragraphs" : `About the Society: paragraph ${n(2) + 1}`;
        return withField("About the Society", field({ label: "small heading", title: "title" }, p[1]));
      }
      if (p[0] === "whatWeDo") {
        if (p[1] === "items") return p[2] === undefined ? "What We Do items" : withField(named("What We Do item", h.whatWeDo.items[n(2)]?.title, n(2)), field({ icon: "icon", title: "title", text: "text" }, p[3]));
        return withField("What We Do", field({ label: "small heading", title: "title" }, p[1]));
      }
      return whole;
    }
    case "team": {
      const t = value as TeamContent;
      if (p[0] !== "sessions" || p[1] === undefined) return "Team";
      const s = t.sessions[n(1)];
      const year = `Team ${s?.label || s?.id || n(1) + 1}`;
      if (p[2] === "faculty") {
        if (p[3] === undefined) return `${year}: faculty`;
        return withField(`${year}, ${named("faculty member", s?.faculty[n(3)]?.name, n(3))}`, field({ name: "name", role: "role" }, p[4]));
      }
      if (p[2] === "groups") {
        if (p[3] === undefined) return `${year}: teams`;
        const g = s?.groups[n(3)];
        const team = `${year}, ${g?.domain.trim() || `team ${n(3) + 1}`}`;
        if (p[4] === "members") {
          if (p[5] === undefined) return `${team}: members`;
          const m = g?.members[n(5)];
          return withField(`${team}, ${m?.name.trim() || `member ${n(5) + 1}`}`, field(MEMBER_LABELS, p[6]));
        }
        return withField(team, field({ domain: "team name", slug: "team name" }, p[4]));
      }
      return withField(year, field({ id: "academic year", label: "year label", note: "note" }, p[2]));
    }
  }
  return `${whole}: ${key}`;
}

/** Errors as a list with labels, in the order they were found. */
export function listErrors<K extends SectionKey>(section: K, value: SectionContent[K], errors: Errors): ErrorItem[] {
  return Object.entries(errors).map(([key, message]) => ({ section, key, label: errorLabel(section, value, key), message }));
}
