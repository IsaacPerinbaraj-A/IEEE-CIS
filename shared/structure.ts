/**
 * How each section is built from items, for the 3-way merge (merge.ts) and the change summaries (diff.ts).
 *
 * - atom: compared as a whole (an event, a member, a FAQ, one site setting).
 * - record: a group of named fields, merged field by field (the team, an academic year, a team group, the hero).
 * - list: items identified by a key (events by slug, members by name), merged item by item.
 * - paragraphs: a list of texts matched by position (About paragraphs).
 */
import type { SectionKey } from "./sections.ts";
import { HERO_LABELS, SITE_LABELS } from "./validate.ts";
import { truncate } from "./text.ts";

/** A plain label for a value, given the label of what contains it. */
export type Label = (value: unknown, parent: string) => string;
/** How diff summaries count an item: "1 event added (REWIRED)". */
export type Noun = { one: string; many: string; name: (value: unknown) => string };

export type AtomSpec = { kind: "atom"; label: Label; noun?: Noun };
export type RecordSpec = { kind: "record"; label: Label; noun?: Noun; fields: Record<string, Spec> };
export type ListSpec = { kind: "list"; key: (item: unknown) => string; item: Spec };
export type ParagraphsSpec = { kind: "paragraphs"; label: Label; noun: Noun };
export type Spec = AtomSpec | RecordSpec | ListSpec | ParagraphsSpec;

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const blank = (v: unknown) => v === undefined || v === null || v === "" || v === false;

/**
 * Content equality. Object key order doesn't matter, and inside objects a missing field counts the same as
 * undefined, null, "" or false (so tidying away an empty optional field is not a change).
 */
export function sameContent(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => sameContent(x, b[i]));
  }
  if (isRecord(a) && isRecord(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const x = a[k], y = b[k];
      if (blank(x) && blank(y)) continue;
      if (!sameContent(x, y)) return false;
    }
    return true;
  }
  return false;
}

/**
 * The items of a list by key. A key used twice gets "#2", "#3"… on its later uses, so duplicates (two FAQs with
 * the same question) still merge by position among themselves instead of being lost.
 */
export function keyed(list: unknown, key: (item: unknown) => string): { order: string[]; items: Map<string, unknown> } {
  const order: string[] = [], items = new Map<string, unknown>(), seen = new Map<string, number>();
  for (const item of Array.isArray(list) ? list : []) {
    const base = key(item), n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const k = n === 1 ? base : `${base}#${n}`;
    order.push(k);
    items.set(k, item);
  }
  return { order, items };
}

/** True when the items both lists share are in a different order in `list` than in `base`. */
export function reordered(base: { order: string[]; items: Map<string, unknown> }, list: { order: string[]; items: Map<string, unknown> }): boolean {
  const a = list.order.filter(k => base.items.has(k)), b = base.order.filter(k => list.items.has(k));
  return a.some((k, i) => k !== b[i]);
}

/* ---------- Helpers to describe sections ---------- */

const str = (v: unknown, k: string) => (isRecord(v) && typeof v[k] === "string" ? (v[k] as string) : "");
const q = (s: string) => `"${truncate(s)}"`;
const atom = (label: Label, noun?: Noun): AtomSpec => ({ kind: "atom", label, noun });
const list = (key: (item: unknown) => string, item: Spec): ListSpec => ({ kind: "list", key, item });
const record = (label: Label, fields: Record<string, Spec>, noun?: Noun): RecordSpec => ({ kind: "record", label, fields, noun });
const noun = (one: string, many: string, name: (value: unknown) => string): Noun => ({ one, many, name });
/** A field of a record that belongs to a list item (an academic year's label): changes count as editing that item. */
const part = (what: string) => atom((_v, parent) => `${parent}: ${what}`);
/**
 * A top-level setting (site settings, Home copy). Conflicts read "<parent>: <what>"; change summaries list it by
 * `name` ("2 settings edited (Contact email and Instagram page)").
 */
const setting = (what: string, name: string, one = "setting", many = "settings") =>
  atom((_v, parent) => `${parent}: ${what}`, noun(one, many, () => name));

const memberSpec = atom((v, parent) => `${str(v, "name") || "A member"} in ${parent}`, noun("member", "members", v => str(v, "name")));
const facultySpec = atom((v, parent) => `Faculty member ${str(v, "name")} in ${parent}`, noun("faculty member", "faculty members", v => str(v, "name")));
const groupSpec = record(
  (v, parent) => `${str(v, "domain") || str(v, "slug")} (${parent})`,
  { domain: part("team name"), slug: part("team address"), members: list(v => str(v, "name").trim(), memberSpec) },
  noun("team", "teams", v => str(v, "domain")),
);
const sessionSpec = record(
  v => `Team ${str(v, "label") || str(v, "id")}`,
  {
    id: part("academic year"), label: part("year label"), note: part("note"),
    faculty: list(v => str(v, "name").trim(), facultySpec),
    groups: list(v => str(v, "slug"), groupSpec),
  },
  noun("academic year", "academic years", v => str(v, "label") || str(v, "id")),
);

const siteFields: Record<string, Spec> = {};
for (const [k, label] of Object.entries(SITE_LABELS)) siteFields[k] = setting(label, label);

const heroFields: Record<string, Spec> = {};
for (const [k, label] of Object.entries(HERO_LABELS)) heroFields[k] = setting(label, `Hero ${label}`, "text", "texts");

/** The structure of every section. Keys: events by slug, members by name, and so on (see each list). */
export const SPECS: Record<SectionKey, Spec> = {
  events: list(
    v => str(v, "slug"),
    atom(v => `Event ${q(str(v, "title") || str(v, "slug"))}`, noun("event", "events", v => str(v, "title") || str(v, "slug"))),
  ),
  team: record(() => "Team", { sessions: list(v => str(v, "id"), sessionSpec) }),
  achievements: list(
    v => `${str(v, "title").trim()} (${str(v, "year").trim()})`,
    atom(v => `Achievement ${q(str(v, "title"))} (${str(v, "year")})`, noun("achievement", "achievements", v => str(v, "title"))),
  ),
  site: record(() => "Site settings", siteFields),
  join: record(() => "Join page", {
    steps: list(v => str(v, "title").trim(), atom(v => `Join step ${q(str(v, "title"))}`, noun("step", "steps", v => str(v, "title")))),
    benefits: list(v => str(v, "title").trim(), atom(v => `Benefit ${q(str(v, "title"))}`, noun("benefit", "benefits", v => str(v, "title")))),
  }),
  faqs: list(v => str(v, "q").trim(), atom(v => `Question ${q(str(v, "q"))}`, noun("question", "questions", v => str(v, "q")))),
  resources: list(
    v => str(v, "domain").trim(),
    record(
      v => `Resources topic ${q(str(v, "domain"))}`,
      {
        domain: part("topic name"),
        links: list(v => str(v, "url").trim(), atom((v, parent) => `Link ${q(str(v, "title") || str(v, "url"))} in ${parent}`, noun("link", "links", v => str(v, "title") || str(v, "url")))),
      },
      noun("topic", "topics", v => str(v, "domain")),
    ),
  ),
  home: record(() => "Home page", {
    hero: record(() => "Home hero", heroFields),
    about: record(() => "About the Society", {
      label: setting("small heading", "About small heading", "text", "texts"),
      title: setting("title", "About title", "text", "texts"),
      paragraphs: { kind: "paragraphs", label: (_v, parent) => `${parent}: paragraphs`, noun: noun("About paragraph", "About paragraphs", () => "") },
    }),
    whatWeDo: record(() => "What We Do", {
      label: setting("small heading", "What We Do small heading", "text", "texts"),
      title: setting("title", "What We Do title", "text", "texts"),
      items: list(v => str(v, "title").trim(), atom(v => `What We Do item ${q(str(v, "title"))}`, noun("What We Do item", "What We Do items", v => str(v, "title")))),
    }),
  }),
};

