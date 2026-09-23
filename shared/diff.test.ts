import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describeChanges, diffSection, summariseChanges } from "./diff.ts";
import type { ChapterEvent, HomeContent, SectionContent, SiteSettings, TeamContent } from "./content.ts";

const clone = <T,>(v: T): T => structuredClone(v);
const load = <K extends keyof SectionContent>(key: K): SectionContent[K] =>
  JSON.parse(readFileSync(new URL(`../src/data/${key}.json`, import.meta.url), "utf8")) as SectionContent[K];
const ev = (slug: string, title: string, extra: Partial<ChapterEvent> = {}): ChapterEvent => ({
  slug, title, type: "Workshop", session: "2025-26", summary: "s", description: "d", ...extra,
});
const team = (): TeamContent => ({
  sessions: [
    {
      id: "2025-26", label: "2025–26", faculty: [],
      groups: [
        { domain: "Management", slug: "management", members: [{ name: "Asha", role: "Chair" }, { name: "Bala", role: "Vice Chair" }] },
        { domain: "Web Development", slug: "web-development", members: [{ name: "Chitra", role: "Web Dev Team" }] },
        { domain: "Design", slug: "design", members: [] },
      ],
    },
    { id: "2024-25", label: "2024–25", note: "From the posters", faculty: [{ name: "Vijay K", role: "Staff Coordinator" }], groups: [] },
  ],
});

test("events: added, edited and removed, with names", () => {
  const before = [ev("a", "REWIRED"), ev("b", "Cloudscape"), ev("c", "Datavizzx")];
  const after = [ev("n", "ANALYTICA 2026"), ev("a", "REWIRED", { venue: "Online" }), ev("b", "Cloudscape", { venue: "Hall" })];
  const d = diffSection("events", before, after);
  assert.equal(d.changed, true);
  assert.equal(d.summary, "1 event added (ANALYTICA 2026), 2 events edited (REWIRED and Cloudscape), 1 event removed (Datavizzx)");
  assert.equal(d.reordered, false);
});

test("no change, and tidied empty fields, say No changes", () => {
  const before = [ev("a", "A", { poster: "", register: "" })];
  assert.equal(describeChanges("events", before, [ev("a", "A")]), "No changes");
  assert.equal(diffSection("events", before, clone(before)).changed, false);
});

test("reordering only says Order changed", () => {
  const before = [ev("a", "A"), ev("b", "B")];
  const d = diffSection("events", before, [ev("b", "B"), ev("a", "A")]);
  assert.equal(d.reordered, true);
  assert.equal(d.summary, "Order changed");
  assert.equal(describeChanges("events", before, [ev("c", "C"), ev("b", "B"), ev("a", "A")]), "1 event added (C), order changed");
});

test("adding at the top is not a reorder", () => {
  const before = [ev("a", "A"), ev("b", "B")];
  assert.equal(describeChanges("events", before, [ev("n", "New"), ...before]), "1 event added (New)");
});

test("the first version has no before", () => {
  assert.equal(describeChanges("events", null, [ev("a", "A")]), "First version");
  assert.equal(diffSection("site", undefined, load("site")).changed, true);
});

test("team: members, teams, years and faculty are counted separately", () => {
  const before = team();
  const after = clone(before);
  after.sessions[0].groups[0].members[0].linkedin = "https://www.linkedin.com/in/someone-else";
  after.sessions[0].groups[1].members[0].role = "Web Lead";
  after.sessions[0].groups[2].members.push({ name: "Priya S", role: "Design Associate" });
  after.sessions[1].faculty.push({ name: "New Faculty", role: "Faculty Coordinator" });
  after.sessions.unshift({ id: "2026-27", label: "2026–27", faculty: [], groups: [] });
  const d = diffSection("team", before, after);
  assert.equal(d.summary,
    "1 academic year added (2026–27), 1 member added (Priya S), 1 faculty member added (New Faculty), 2 members edited (Asha and Chitra)");
});

test("team: a year's own details count as editing that year; renaming a team as editing the team", () => {
  const before = team();
  const after = clone(before);
  after.sessions[1].note = "A different note";
  after.sessions[0].groups[2].domain = "Design and Media";
  assert.equal(describeChanges("team", before, after), "1 team edited (Design and Media), 1 academic year edited (2024–25)");
});

test("site: settings are listed by name", () => {
  const before: SiteSettings = load("site");
  const after = { ...before, email: "new@rajalakshmi.edu.in", instagram: "https://instagram.com/new" };
  assert.equal(describeChanges("site", before, after), "2 settings edited (Contact email and Instagram page)");
});

test("home: texts, paragraphs and What We Do items", () => {
  const before: HomeContent = load("home");
  const after = clone(before);
  after.hero.title = "New title";
  after.about.paragraphs[1] = "Changed.";
  after.about.paragraphs.push("Added.");
  after.whatWeDo.items[2].text = "Changed text.";
  assert.equal(describeChanges("home", before, after),
    `1 About paragraph added, 1 text edited (Hero title), 1 About paragraph edited, 1 What We Do item edited (${before.whatWeDo.items[2].title})`);
});

test("many names are shortened to three and a count", () => {
  const before = ["a", "b", "c", "d", "e"].map(s => ev(s, s.toUpperCase()));
  const after = before.map(e => ({ ...e, venue: "Online" }));
  assert.equal(describeChanges("events", before, after), "5 events edited (A, B, C and 2 more)");
});

test("summariseChanges groups by kind and noun", () => {
  assert.equal(summariseChanges([]), "No changes");
  assert.equal(summariseChanges([
    { kind: "removed", one: "question", many: "questions", name: "Who can join?" },
    { kind: "added", one: "question", many: "questions", name: "When?" },
    { kind: "added", one: "question", many: "questions", name: "Where?" },
  ]), "2 questions added (When? and Where?), 1 question removed (Who can join?)");
});

test("join, faqs, resources and achievements", () => {
  const join = load("join"), j2 = clone(join);
  j2.steps[0].cta = "A different button";
  j2.benefits.splice(0, 1);
  assert.equal(describeChanges("join", join, j2), `1 step edited (${join.steps[0].title}), 1 benefit removed (${join.benefits[0].title})`);

  const faqs = [{ q: "Who can join IEEE CIS REC?", a: "Any student." }, { q: "Is it free?", a: "No." }], f2 = clone(faqs);
  f2[0].a = "Everyone.";
  assert.equal(describeChanges("faqs", faqs, f2), "1 question edited (Who can join IEEE CIS REC?)");

  const res = load("resources"), r2 = clone(res);
  r2[0].links.push({ title: "fast.ai", url: "https://course.fast.ai", note: "" });
  r2.push({ domain: "Robotics", links: [] });
  assert.equal(describeChanges("resources", res, r2), "1 link added (fast.ai), 1 topic added (Robotics)");

  assert.equal(describeChanges("achievements", [], [{ title: "SIH winners", year: "2025", description: "Won." }]), "1 milestone added (SIH winners)");
});
