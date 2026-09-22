import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { merge, sameContent } from "./merge.ts";
import type { ChapterEvent, Faq, HomeContent, JoinContent, ResourceGroup, SectionContent, SiteSettings, TeamContent, Achievement } from "./content.ts";

const clone = <T,>(v: T): T => structuredClone(v);
const load = <K extends keyof SectionContent>(key: K): SectionContent[K] =>
  JSON.parse(readFileSync(new URL(`../src/data/${key}.json`, import.meta.url), "utf8")) as SectionContent[K];
/** Freezes deeply, so a merge that changes its inputs throws. */
function freeze<T>(v: T): T {
  if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); }
  return v;
}

const ev = (slug: string, extra: Partial<ChapterEvent> = {}): ChapterEvent => ({
  slug, title: slug.toUpperCase(), type: "Workshop", session: "2025-26", summary: `About ${slug}`, description: `All about ${slug}`, ...extra,
});
const slugs = (list: ChapterEvent[]) => list.map(e => e.slug);

/* ---------- sameContent ---------- */

test("sameContent ignores key order and treats missing, empty and false fields alike", () => {
  assert.ok(sameContent({ a: 1, b: "x" }, { b: "x", a: 1 }));
  assert.ok(sameContent({ a: "x", poster: "" }, { a: "x" }));
  assert.ok(sameContent({ a: "x", useMemberForm: false }, { a: "x" }));
  assert.ok(sameContent({ a: "x", note: undefined }, { a: "x", note: null }));
  assert.ok(!sameContent({ a: "x", poster: "p" }, { a: "x" }));
  assert.ok(!sameContent(["a", "b"], ["b", "a"]));
  assert.ok(!sameContent(["a", ""], ["a"]));
  assert.ok(!sameContent("", undefined), "top-level values are compared exactly");
});

/* ---------- Events ---------- */

test("events: edits to different events combine without conflicts", () => {
  const base = freeze([ev("a"), ev("b"), ev("c")]);
  const mine = freeze([ev("a", { title: "A edited" }), ev("b"), ev("c")]);
  const theirs = freeze([ev("a"), ev("b"), ev("c", { venue: "Hall 2" })]);
  const { merged, conflicts } = merge("events", base, mine, theirs);
  assert.deepEqual(conflicts, []);
  assert.deepEqual(merged, [ev("a", { title: "A edited" }), ev("b"), ev("c", { venue: "Hall 2" })]);
});

test("events: the same change on both sides is not a conflict", () => {
  const base = [ev("a")], both = [ev("a", { title: "New" })];
  const { merged, conflicts } = merge("events", base, clone(both), clone(both));
  assert.deepEqual(conflicts, []);
  assert.deepEqual(merged, both);
});

test("events: the same event edited differently is a conflict; prefer decides the merged value", () => {
  const base = [ev("a"), ev("b")];
  const mine = [ev("a", { title: "Mine" }), ev("b")];
  const theirs = [ev("a", { title: "Theirs" }), ev("b", { venue: "Online" })];
  const r = merge("events", base, mine, theirs);
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].key, "a");
  assert.equal(r.conflicts[0].label, 'Event "Mine"');
  assert.deepEqual(r.conflicts[0].mine, mine[0]);
  assert.deepEqual(r.conflicts[0].theirs, theirs[0]);
  assert.deepEqual(r.merged, [ev("a", { title: "Mine" }), ev("b", { venue: "Online" })]);
  const t = merge("events", base, mine, theirs, "theirs");
  assert.deepEqual(t.merged, [ev("a", { title: "Theirs" }), ev("b", { venue: "Online" })]);
  assert.equal(t.conflicts.length, 1);
});

test("events: deleting one event while the other side edits another keeps both changes", () => {
  const base = [ev("a"), ev("b"), ev("c")];
  const { merged, conflicts } = merge("events", base, [ev("a"), ev("c")], [ev("a"), ev("b"), ev("c", { title: "C2" })]);
  assert.deepEqual(conflicts, []);
  assert.deepEqual(merged, [ev("a"), ev("c", { title: "C2" })]);
});

test("events: their deletion of an event I didn't touch goes through", () => {
  const base = [ev("a"), ev("b")];
  const { merged, conflicts } = merge("events", base, [ev("a", { title: "A2" }), ev("b")], [ev("a")]);
  assert.deepEqual(conflicts, []);
  assert.deepEqual(merged, [ev("a", { title: "A2" })]);
});

test("events: I deleted what they edited, and the other way round, are conflicts", () => {
  const base = [ev("a"), ev("b")];
  const r1 = merge("events", base, [ev("b")], [ev("a", { title: "Edited" }), ev("b")]);
  assert.equal(r1.conflicts.length, 1);
  assert.equal(r1.conflicts[0].mine, null);
  assert.deepEqual(r1.conflicts[0].theirs, ev("a", { title: "Edited" }));
  assert.deepEqual(slugs(r1.merged), ["b"], "mine (deleted) by default");
  assert.deepEqual(slugs(merge("events", base, [ev("b")], [ev("a", { title: "Edited" }), ev("b")], "theirs").merged).sort(), ["a", "b"]);

  const r2 = merge("events", base, [ev("a", { title: "Edited" }), ev("b")], [ev("b")]);
  assert.equal(r2.conflicts.length, 1);
  assert.deepEqual(r2.conflicts[0].mine, ev("a", { title: "Edited" }));
  assert.equal(r2.conflicts[0].theirs, null);
  assert.deepEqual(slugs(r2.merged), ["a", "b"]);
  assert.deepEqual(slugs(merge("events", base, [ev("a", { title: "Edited" }), ev("b")], [ev("b")], "theirs").merged), ["b"]);
});

test("events: both deleting the same event is fine", () => {
  const { merged, conflicts } = merge("events", [ev("a"), ev("b")], [ev("b")], [ev("b")]);
  assert.deepEqual(conflicts, []);
  assert.deepEqual(slugs(merged), ["b"]);
});

test("events: new items from both sides are kept; mine's order, theirs placed after the item they followed", () => {
  const base = [ev("a"), ev("b")];
  const mine = [ev("new-mine"), ev("a"), ev("b")];         // added at the top
  const theirs = [ev("a"), ev("new-theirs"), ev("b"), ev("last-theirs")];
  const { merged, conflicts } = merge("events", base, mine, theirs);
  assert.deepEqual(conflicts, []);
  assert.deepEqual(slugs(merged), ["new-mine", "a", "new-theirs", "b", "last-theirs"]);
});

test("events: an item they added at the top stays at the top", () => {
  const base = [ev("a"), ev("b")];
  const { merged } = merge("events", base, [ev("a"), ev("b", { title: "B2" })], [ev("top"), ev("a"), ev("b")]);
  assert.deepEqual(slugs(merged), ["top", "a", "b"]);
  assert.equal(merged[2].title, "B2");
});

test("events: tidying away empty optional fields isn't a change", () => {
  const base = [ev("a", { poster: "", register: "", date: "" })];
  const mine = [ev("a")];                                   // tidyEvent dropped the empty fields
  const theirs = [ev("a", { poster: "", register: "", date: "", title: "Theirs" })];
  const { merged, conflicts } = merge("events", base, mine, theirs);
  assert.deepEqual(conflicts, []);
  assert.equal(merged[0].title, "Theirs");
});

test("order: if only they reordered, their order is used with my edits", () => {
  const base = [ev("a"), ev("b"), ev("c")];
  const mine = [ev("a"), ev("b", { title: "B2" }), ev("c")];
  const theirs = [ev("c"), ev("a"), ev("b")];
  const { merged, conflicts } = merge("events", base, mine, theirs);
  assert.deepEqual(conflicts, []);
  assert.deepEqual(slugs(merged), ["c", "a", "b"]);
  assert.equal(merged[2].title, "B2");
});

test("order: if I reordered, my order wins and their edits are kept", () => {
  const base = [ev("a"), ev("b"), ev("c")];
  const { merged } = merge("events", base, [ev("b"), ev("a"), ev("c")], [ev("a"), ev("b"), ev("c", { venue: "X" })]);
  assert.deepEqual(slugs(merged), ["b", "a", "c"]);
  assert.equal(merged[2].venue, "X");
});

test("merge doesn't change its inputs and returns mine or theirs when only one side changed", () => {
  const base = freeze([ev("a"), ev("b")]);
  const mine = freeze([ev("a", { title: "X" }), ev("b")]);
  assert.deepEqual(merge("events", base, mine, base).merged, mine);
  assert.deepEqual(merge("events", base, base, mine).merged, mine);
});

/* ---------- Team ---------- */

const team = (): TeamContent => ({
  sessions: [
    {
      id: "2025-26", label: "2025–26", faculty: [{ name: "Vijay K", role: "Staff Coordinator" }],
      groups: [
        { domain: "Management", slug: "management", members: [{ name: "Asha", role: "Chair" }, { name: "Bala", role: "Vice Chair" }, { name: "Chitra", role: "Secretary" }] },
        { domain: "Design", slug: "design", members: [{ name: "Dev", role: "Design Head" }] },
      ],
    },
    { id: "2024-25", label: "2024–25", note: "Older year", faculty: [], groups: [{ domain: "Management", slug: "management", members: [{ name: "Old", role: "Chair" }] }] },
  ],
});

test("team: different members edited on each side combine", () => {
  const base = freeze(team()), mine = team(), theirs = team();
  mine.sessions[0].groups[0].members[0].linkedin = "https://linkedin.com/in/asha";
  theirs.sessions[0].groups[1].members[0].role = "Design Lead";
  const { merged, conflicts } = merge("team", base, mine, theirs);
  assert.deepEqual(conflicts, []);
  assert.equal(merged.sessions[0].groups[0].members[0].linkedin, "https://linkedin.com/in/asha");
  assert.equal(merged.sessions[0].groups[1].members[0].role, "Design Lead");
});

test("team: the same member edited on both sides is one conflict with a clear key and label", () => {
  const base = team(), mine = team(), theirs = team();
  mine.sessions[0].groups[0].members[1].role = "Co-Chair";
  theirs.sessions[0].groups[0].members[1].photo = "/images/team/bala.webp";
  const { merged, conflicts } = merge("team", base, mine, theirs);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].key, "sessions/2025-26/groups/management/members/Bala");
  assert.equal(conflicts[0].label, "Bala in Management (Team 2025–26)");
  assert.equal(merged.sessions[0].groups[0].members[1].role, "Co-Chair");
  assert.equal(merged.sessions[0].groups[0].members[1].photo, undefined, "items are merged whole, not field by field");
});

test("team: a new academic year at the top plus their edit in an old year", () => {
  const base = team(), mine = team(), theirs = team();
  mine.sessions.unshift({ id: "2026-27", label: "2026–27", faculty: [], groups: [{ domain: "Management", slug: "management", members: [] }] });
  theirs.sessions[1].note = "Office bearers from the posters";
  const { merged, conflicts } = merge("team", base, mine, theirs);
  assert.deepEqual(conflicts, []);
  assert.deepEqual(merged.sessions.map(s => s.id), ["2026-27", "2025-26", "2024-25"]);
  assert.equal(merged.sessions[2].note, "Office bearers from the posters");
});

test("team: their new member lands after the member it followed, inside my reordered group", () => {
  const base = team(), mine = team(), theirs = team();
  const m = mine.sessions[0].groups[0].members;
  [m[0], m[2]] = [m[2], m[0]];                              // mine: Chitra, Bala, Asha
  theirs.sessions[0].groups[0].members.splice(1, 0, { name: "Ezhil", role: "Treasurer" }); // after Asha
  const { merged, conflicts } = merge("team", base, mine, theirs);
  assert.deepEqual(conflicts, []);
  assert.deepEqual(merged.sessions[0].groups[0].members.map(x => x.name), ["Chitra", "Bala", "Asha", "Ezhil"]);
});

test("team: year details merge field by field; the same field changed twice is a conflict", () => {
  const base = team(), mine = team(), theirs = team();
  mine.sessions[1].label = "2024-25 (archive)";
  theirs.sessions[1].label = "2024–25 team";
  theirs.sessions[1].note = "Changed note";
  const { merged, conflicts } = merge("team", base, mine, theirs);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].key, "sessions/2024-25/label");
  assert.equal(conflicts[0].label, "Team 2024-25 (archive): year label");
  assert.equal(merged.sessions[1].label, "2024-25 (archive)");
  assert.equal(merged.sessions[1].note, "Changed note");
});

test("team: deleting a year that the other side edited is a conflict about the whole year", () => {
  const base = team(), mine = team(), theirs = team();
  mine.sessions.splice(1, 1);
  theirs.sessions[1].groups[0].members[0].role = "President";
  const { merged, conflicts } = merge("team", base, mine, theirs);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].key, "sessions/2024-25");
  assert.equal(conflicts[0].mine, null);
  assert.deepEqual(merged.sessions.map(s => s.id), ["2025-26"]);
  assert.deepEqual(merge("team", base, mine, theirs, "theirs").merged.sessions.map(s => s.id), ["2025-26", "2024-25"]);
});

test("team: faculty and whole teams merge by name and address", () => {
  const base = team(), mine = team(), theirs = team();
  mine.sessions[0].faculty.push({ name: "New Faculty", role: "Faculty Coordinator" });
  theirs.sessions[0].groups.push({ domain: "Web Development", slug: "web-development", members: [{ name: "Tarun", role: "Web Dev Team" }] });
  theirs.sessions[0].groups[0].domain = "Management team";
  const { merged, conflicts } = merge("team", base, mine, theirs);
  assert.deepEqual(conflicts, []);
  assert.deepEqual(merged.sessions[0].faculty.map(f => f.name), ["Vijay K", "New Faculty"]);
  assert.deepEqual(merged.sessions[0].groups.map(g => g.slug), ["management", "design", "web-development"]);
  assert.equal(merged.sessions[0].groups[0].domain, "Management team");
});

test("team: the real team.json merges with itself unchanged", () => {
  const real = load("team");
  const { merged, conflicts } = merge("team", real, clone(real), clone(real));
  assert.deepEqual(conflicts, []);
  assert.deepEqual(merged, real);
});

/* ---------- Site and Home ---------- */

test("site: different settings combine; the same setting is a conflict", () => {
  const base = load("site");
  const mine: SiteSettings = { ...base, email: "chapter@rajalakshmi.edu.in", memberForm: "https://forms.gle/abc" };
  const theirs: SiteSettings = { ...base, instagram: "https://instagram.com/new", memberForm: "https://forms.gle/xyz" };
  const { merged, conflicts } = merge("site", base, mine, theirs);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].key, "memberForm");
  assert.equal(conflicts[0].label, "Site settings: Membership form link");
  assert.equal(conflicts[0].mine, "https://forms.gle/abc");
  assert.equal(merged.email, "chapter@rajalakshmi.edu.in");
  assert.equal(merged.instagram, "https://instagram.com/new");
  assert.equal(merged.memberForm, "https://forms.gle/abc");
  assert.deepEqual(Object.keys(merged), Object.keys(base), "fields stay in their usual order");
});

test("home: hero fields, What We Do items and About paragraphs merge separately", () => {
  const base = load("home");
  const mine: HomeContent = clone(base), theirs: HomeContent = clone(base);
  mine.hero.title = "My title";
  mine.about.paragraphs[0] = "My first paragraph.";
  mine.whatWeDo.items[1].text = "My innovation text.";
  theirs.hero.tagline = "Their tagline";
  theirs.about.paragraphs[2] = "Their third paragraph.";
  theirs.whatWeDo.items[4].text = "Their events text.";
  const { merged, conflicts } = merge("home", base, mine, theirs);
  assert.deepEqual(conflicts, []);
  assert.equal(merged.hero.title, "My title");
  assert.equal(merged.hero.tagline, "Their tagline");
  assert.equal(merged.about.paragraphs[0], "My first paragraph.");
  assert.equal(merged.about.paragraphs[2], "Their third paragraph.");
  assert.equal(merged.whatWeDo.items[1].text, "My innovation text.");
  assert.equal(merged.whatWeDo.items[4].text, "Their events text.");
  assert.equal(merged.whatWeDo.items.length, 6);
});

test("home: the same field or paragraph changed twice is a conflict", () => {
  const base = load("home");
  const mine: HomeContent = clone(base), theirs: HomeContent = clone(base);
  mine.hero.title = "Mine"; theirs.hero.title = "Theirs";
  mine.about.paragraphs[1] = "Mine 2"; theirs.about.paragraphs[1] = "Theirs 2";
  const { conflicts } = merge("home", base, mine, theirs);
  assert.deepEqual(conflicts.map(c => [c.key, c.label]), [
    ["hero/title", "Home hero: title"],
    ["about/paragraphs/1", "About the Society: paragraph 2"],
  ]);
});

test("home: adding a paragraph on one side while the other edits one is a conflict about the paragraphs", () => {
  const base = load("home");
  const mine: HomeContent = clone(base), theirs: HomeContent = clone(base);
  mine.about.paragraphs.push("A new closing paragraph.");
  theirs.about.paragraphs[0] = "Edited first paragraph.";
  const r = merge("home", base, mine, theirs);
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].key, "about/paragraphs");
  assert.equal(r.merged.about.paragraphs.length, base.about.paragraphs.length + 1);
  assert.deepEqual(merge("home", base, mine, theirs, "theirs").merged.about.paragraphs, theirs.about.paragraphs);
  // Only one side changing the list is fine
  assert.deepEqual(merge("home", base, mine, clone(base)).conflicts, []);
});

test("home: What We Do items are matched by title", () => {
  const base = load("home");
  const mine: HomeContent = clone(base), theirs: HomeContent = clone(base);
  mine.whatWeDo.items.push({ icon: "research", title: "Mentoring", text: "Seniors help juniors." });
  theirs.whatWeDo.items[0].text = "Edited learning text.";
  const { merged, conflicts } = merge("home", base, mine, theirs);
  assert.deepEqual(conflicts, []);
  assert.equal(merged.whatWeDo.items.length, 7);
  assert.equal(merged.whatWeDo.items[0].text, "Edited learning text.");
  assert.equal(merged.whatWeDo.items[6].title, "Mentoring");
});

/* ---------- Join, FAQs, resources, achievements ---------- */

test("join: steps and benefits are matched by title", () => {
  const base = load("join");
  const mine: JoinContent = clone(base), theirs: JoinContent = clone(base);
  mine.steps[0].text = "Mine";
  theirs.steps[1].cta = "Theirs";
  theirs.benefits.push({ title: "Mentoring", text: "Seniors help juniors." });
  const { merged, conflicts } = merge("join", base, mine, theirs);
  assert.deepEqual(conflicts, []);
  assert.equal(merged.steps[0].text, "Mine");
  assert.equal(merged.steps[1].cta, "Theirs");
  assert.equal(merged.benefits.at(-1)?.title, "Mentoring");
  assert.equal(merged.steps[2].useMemberForm, base.steps[2].useMemberForm);

  const clash = clone(base); clash.steps[0].text = "Theirs";
  const r = merge("join", base, mine, clash);
  assert.equal(r.conflicts[0].key, `steps/${base.steps[0].title}`);
  assert.equal(r.conflicts[0].label, `Join step "${base.steps[0].title}"`);
});

test("faqs: matched by question; a question asked twice still merges by position", () => {
  const base: Faq[] = [{ q: "Same?", a: "1" }, { q: "Same?", a: "2" }, { q: "Other?", a: "3" }];
  const mine = clone(base); mine[1].a = "2 mine";
  const theirs = clone(base); theirs[2].a = "3 theirs";
  const { merged, conflicts } = merge("faqs", base, mine, theirs);
  assert.deepEqual(conflicts, []);
  assert.deepEqual(merged.map(f => f.a), ["1", "2 mine", "3 theirs"]);
});

test("resources: links are matched by URL inside topics matched by name", () => {
  const base: ResourceGroup[] = [{ domain: "ML", links: [{ title: "A", url: "https://a.example", note: "" }] }, { domain: "Web", links: [] }];
  const mine = clone(base); mine[0].links.push({ title: "B", url: "https://b.example", note: "" });
  const theirs = clone(base); theirs[0].links.unshift({ title: "C", url: "https://c.example", note: "" }); theirs[1].links.push({ title: "D", url: "https://d.example", note: "" });
  const { merged, conflicts } = merge("resources", base, mine, theirs);
  assert.deepEqual(conflicts, []);
  assert.deepEqual(merged[0].links.map(l => l.title), ["C", "A", "B"]);
  assert.deepEqual(merged[1].links.map(l => l.title), ["D"]);

  const m2 = clone(base); m2[0].links[0].note = "mine";
  const t2 = clone(base); t2[0].links[0].note = "theirs";
  const r = merge("resources", base, m2, t2);
  assert.equal(r.conflicts[0].key, "ML/links/https://a.example");
  assert.equal(r.conflicts[0].label, 'Link "A" in Resources topic "ML"');
});

test("achievements: matched by title and year", () => {
  const a = (title: string, year: string, description = "Won"): Achievement => ({ title, year, description });
  const base = [a("SIH", "2024")];
  const { merged, conflicts } = merge("achievements", base, [a("SIH", "2025"), a("SIH", "2024")], [a("SIH", "2024", "Won the finals")]);
  assert.deepEqual(conflicts, []);
  assert.deepEqual(merged, [a("SIH", "2025"), a("SIH", "2024", "Won the finals")]);
});

test("every section merges its real starting content with itself unchanged", () => {
  for (const key of ["events", "team", "achievements", "site", "join", "faqs", "resources", "home"] as const) {
    const real = load(key);
    const { merged, conflicts } = merge(key, real, clone(real), clone(real));
    assert.deepEqual(conflicts, [], key);
    assert.deepEqual(merged, real, key);
  }
});
