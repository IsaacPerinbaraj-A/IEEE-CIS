/**
 * Read-only answers built from a ContentStore: the live content (GET /api/content), publish status, history and
 * the build export. No Express and no MongoDB here, so they can be tested with the in-memory store.
 */
import { LIMITS, type ContentResponse, type ExportImage, type ExportPublished, type HistoryPage, type PresenceEntry, type PublishStatus, type ReleaseDetail } from "../../shared/api.ts";
import type { SectionContent } from "../../shared/content.ts";
import { diffSection, type SectionDiff } from "../../shared/diff.ts";
import { SECTION_KEYS, isSectionKey, type SectionKey } from "../../shared/sections.ts";
import { normaliseSection } from "../../shared/validate.ts";
import type { PresenceDoc } from "../db.ts";
import { badRequest, notFound } from "../http/errors.ts";
import { imagePathsIn } from "./images.ts";
import { notInitialised } from "./publish.ts";
import { allContent, contentOf, deployInfoOf, loadAllSections, loadVersions, releaseSummary, versionMap, type ContentStore } from "./store.ts";

/** GET /api/content: the live release, or release 0 with nulls when nothing is published. */
export async function contentResponse(store: ContentStore): Promise<ContentResponse> {
  const live = await store.latestRelease();
  if (!live) return { release: 0, publishedAt: null, publishedBy: null, sections: null, versions: null, images: {} };
  const sections = await loadAllSections(store, live.versions);
  const images = await store.imageInfo(imagePathsIn(sections));
  return {
    release: live._id,
    publishedAt: live.publishedAt.toISOString(),
    publishedBy: live.publishedBy.name,
    sections,
    versions: versionMap(live.versions),
    images: Object.fromEntries(images.map(i => [i.path, i.sha256])),
  };
}

/** GET /api/publish/status. */
export async function publishStatus(store: ContentStore): Promise<PublishStatus> {
  const live = await store.latestRelease();
  if (!live) return { release: 0, publishedAt: null, publishedBy: null, deploy: null };
  const [deploy] = await store.getDeploys([live._id]);
  return { release: live._id, publishedAt: live.publishedAt.toISOString(), publishedBy: live.publishedBy.name, deploy: deployInfoOf(deploy) };
}

/** GET /api/history: newest first; `nextBefore` is the `before` for the next page, or null on the last page. */
export async function historyPage(store: ContentStore, before: number | null, limit: number): Promise<HistoryPage> {
  const rows = await store.listReleases(before, limit + 1);
  const page = rows.slice(0, limit);
  const deploys = new Map((await store.getDeploys(page.map(r => r._id))).map(d => [d._id, d]));
  return {
    releases: page.map(r => releaseSummary(r, deploys.get(r._id))),
    nextBefore: rows.length > limit && page.length ? page[page.length - 1]._id : null,
  };
}

/** GET /api/history/:release: its full content and, for each section it changed, what changed since the release before. */
export async function releaseDetail(store: ContentStore, n: number): Promise<ReleaseDetail> {
  const release = await store.getRelease(n);
  if (!release) throw notFound(`There is no version #${n}.`);
  const previous = n > 1 ? await store.getRelease(n - 1) : null;
  const loaded = await loadVersions(store, [
    ...SECTION_KEYS.map(k => [k, release.versions[k]] as const),
    ...(previous ? release.changed.map(k => [k, previous.versions[k]] as const) : []),
  ]);
  const sections = allContent(loaded, release.versions);
  const diffs: Partial<Record<SectionKey, SectionDiff>> = {};
  for (const k of release.changed) {
    const before = previous ? contentOf(loaded, k, previous.versions[k]) : null;
    (diffs as Record<SectionKey, SectionDiff>)[k] = diffSection(k, before, sections[k]);
  }
  const [deploy] = await store.getDeploys([n]);
  return { summary: releaseSummary(release, deploy), sections, versions: versionMap(release.versions), diffs };
}

/**
 * GET /api/export/published: the live release for the Vercel build, every section normalised, and the stored
 * images its content uses. `missing` lists image paths the content uses that aren't stored (logged by the route).
 */
export async function exportPublished(store: ContentStore): Promise<{ body: ExportPublished; missing: string[] }> {
  const live = await store.latestRelease();
  if (!live) throw notInitialised();
  const stored = await loadAllSections(store, live.versions);
  const sections = Object.fromEntries(SECTION_KEYS.map(k => [k, normaliseSection(k, stored[k])])) as SectionContent;
  const paths = imagePathsIn(sections);
  const images: ExportImage[] = (await store.imageInfo(paths))
    .map(i => ({ path: i.path, sha256: i.sha256, contentType: i.contentType, size: i.size }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const have = new Set(images.map(i => i.path));
  return {
    body: { release: live._id, publishedAt: live.publishedAt.toISOString(), sections, images },
    missing: paths.filter(p => !have.has(p)),
  };
}

/* ================= Presence ================= */

/** The section from a PresenceRequest body (missing or null means elsewhere in the admin). */
export function readPresenceSection(body: Record<string, unknown>): SectionKey | null {
  const s = body.section;
  if (s === undefined || s === null) return null;
  if (!isSectionKey(s)) throw badRequest("There is no section with that name.");
  return s;
}

/** The start of the presence window. */
export const presenceSince = (now: Date) => new Date(now.getTime() - LIMITS.presenceWindowSeconds * 1000);

/** Everyone seen within the window (including the caller), most recent first. */
export function presenceEntries(docs: readonly PresenceDoc[], now: Date): PresenceEntry[] {
  const since = presenceSince(now).getTime();
  return docs
    .filter(d => d.at.getTime() >= since)
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map(d => ({ userId: d.userId.toHexString(), name: d.name, section: d.section, at: d.at.toISOString() }));
}
