import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ContentSnapshot, ContentVersion, ExportImage, ExportPublished } from "../../shared/api.ts";
import type { SectionContent } from "../../shared/content.ts";
import { SECTION_FILES, SECTION_KEYS, type SectionKey } from "../../shared/sections.ts";
import { checkSection } from "../../shared/validate.ts";
import {
  DEFAULT_TIMING, FatalError, exportEndpoints, imageFile, imagePathsIn, liveSiteOrigin, parsePublished, run, sectionJson,
  sha256Hex, type Deps, type Env,
} from "./content-build.ts";

/* ---------- Fixtures ---------- */

const REPO = fileURLToPath(new URL("..", import.meta.url));
const SHA = "a".repeat(64);
const EXPORT = "https://cis-admin.onrender.com/api/export/published";
const LIVE = "https://ieee-cis-rec.vercel.app";
const ENV: Env = { CONTENT_EXPORT_URL: EXPORT, CONTENT_EXPORT_TOKEN: "t".repeat(40), VERCEL_PROJECT_PRODUCTION_URL: "ieee-cis-rec.vercel.app" };

function deletePath(value: unknown, key: string) {
  const parts = key.split(".");
  let at = value as Record<string, unknown>;
  for (const p of parts.slice(0, -1)) at = at[p] as Record<string, unknown>;
  delete at[parts[parts.length - 1]];
}

/** The starting copy in src/data, minus the few team links that aren't full links (the build only accepts valid content). */
function validSections(): SectionContent {
  const out: Partial<Record<SectionKey, unknown>> = {};
  for (const key of SECTION_KEYS) {
    const first = checkSection(key, JSON.parse(readFileSync(path.join(REPO, SECTION_FILES[key]), "utf8")));
    const value = structuredClone(first.value) as unknown;
    for (const k of Object.keys(first.errors)) deletePath(value, k);
    const again = checkSection(key, value);
    assert.deepEqual(again.errors, {}, key);
    out[key] = again.value;
  }
  return out as SectionContent;
}

const imageBytes = (p: string, version = "") => new TextEncoder().encode(`image ${p}${version}`);
const imageEntry = (p: string, version = ""): ExportImage => {
  const bytes = imageBytes(p, version);
  return { path: p, sha256: sha256Hex(bytes), contentType: p.endsWith(".jpg") ? "image/jpeg" : "image/webp", size: bytes.length };
};

function published(release = 7, version = ""): ExportPublished {
  const sections = validSections();
  return { release, publishedAt: "2026-09-20T10:00:00.000Z", sections, images: [...imagePathsIn(sections)].sort().map(p => imageEntry(p, version)) };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const html = (status = 200) => new Response("<!doctype html><title>page</title>", { status, headers: { "content-type": "text/html" } });

type Call = { url: string; auth: string | null };
type Route = (url: string, n: number) => Response | Promise<Response>;

/** A test setup: a temporary repository root, a fake clock, and a fetch that answers from `route`. */
async function setup(route: Route) {
  const root = await mkdtemp(path.join(os.tmpdir(), "cis-fetch-content-"));
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const logs: string[] = [];
  let clock = Date.parse("2026-09-22T12:00:00.000Z");
  const counts = new Map<string, number>();
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, auth: headers.get("authorization") });
    const n = (counts.get(url) ?? 0) + 1;
    counts.set(url, n);
    return route(url, n);
  }) as typeof globalThis.fetch;
  const deps: Deps = {
    fetch,
    sleep: async ms => { sleeps.push(ms); clock += ms; },
    now: () => clock,
    log: m => logs.push(m),
    warn: m => logs.push(m),
    root,
  };
  const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
  const files = async () => (await readdir(root, { recursive: true, withFileTypes: true })).filter(d => d.isFile()).map(d => path.relative(root, path.join(d.parentPath, d.name)).split(path.sep).join("/")).sort();
  const cleanup = () => rm(root, { recursive: true, force: true });
  return { root, deps, calls, sleeps, logs, read, files, cleanup };
}

/** Serves images by SHA-256 from the export and by path from the live site. */
function imageRoute(data: ExportPublished, version = ""): Route {
  return url => {
    const bySha = data.images.find(i => url === `https://cis-admin.onrender.com/api/export/image/${i.sha256}`);
    if (bySha) return new Response(imageBytes(bySha.path, version));
    const byPath = data.images.find(i => url === LIVE + i.path);
    if (byPath) return new Response(imageBytes(byPath.path, version));
    return json({ error: "not found", code: "not_found" }, 404);
  };
}

/* ---------- Addresses ---------- */

test("exportEndpoints accepts the full export address or just the service address", () => {
  for (const raw of [EXPORT, "https://cis-admin.onrender.com", "https://cis-admin.onrender.com/", `${EXPORT}/`]) {
    const e = exportEndpoints(raw);
    assert.equal(e.published, EXPORT, raw);
    assert.equal(e.image(SHA), `https://cis-admin.onrender.com/api/export/image/${SHA}`, raw);
  }
  assert.equal(exportEndpoints("http://localhost:8787").published, "http://localhost:8787/api/export/published");
});

test("exportEndpoints refuses plain http, user names in the address and junk", () => {
  for (const raw of ["http://cis-admin.onrender.com/api/export/published", "https://user:pw@cis-admin.onrender.com", "not an address", "ftp://x.example"]) {
    assert.throws(() => exportEndpoints(raw), FatalError, raw);
  }
});

test("liveSiteOrigin turns Vercel's host name into an https origin", () => {
  assert.equal(liveSiteOrigin("ieee-cis-rec.vercel.app"), LIVE);
  assert.equal(liveSiteOrigin(" https://ieee-cis-rec.vercel.app/ "), LIVE);
  assert.equal(liveSiteOrigin(undefined), null);
  assert.equal(liveSiteOrigin(""), null);
  assert.equal(liveSiteOrigin("http://ieee-cis-rec.vercel.app"), null);
});

test("imageFile keeps every image inside public/images", () => {
  const root = path.resolve("/repo");
  assert.equal(imageFile(root, "/images/team/priya-s.webp"), path.join(root, "public", "images", "team", "priya-s.webp"));
  for (const bad of ["/images/../secret.webp", "/images/team/../../x.webp", "/src/data/team.json", "/images/team/a.png"]) {
    assert.throws(() => imageFile(root, bad), FatalError, bad);
  }
});

/* ---------- Checking the content ---------- */

test("parsePublished normalises valid content and keeps the image list", () => {
  const data = published();
  const parsed = parsePublished(structuredClone(data), "test");
  assert.equal(parsed.release, 7);
  assert.deepEqual(parsed.sections, data.sections);
  assert.deepEqual(parsed.images, data.images);
});

test("parsePublished lists rule breaks in plain words", () => {
  const data = published();
  data.sections.home.whatWeDo.items = data.sections.home.whatWeDo.items.slice(0, 3);
  delete (data.sections as Partial<SectionContent>).faqs;
  assert.throws(() => parsePublished(data, "the admin server"), (e: unknown) =>
    e instanceof FatalError && /The FAQs section is missing\./.test(e.message) && /Home page: What We Do items: /.test(e.message));
});

test("parsePublished refuses bad image entries and content that uses an unlisted image", () => {
  const bad = (edit: (d: ExportPublished) => void) => { const d = published(); edit(d); return () => parsePublished(d, "test"); };
  assert.throws(bad(d => { d.images[0] = { ...d.images[0], path: "/images/../x.webp" }; }), /isn't an image address/);
  assert.throws(bad(d => { d.images[0] = { ...d.images[0], sha256: "nope" }; }), /SHA-256 isn't valid/);
  assert.throws(bad(d => { d.images[0] = { ...d.images[0], contentType: "image/jpeg" }; }), /doesn't match its type/);
  assert.throws(bad(d => { d.images.push({ ...d.images[0] }); }), /listed twice/);
  assert.throws(bad(d => { d.images.shift(); }), /isn't in the list of published images/);
  assert.throws(bad(d => { d.release = 0; }), /release must be/);
  assert.throws(() => parsePublished("<html>", "test"), FatalError);
});

/* ---------- The whole step ---------- */

test("without CONTENT_EXPORT_URL it does nothing", async () => {
  const t = await setup(() => { throw new Error("no fetch expected"); });
  try {
    assert.deepEqual(await run({ CONTENT_EXPORT_TOKEN: "x" }, t.deps), { source: null });
    assert.equal(t.calls.length, 0);
    assert.deepEqual(await t.files(), []);
  } finally { await t.cleanup(); }
});

test("pulls the published content, writes src/data, the images it lacks, the snapshot and the version", async () => {
  const data = published(7);
  const images = imageRoute(data);
  const t = await setup((url, n) => (url === EXPORT ? json(data) : images(url, n)));
  try {
    // One image is already there and identical (not downloaded), one is there but different (replaced)
    const [same, changed] = data.images;
    await mkdir(path.dirname(imageFile(t.root, same.path)), { recursive: true });
    await writeFile(imageFile(t.root, same.path), imageBytes(same.path));
    await mkdir(path.dirname(imageFile(t.root, changed.path)), { recursive: true });
    await writeFile(imageFile(t.root, changed.path), "old bytes");

    const result = await run(ENV, t.deps);
    assert.deepEqual(result, { source: "export", release: 7, imagesWritten: data.images.length - 1 });

    for (const key of SECTION_KEYS) assert.equal(t.read(SECTION_FILES[key]), sectionJson(data.sections[key]), key);
    for (const img of data.images) assert.equal(sha256Hex(readFileSync(imageFile(t.root, img.path))), img.sha256, img.path);
    assert.ok(!t.calls.some(c => c.url.endsWith(same.sha256)), "an identical image isn't downloaded again");
    assert.ok(t.calls.every(c => c.auth === `Bearer ${ENV.CONTENT_EXPORT_TOKEN}`), "every export request carries the token");

    const version = JSON.parse(t.read("public/content-version.json")) as ContentVersion;
    assert.deepEqual(version, { release: 7, builtAt: "2026-09-22T12:00:00.000Z", source: "export" });
    const snapshot = JSON.parse(t.read("public/content-snapshot.json")) as ContentSnapshot;
    assert.equal(snapshot.release, 7);
    assert.deepEqual(snapshot.sections, data.sections);
    assert.deepEqual(snapshot.images, data.images);
    assert.ok(!(await t.files()).some(f => f.endsWith(".tmp")), "no temporary files are left");
  } finally { await t.cleanup(); }
});

test("waits for a sleeping server: retries network errors and waking pages with growing pauses", async () => {
  const data = published(3);
  const images = imageRoute(data);
  const t = await setup((url, n) => {
    if (url !== EXPORT) return images(url, n);
    if (n === 1) throw new TypeError("fetch failed");
    if (n === 2) return html(503);
    if (n === 3) return html(200);
    return json(data);
  });
  try {
    const result = await run(ENV, t.deps);
    assert.equal(result.source, "export");
    assert.deepEqual(t.sleeps.slice(0, 3), [2_000, 4_000, 8_000]);
  } finally { await t.cleanup(); }
});

test("when the admin server stays down, copies the live site's snapshot and its images", async () => {
  const live = published(5, "-live");
  const snapshot: ContentSnapshot = { ...live, builtAt: "2026-09-21T08:00:00.000Z" };
  const images = imageRoute(live, "-live");
  const t = await setup((url, n) => {
    if (url === EXPORT) return html(502);
    if (url === `${LIVE}/content-snapshot.json`) return json(snapshot);
    return images(url, n);
  });
  try {
    const result = await run(ENV, t.deps);
    assert.deepEqual(result, { source: "snapshot", release: 5, imagesWritten: live.images.length });
    const exportTries = t.calls.filter(c => c.url === EXPORT).length;
    assert.ok(exportTries > 5, `kept trying the admin server (${exportTries} tries)`);
    assert.ok(t.sleeps.reduce((a, b) => a + b, 0) <= DEFAULT_TIMING.exportRetryMs, "gave up after about 3 minutes");
    assert.ok(t.calls.filter(c => c.url.startsWith(LIVE)).every(c => c.auth === null), "the token is never sent to the live site");
    assert.deepEqual(JSON.parse(t.read("public/content-version.json")), { release: 5, builtAt: "2026-09-22T12:00:00.000Z", source: "snapshot" });
    assert.equal(t.read("src/data/home.json"), sectionJson(live.sections.home));
    assert.ok(t.logs.some(l => l.includes("WARNING") && l.includes("content-snapshot.json")));
  } finally { await t.cleanup(); }
});

test("first deploy: no admin server and no snapshot on the live site keeps src/data and writes release 0", async () => {
  for (const noSnapshot of [() => html(200), () => json({ error: "missing" }, 404)]) {
    const t = await setup(url => {
      if (url === EXPORT) throw new TypeError("getaddrinfo ENOTFOUND");
      if (url === `${LIVE}/content-snapshot.json`) return noSnapshot();
      throw new Error(`unexpected ${url}`);
    });
    try {
      const result = await run(ENV, t.deps);
      assert.deepEqual(result, { source: "repo", release: 0, imagesWritten: 0 });
      assert.deepEqual(await t.files(), ["public/content-version.json"]);
      assert.deepEqual(JSON.parse(t.read("public/content-version.json")), { release: 0, builtAt: "2026-09-22T12:00:00.000Z", source: "repo" });
    } finally { await t.cleanup(); }
  }
});

test("nothing published yet (409 not_initialised) skips the retries and goes to the fallback", async () => {
  const t = await setup(url => {
    if (url === EXPORT) return json({ error: "Nothing is published yet.", code: "not_initialised" }, 409);
    if (url === `${LIVE}/content-snapshot.json`) return html(200);
    throw new Error(`unexpected ${url}`);
  });
  try {
    assert.equal((await run(ENV, t.deps)).source, "repo");
    assert.equal(t.calls.filter(c => c.url === EXPORT).length, 1);
  } finally { await t.cleanup(); }
});

test("stops the build when neither the admin server nor the live site can be reached", async () => {
  const t = await setup(() => { throw new TypeError("fetch failed"); });
  try {
    await assert.rejects(run(ENV, t.deps), (e: unknown) => e instanceof FatalError && /live site's snapshot/.test(e.message));
    assert.deepEqual(await t.files(), [], "nothing is written");
  } finally { await t.cleanup(); }
});

test("stops the build when there is no live site address to fall back to", async () => {
  const t = await setup(() => html(502));
  try {
    await assert.rejects(run({ ...ENV, VERCEL_PROJECT_PRODUCTION_URL: "" }, t.deps), /VERCEL_PROJECT_PRODUCTION_URL/);
    assert.deepEqual(await t.files(), []);
  } finally { await t.cleanup(); }
});

test("a refused token or a missing server setting stops the build at once, without the fallback", async () => {
  for (const answer of [() => json({ error: "no" }, 401), () => json({ error: "x", code: "not_configured" }, 503)]) {
    const t = await setup(answer);
    try {
      await assert.rejects(run(ENV, t.deps), FatalError);
      assert.equal(t.calls.length, 1);
      assert.deepEqual(await t.files(), []);
    } finally { await t.cleanup(); }
  }
});

test("missing CONTENT_EXPORT_TOKEN stops the build", async () => {
  const t = await setup(() => json({}));
  try {
    await assert.rejects(run({ CONTENT_EXPORT_URL: EXPORT }, t.deps), /CONTENT_EXPORT_TOKEN/);
    assert.equal(t.calls.length, 0);
  } finally { await t.cleanup(); }
});

test("content that breaks the rules stops the build and nothing is written", async () => {
  const data = published();
  data.sections.events[0].slug = "Not A Slug";
  const t = await setup(url => (url === EXPORT ? json(data) : imageRoute(data)(url, 1)));
  try {
    await assert.rejects(run(ENV, t.deps), (e: unknown) => e instanceof FatalError && /Events: Event ".*": page address: /.test(e.message));
    assert.deepEqual(await t.files(), []);
  } finally { await t.cleanup(); }
});

test("an image that doesn't match its SHA-256 stops the build", async () => {
  const data = published();
  const t = await setup(url => (url === EXPORT ? json(data) : new Response("tampered")));
  try {
    await assert.rejects(run(ENV, t.deps), /doesn't match its SHA-256/);
    assert.ok(!existsSync(path.join(t.root, "src")), "no content is written");
  } finally { await t.cleanup(); }
});
