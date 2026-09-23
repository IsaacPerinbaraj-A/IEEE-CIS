/**
 * Publish, conflicts, restore, history, the export and the starting-content import, run against the in-memory
 * store with the real starting copy from this repository. No database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { PublishConflictError } from "../../shared/api.ts";
import type { ChapterEvent, Faq, PartialContent, SectionContent } from "../../shared/content.ts";
import { SECTION_KEYS } from "../../shared/sections.ts";
import type { ErrorItem } from "../../shared/validate.ts";
import type { ActorRef } from "../db.ts";
import { HttpError } from "../http/errors.ts";
import { createMemoryStore, type MemoryStore } from "./memoryStore.ts";
import { checkSections, planSection, publishInStore, publishResponse, readPublishRequest, readRestoreRequest, restoreInStore, type PublishInput } from "./publish.ts";
import { importStartingInStore, readStartingCopy, type StartingCopy } from "./starting.ts";
import { contentResponse, exportPublished, historyPage, presenceEntries, publishStatus, readPresenceSection, releaseDetail } from "./views.ts";
import { join } from "node:path";

/** The project that holds the starting copy (src/data and public/images). */
const contentRoot = () => join(process.cwd(), "frontend");


const OWNER: ActorRef = { id: null, name: "Isaac" };
const PRIYA: ActorRef = { id: null, name: "Priya" };
const ARUN: ActorRef = { id: null, name: "Arun" };
const T0 = new Date("2026-09-22T10:00:00.000Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

let starting: StartingCopy | null = null;
const startingCopy = async () => (starting ??= await readStartingCopy(contentRoot()));
/** How many photos the starting content uses. Counted, not typed in, so adding a member's photo can't break tests. */
const photoCount = () => starting?.images.length ?? 0;

/** A store with the starting copy imported as release 1. `spoil` can damage the copy first, as an old import could. */
async function imported(spoil?: (copy: StartingCopy) => void): Promise<MemoryStore> {
  const store = createMemoryStore();
  const copy = structuredClone(starting ?? { sections: {} as SectionContent, images: [], warnings: [] });
  spoil?.(copy);
  await store.transaction(s => importStartingInStore(s, copy, OWNER, T0));
  return store;
}

/** Five member links that aren't full links, like the ones the site started with. */
const spoilTeamLinks = (copy: StartingCopy) => {
  const members = copy.sections.team.sessions[0].groups.flatMap(g => g.members).slice(0, 5);
  members.forEach((m, i) => { m[i % 2 ? "github" : "linkedin"] = "just-a-username"; });
};

const httpError = (status: number, code: string) => (e: unknown) => {
  assert.ok(e instanceof HttpError, String(e));
  assert.equal(e.status, status, e.message);
  assert.equal(e.code, code);
  return true;
};

const publish = (store: MemoryStore, input: Partial<PublishInput> & { sections: PartialContent }, actor = PRIYA, when = at(1)) =>
  store.transaction(s => publishInStore(s, { baseRelease: 1, note: "", force: false, ...input, sections: checkSections(input.sections) }, actor, when));

const live = async (store: MemoryStore) => (await contentResponse(store)).sections as SectionContent;

test("reading the starting copy: all sections, all photos, and no rule warnings", async () => {
  const copy = await startingCopy();
  assert.deepEqual(Object.keys(copy.sections), [...SECTION_KEYS]);
  // Every photo the content points at was read, and nothing else
  const used = new Set<string>();
  for (const s of copy.sections.team.sessions) for (const g of s.groups) for (const m of g.members) if (m.photo) used.add(m.photo);
  for (const e of copy.sections.events) if (e.poster) used.add(e.poster);
  for (const a of copy.sections.achievements) if (a.image) used.add(a.image);
  assert.deepEqual(copy.images.map(i => i.path).sort(), [...used].sort());
  assert.ok(copy.images.length > 0);
  assert.ok(copy.images.every(i => i.size > 0 && i.width >= 16 && i.sha256.length === 64));
  // The content shipped with the site must always pass the rules, or the first import starts with problems
  const byKey = (w: ErrorItem) => `${w.section}:${w.key} (${w.message})`;
  assert.deepEqual(copy.warnings.map(byKey), []);
});

test("before the import nothing is published; the import makes release 1 once", async () => {
  await startingCopy();
  const empty = createMemoryStore();
  assert.deepEqual(await contentResponse(empty), { release: 0, publishedAt: null, publishedBy: null, sections: null, versions: null, images: {} });
  assert.deepEqual(await publishStatus(empty), { release: 0, publishedAt: null, publishedBy: null, deploy: null });
  await assert.rejects(publish(empty, { sections: { faqs: [] } }), httpError(409, "not_initialised"));
  await assert.rejects(exportPublished(empty), httpError(409, "not_initialised"));

  const store = await imported();
  const r1 = store.state.releases.get(1);
  assert.ok(r1);
  assert.equal(r1.source, "import");
  assert.equal(r1.note, "Imported starting content");
  assert.deepEqual(r1.changed, [...SECTION_KEYS]);
  assert.ok(SECTION_KEYS.every(k => r1.versions[k] === 1 && r1.summaries[k] === "First version"));
  assert.equal(store.state.images.size, photoCount());
  assert.equal(r1.images.length, photoCount());

  const content = await contentResponse(store);
  assert.equal(content.release, 1);
  assert.equal(content.publishedBy, "Isaac");
  assert.equal(Object.keys(content.images).length, photoCount());
  assert.deepEqual(content.sections, starting?.sections);

  await assert.rejects(store.transaction(s => importStartingInStore(s, starting as StartingCopy, OWNER, at(5))), httpError(409, "not_empty"));
  assert.equal(store.state.releases.size, 1);
});

test("a publish makes a new release with new versions only for the changed sections", async () => {
  await startingCopy();
  const store = await imported();
  const faqs: Faq[] = [...(await live(store)).faqs, { q: "When are meetings held?", a: "Every second Friday." }];
  const out = await publish(store, { sections: { faqs }, note: "  New question  " });
  const r = out.release;
  assert.equal(r._id, 2);
  assert.equal(r.source, "publish");
  assert.deepEqual(r.changed, ["faqs"]);
  assert.equal(r.versions.faqs, 2);
  assert.equal(r.versions.events, 1);
  assert.equal(r.summaries.faqs, "1 question added (When are meetings held?)");
  assert.deepEqual(r.merged, []);
  assert.equal(r.images.length, photoCount());

  const response = publishResponse(out, { state: "skipped", at: at(1).toISOString() });
  assert.equal(response.release, 2);
  assert.deepEqual(response.sections.faqs, faqs);
  assert.equal(response.versions.faqs, 2);
  assert.equal((await live(store)).faqs.length, 6);

  // Nothing new → 400, and nothing is written
  await assert.rejects(publish(store, { baseRelease: 2, sections: { faqs } }), httpError(400, "bad_request"));
  assert.equal(store.state.releases.size, 2);
});

test("changes to different items merge on their own; same-item changes are conflicts", async () => {
  await startingCopy();
  const store = await imported();
  const base = await live(store);

  // Priya adds a question; Arun (also starting from release 1) edits the first answer
  await publish(store, { sections: { faqs: [...base.faqs, { q: "Is there a fee?", a: "No." }] } }, PRIYA, at(1));
  const arunFaqs = base.faqs.map((f, i) => (i === 0 ? { ...f, a: "Every student at REC." } : f));
  const merged = await publish(store, { sections: { faqs: arunFaqs } }, ARUN, at(2));
  assert.equal(merged.release._id, 3);
  assert.deepEqual(merged.release.merged, ["faqs"]);
  const faqs = (await live(store)).faqs;
  assert.equal(faqs.length, 6);
  assert.equal(faqs[0].a, "Every student at REC.");
  assert.equal(faqs[5].q, "Is there a fee?");
  assert.deepEqual(merged.sections.faqs, faqs);

  // Both change the same answer, starting from release 3
  await publish(store, { baseRelease: 3, sections: { faqs: faqs.map((f, i) => (i === 1 ? { ...f, a: "Priya's answer." } : f)) } }, PRIYA, at(3));
  const mine = faqs.map((f, i) => (i === 1 ? { ...f, a: "Arun's answer." } : i === 2 ? { ...f, a: "Arun also edited this." } : f));
  let conflict: PublishConflictError | null = null;
  await assert.rejects(publish(store, { baseRelease: 3, sections: { faqs: mine } }, ARUN, at(4)), (e: unknown) => {
    httpError(409, "conflict")(e);
    conflict = { ...(e as HttpError).extra, error: (e as HttpError).message, code: "conflict" } as PublishConflictError;
    return true;
  });
  const c = conflict as PublishConflictError | null;
  assert.ok(c);
  assert.equal(c.conflicts.faqs?.length, 1);
  assert.equal((c.conflicts.faqs?.[0].mine as Faq).a, "Arun's answer.");
  assert.equal((c.conflicts.faqs?.[0].theirs as Faq).a, "Priya's answer.");
  assert.equal(c.theirs.release, 4);
  assert.equal(c.theirs.publishedBy, "Priya");
  assert.deepEqual(Object.keys(c.theirs.sections), ["faqs"]);
  assert.equal(c.theirs.versions.faqs, 4);
  assert.equal(store.state.releases.size, 4, "a conflict saves nothing");

  // "Publish mine anyway": clashing items take mine, other changes are kept
  const forced = await publish(store, { baseRelease: 3, sections: { faqs: mine }, force: true }, ARUN, at(5));
  assert.equal(forced.release._id, 5);
  const after = (await live(store)).faqs;
  assert.equal(after[1].a, "Arun's answer.");
  assert.equal(after[2].a, "Arun also edited this.");
});

test("sections nobody else touched publish without merging, even when the base is old", async () => {
  await startingCopy();
  const store = await imported();
  const base = await live(store);
  await publish(store, { sections: { faqs: [...base.faqs, { q: "New?", a: "Yes." }] } });
  const events: ChapterEvent[] = base.events.map((e, i) => (i === 0 ? { ...e, summary: "A changed summary." } : e));
  const out = await publish(store, { sections: { events } }, ARUN, at(2));
  assert.deepEqual(out.release.changed, ["events"]);
  assert.deepEqual(out.release.merged, []);
  assert.equal(out.release.versions.faqs, 2);
  assert.equal(out.release.versions.events, 2);
});

test("rule breaks, unknown photos and unknown bases are refused", async () => {
  await startingCopy();
  const store = await imported();
  const base = await live(store);

  await assert.rejects(publish(store, { sections: { faqs: [...base.faqs, { q: "", a: "" }] } }), (e: unknown) => {
    httpError(422, "invalid")(e);
    const items = (e as HttpError).extra.items as ErrorItem[];
    assert.deepEqual(items.map(i => i.key), ["5.q", "5.a"]);
    assert.equal(items[0].label, "Question 6: question");
    return true;
  });

  // A link that isn't a full link is refused, with the person and field named
  const broken = structuredClone(base.team);
  broken.sessions[0].groups[0].members[0].github = "just-a-username";
  await assert.rejects(Promise.resolve().then(() => checkSections({ team: broken })), httpError(422, "invalid"));

  const events = [...base.events, { ...base.events[0], slug: "new-event", title: "New event", poster: "/images/events/new-event-0123456789.webp" }];
  await assert.rejects(publish(store, { sections: { events } }), (e: unknown) => {
    httpError(422, "missing_images")(e);
    assert.deepEqual((e as HttpError).extra.paths, ["/images/events/new-event-0123456789.webp"]);
    return true;
  });
  assert.equal(store.state.versions.size, 8, "nothing written");

  await store.addImage({ path: "/images/events/new-event-0123456789.webp", sha256: "a".repeat(64), contentType: "image/webp", size: 10, width: 100, height: 100, data: Buffer.from("x") }, T0, PRIYA);
  const ok = await publish(store, { sections: { events } });
  assert.ok(ok.release.images.includes("/images/events/new-event-0123456789.webp"));

  await assert.rejects(publish(store, { baseRelease: 9, sections: { faqs: base.faqs } }), httpError(400, "bad_request"));
  await assert.rejects(publish(store, { baseRelease: 0, sections: { faqs: base.faqs } }), httpError(400, "bad_request"));
});

test("merged content is checked against the rules again", async () => {
  await startingCopy();
  const store = await imported();
  const base = await live(store);
  const items = base.home.whatWeDo.items;
  const extra = (n: number) => Array.from({ length: n }, (_, i) => ({ icon: "learning", title: `Extra ${i}`, text: "Text." }));
  // Each adds 3 items (6 + 3 = 9 is fine on its own); together that's 12, still allowed; a 13th breaks the limit
  await publish(store, { sections: { home: { ...base.home, whatWeDo: { ...base.home.whatWeDo, items: [...items, ...extra(3)] } } } });
  const theirs = [...items, ...Array.from({ length: 4 }, (_, i) => ({ icon: "research", title: `Other ${i}`, text: "Text." }))];
  await assert.rejects(
    publish(store, { sections: { home: { ...base.home, whatWeDo: { ...base.home.whatWeDo, items: theirs } } } }, ARUN, at(2)),
    httpError(422, "invalid"),
  );
});

test("restore makes an old release (or one section) live again as a new release", async () => {
  await startingCopy();
  const store = await imported();
  const base = await live(store);
  await publish(store, { sections: { faqs: [...base.faqs, { q: "Q1?", a: "A1." }] } }, PRIYA, at(1));
  await publish(store, { baseRelease: 2, sections: { events: base.events.slice(1) } }, PRIYA, at(2));

  const one = await store.transaction(s => restoreInStore(s, { release: 1, section: "events", note: "" }, ARUN, at(3)));
  assert.equal(one.release._id, 4);
  assert.equal(one.release.source, "restore");
  assert.deepEqual(one.release.restoredFrom, { release: 1, section: "events" });
  assert.equal(one.release.note, "Made Events from version #1 live again");
  assert.deepEqual(one.release.changed, ["events"]);
  assert.equal(one.release.versions.events, 1);
  assert.equal(one.release.versions.faqs, 2);
  assert.equal(one.release.summaries.events, `1 event added (${base.events[0].title})`);
  assert.deepEqual(Object.keys(one.sections), ["events"]);
  assert.equal(store.state.versions.size, 10, "restoring adds no section versions");

  const all = await store.transaction(s => restoreInStore(s, { release: 1, section: null, note: "Back to the start" }, ARUN, at(4)));
  assert.equal(all.release._id, 5);
  assert.deepEqual(all.release.changed, ["faqs"]);
  assert.deepEqual(await live(store), starting?.sections);

  await assert.rejects(store.transaction(s => restoreInStore(s, { release: 1, section: null, note: "" }, ARUN, at(5))), httpError(400, "bad_request"));
  await assert.rejects(store.transaction(s => restoreInStore(s, { release: 99, section: null, note: "" }, ARUN, at(5))), httpError(404, "not_found"));
  assert.equal(store.state.releases.size, 5);

  // An old version that breaks today's rules can't go live again
  const older = await imported(spoilTeamLinks);          // release 1 holds five links that aren't full links
  await publish(older, { baseRelease: 1, sections: { team: base.team } }, PRIYA, at(5.5));   // release 2 fixes them
  await assert.rejects(older.transaction(s => restoreInStore(s, { release: 1, section: "team", note: "" }, ARUN, at(5.6))), (e: unknown) => {
    httpError(422, "invalid")(e);
    assert.match((e as HttpError).message, /^Team from version #1 breaks the current content rules/);
    assert.equal(((e as HttpError).extra.items as ErrorItem[]).length, 5);
    return true;
  });
  assert.equal(older.state.releases.size, 2, "the refused restore adds no release");

  // A publish that started before the restore merges with it
  const merged = await publish(store, { baseRelease: 3, sections: { faqs: [...base.faqs, { q: "Q1?", a: "A1." }, { q: "Q2?", a: "A2." }] } }, PRIYA, at(6));
  assert.deepEqual((await live(store)).faqs.map(f => f.q), [...base.faqs.map(f => f.q), "Q2?"]);
  assert.deepEqual(merged.release.merged, ["faqs"]);
});

test("history lists releases newest first, pages, and shows what changed", async () => {
  await startingCopy();
  const store = await imported();
  const base = await live(store);
  await publish(store, { sections: { faqs: [...base.faqs, { q: "Q1?", a: "A1." }] } }, PRIYA, at(1));
  await publish(store, { baseRelease: 2, sections: { faqs: base.faqs.slice(1) } }, ARUN, at(2));
  await store.saveDeploy(3, "requested", null, at(2));

  const page1 = await historyPage(store, null, 2);
  assert.deepEqual(page1.releases.map(r => r.release), [3, 2]);
  assert.equal(page1.nextBefore, 2);
  assert.deepEqual(page1.releases[0].deploy, { state: "requested", at: at(2).toISOString() });
  assert.equal(page1.releases[1].deploy, null);
  assert.equal(page1.releases[0].publishedBy, "Arun");
  const page2 = await historyPage(store, page1.nextBefore, 2);
  assert.deepEqual(page2.releases.map(r => r.release), [1]);
  assert.equal(page2.nextBefore, null);

  const d3 = await releaseDetail(store, 3);
  assert.deepEqual(Object.keys(d3.diffs), ["faqs"]);
  assert.equal(d3.diffs.faqs?.summary, `2 questions removed (${base.faqs[0].q} and Q1?)`);
  assert.equal(d3.sections.faqs.length, base.faqs.length - 1);
  const d1 = await releaseDetail(store, 1);
  assert.equal(d1.diffs.home?.summary, "First version");
  await assert.rejects(releaseDetail(store, 7), httpError(404, "not_found"));

  const status = await publishStatus(store);
  assert.equal(status.release, 3);
  assert.equal(status.deploy?.state, "requested");
});

test("the build export has every section normalised and the photos it uses, sorted", async () => {
  await startingCopy();
  const store = await imported();
  const { body, missing } = await exportPublished(store);
  assert.equal(body.release, 1);
  assert.deepEqual(Object.keys(body.sections), [...SECTION_KEYS]);
  assert.equal(body.images.length, photoCount());
  assert.deepEqual(body.images.map(i => i.path), [...body.images.map(i => i.path)].sort());
  assert.deepEqual(Object.keys(body.images[0]).sort(), ["contentType", "path", "sha256", "size"]);
  assert.deepEqual(missing, []);
  const bytes = await store.imageData(body.images[0].sha256);
  assert.equal(bytes?.data.length, body.images[0].size);
});

test("request bodies are read strictly", () => {
  const ok = readPublishRequest({ baseRelease: 3, sections: { faqs: [{ q: "Q?", a: "A." }] }, note: " hi ", force: true });
  assert.deepEqual(ok, { baseRelease: 3, sections: { faqs: [{ q: "Q?", a: "A." }] }, note: "hi", force: true });
  const bad = (body: Record<string, unknown>) => assert.throws(() => readPublishRequest(body), httpError(400, "bad_request"));
  bad({ sections: { faqs: [] } });
  bad({ baseRelease: "x", sections: { faqs: [] } });
  bad({ baseRelease: 1 });
  bad({ baseRelease: 1, sections: {} });
  bad({ baseRelease: 1, sections: { nope: [] } });
  bad({ baseRelease: 1, sections: { faqs: null } });
  bad({ baseRelease: 1, sections: { faqs: [] }, force: "yes" });
  bad({ baseRelease: 1, sections: { faqs: [] }, note: "x".repeat(201) });
  assert.throws(() => readPublishRequest({ baseRelease: 1, sections: { faqs: "text" } }), httpError(422, "invalid"));

  assert.deepEqual(readRestoreRequest({ release: 2 }), { release: 2, section: null, note: "" });
  assert.deepEqual(readRestoreRequest({ release: 2, section: "team", note: "Oops" }), { release: 2, section: "team", note: "Oops" });
  assert.throws(() => readRestoreRequest({ release: 0 }), httpError(400, "bad_request"));
  assert.throws(() => readRestoreRequest({ release: 2, section: "admin" }), httpError(400, "bad_request"));
});

test("planSection merges only when the section changed since the base", () => {
  const a = [{ q: "A?", a: "1" }], b = [{ q: "A?", a: "1" }, { q: "B?", a: "2" }];
  assert.deepEqual(planSection("faqs", b, null, a), { content: b, conflicts: [], combined: false });
  const withC = [...a, { q: "C?", a: "3" }];
  const plan = planSection("faqs", b, a, withC);
  assert.deepEqual((plan.content as Faq[]).map(f => f.q).sort(), ["A?", "B?", "C?"]);
  assert.equal(plan.combined, true);
  assert.deepEqual(plan.conflicts, []);
});

test("presence: only people seen in the last minute, newest first", () => {
  const now = at(10);
  const doc = (name: string, secondsAgo: number) => ({
    _id: name, userId: { toHexString: () => `${name}-id` } as never, name, section: "events" as const,
    at: new Date(now.getTime() - secondsAgo * 1000), expiresAt: now,
  });
  assert.deepEqual(presenceEntries([doc("Priya", 30), doc("Arun", 5), doc("Old", 61)], now).map(e => e.name), ["Arun", "Priya"]);
  assert.equal(readPresenceSection({ section: "team" }), "team");
  assert.equal(readPresenceSection({}), null);
  assert.throws(() => readPresenceSection({ section: "nope" }), httpError(400, "bad_request"));
});
