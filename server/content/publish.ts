/**
 * Publishing and undo, as functions over a ContentStore (no Express, no MongoDB), so they can be tested with the
 * in-memory store. The routes run them inside one transaction and request the site rebuild afterwards.
 *
 * Publish: the editor sends the sections they changed (full content) and the release they started from (base).
 * Each section is checked (checkSection). If someone published that section since the base, the editor's changes
 * are merged item by item with the live copy (shared/merge.ts, clashing items take the editor's version). Clashes
 * without `force` → 409 and nothing is saved. The result is checked again, every image it uses must be stored,
 * and then new section versions plus the release are written.
 *
 * Restore: a new release whose sections point at an old release's versions (all of them or one section). No merge
 * and nothing is erased. The restored sections must pass today's rules (the build refuses anything else).
 */
import { LIMITS, type ActorName, type DeployInfo, type PublishResponse, type VersionMap } from "../../shared/api.ts";
import type { PartialContent, SectionContent } from "../../shared/content.ts";
import { describeChanges } from "../../shared/diff.ts";
import { merge, sameContent, type Conflict } from "../../shared/merge.ts";
import { SECTION_KEYS, SECTION_LABELS, isSectionKey, type SectionKey } from "../../shared/sections.ts";
import { truncate } from "../../shared/text.ts";
import { checkSection, listErrors, type ErrorItem, type Errors } from "../../shared/validate.ts";
import { sectionVersionId, type ActorRef, type ReleaseDoc } from "../db.ts";
import { booleanField, intValue, textField } from "../http/body.ts";
import { HttpError, badRequest, notFound } from "../http/errors.ts";
import { imagePathsIn } from "./images.ts";
import { allContent, contentOf, loadVersions, versionMap, type ContentStore } from "./store.ts";

type AnySection = SectionContent[SectionKey];
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const MAX_RELEASE = 1_000_000_000;

/* ================= Errors ================= */

export const notInitialised = () =>
  new HttpError(409, "not_initialised", "Nothing has been published yet. The web lead needs to import the starting content first.");

export type SectionProblem = { section: SectionKey; value: AnySection; errors: Errors };

const INVALID_MESSAGE = "Some content breaks the rules. Fix the items listed, then publish again.";

/** 422 ValidationError: errors per section plus a labelled list. */
export function invalidContent(problems: SectionProblem[], message: string = INVALID_MESSAGE): HttpError {
  const errors: Partial<Record<SectionKey, Errors>> = {};
  const items: ErrorItem[] = [];
  for (const p of problems) {
    errors[p.section] = p.errors;
    items.push(...listErrors(p.section, p.value, p.errors));
  }
  return new HttpError(422, "invalid", message, { errors, items });
}

/** 422 MissingImagesError. */
export const missingImages = (paths: string[]) =>
  new HttpError(422, "missing_images", "Some photos in this content aren't uploaded. Add them again, then publish.", { paths });

/** 409 PublishConflictError: the clashes and what is live now for the sections the editor sent. */
export function conflictError(conflicts: Partial<Record<SectionKey, Conflict[]>>, live: ReleaseDoc, theirs: PartialContent): HttpError {
  const count = Object.values(conflicts).reduce((n, list) => n + (list?.length ?? 0), 0);
  const publishedBy: ActorName = live.publishedBy.name;
  return new HttpError(409, "conflict",
    `Since you started, someone else published changes to ${count === 1 ? "an item" : `${count} items`} you also changed.`,
    { conflicts, theirs: { release: live._id, publishedAt: live.publishedAt.toISOString(), publishedBy, sections: theirs, versions: versionMap(live.versions) } });
}

/* ================= Requests ================= */

/**
 * Normalises and checks each section (checkSection); 422 ValidationError when any breaks the rules.
 * Returns the normalised content.
 */
export function checkSections(raw: Partial<Record<SectionKey, unknown>>, message?: string): PartialContent {
  const out: PartialContent = {};
  const problems: SectionProblem[] = [];
  for (const k of SECTION_KEYS) {
    if (raw[k] === undefined) continue;
    const r = checkSection(k, raw[k]);
    if (r.ok) (out as Record<SectionKey, unknown>)[k] = r.value;
    else problems.push({ section: k, value: r.value, errors: r.errors });
  }
  if (problems.length) throw invalidContent(problems, message);
  return out;
}

export type PublishInput = { baseRelease: number; sections: PartialContent; note: string; force: boolean };

/** PublishRequest from a JSON body: 400 for a malformed request, 422 when the content breaks the rules. */
export function readPublishRequest(body: Record<string, unknown>): PublishInput {
  const baseRelease = intValue(body.baseRelease, { label: "baseRelease", min: 0, max: MAX_RELEASE });
  const raw = body.sections;
  if (!isRecord(raw)) throw badRequest("Send the sections to publish.");
  const keys = Object.keys(raw);
  for (const k of keys) if (!isSectionKey(k)) throw badRequest(`There is no section called "${truncate(k, 40)}".`);
  if (!keys.some(k => raw[k] !== undefined && raw[k] !== null)) throw badRequest("Send at least one section to publish.");
  for (const k of keys) if (raw[k] === null) throw badRequest(`Send the ${SECTION_LABELS[k as SectionKey]} content, not null.`);
  const note = textField(body, "note", { label: "The note", max: LIMITS.noteMaxLength, required: false }).trim();
  const force = booleanField(body, "force", "force");
  return { baseRelease, sections: checkSections(raw as Partial<Record<SectionKey, unknown>>), note, force };
}

export type RestoreInput = { release: number; section: SectionKey | null; note: string };

/** RestoreRequest from a JSON body. */
export function readRestoreRequest(body: Record<string, unknown>): RestoreInput {
  const release = intValue(body.release, { label: "release", min: 1, max: MAX_RELEASE });
  const s = body.section;
  if (s !== undefined && s !== null && !isSectionKey(s)) throw badRequest("There is no section with that name.");
  const note = textField(body, "note", { label: "The note", max: LIMITS.noteMaxLength, required: false }).trim();
  return { release, section: s === undefined || s === null ? null : s, note };
}

/* ================= Planning (pure) ================= */

export type SectionPlan = {
  /** What will be published for this section. */
  content: AnySection;
  conflicts: Conflict[];
  /** The result includes someone else's newer changes (it differs from what the editor sent). */
  combined: boolean;
};

/**
 * One section of a publish. `base` is the section as it was in the editor's base release, or null when nobody
 * has published this section since then (no merge needed). `live` is the section as it is live now.
 */
export function planSection(section: SectionKey, mine: AnySection, base: AnySection | null, live: AnySection): SectionPlan {
  if (base === null) return { content: mine, conflicts: [], combined: false };
  const { merged, conflicts } = merge(section, base, mine, live, "mine");
  return { content: merged, conflicts, combined: !sameContent(merged, mine) };
}

/* ================= Store helpers ================= */

const pick = (content: PartialContent, keys: readonly SectionKey[]): PartialContent =>
  Object.fromEntries(keys.filter(k => content[k] !== undefined).map(k => [k, content[k]])) as PartialContent;

export type NewRelease = {
  /** The live release before this one (null for the first release). */
  live: ReleaseDoc | null;
  liveContent: SectionContent | null;
  /** The complete content of the new release. */
  content: SectionContent;
  /** Version numbers for sections that don't get a new version. */
  versions: VersionMap;
  /** Sections that get a new section version (their content is new to the database). */
  newVersions: readonly SectionKey[];
  /** Sections whose content differs from the live release. */
  changed: readonly SectionKey[];
  actor: ActorRef;
  now: Date;
  note: string;
  source: ReleaseDoc["source"];
  restoredFrom: ReleaseDoc["restoredFrom"];
  merged: readonly SectionKey[];
};

/**
 * Writes the new section versions and the release (number = live + 1). Call inside a transaction. Operations run
 * one after another (MongoDB transactions don't allow parallel operations).
 */
export async function writeRelease(store: ContentStore, r: NewRelease): Promise<ReleaseDoc> {
  const number = (r.live?._id ?? 0) + 1;
  const versions: VersionMap = versionMap(r.versions);
  for (const k of r.newVersions) {
    const n = (await store.maxVersion(k)) + 1;
    await store.insertVersion({ _id: sectionVersionId(k, n), section: k, n, content: r.content[k], createdAt: r.now, createdBy: r.actor, release: number });
    versions[k] = n;
  }
  const summaries: ReleaseDoc["summaries"] = {};
  for (const k of r.changed) summaries[k] = describeChanges(k, r.liveContent?.[k] ?? null, r.content[k]);
  const doc: ReleaseDoc = {
    _id: number,
    publishedAt: r.now,
    publishedBy: r.actor,
    note: r.note,
    versions,
    changed: SECTION_KEYS.filter(k => r.changed.includes(k)),
    summaries,
    source: r.source,
    restoredFrom: r.restoredFrom,
    merged: SECTION_KEYS.filter(k => r.merged.includes(k)),
    images: imagePathsIn(r.content),
  };
  await store.insertRelease(doc);
  return doc;
}

/* ================= Publish ================= */

export type Published = {
  release: ReleaseDoc;
  /** The sections as published, for every section the request named. */
  sections: PartialContent;
};

/** The API answer for a publish or restore. */
export const publishResponse = (p: Published, deploy: DeployInfo): PublishResponse => ({
  release: p.release._id,
  publishedAt: p.release.publishedAt.toISOString(),
  sections: p.sections,
  versions: versionMap(p.release.versions),
  merged: p.release.merged,
  summaries: p.release.summaries,
  deploy,
});

/** The whole publish. Run it inside one transaction (it may run more than once). */
export async function publishInStore(store: ContentStore, input: PublishInput, actor: ActorRef, now: Date): Promise<Published> {
  const live = await store.latestRelease();
  if (!live) throw notInitialised();
  const unknownBase = () => badRequest("The version you started from isn't known. Reload the admin and try again.");
  if (input.baseRelease < 1 || input.baseRelease > live._id) throw unknownBase();
  const base = input.baseRelease === live._id ? live : await store.getRelease(input.baseRelease);
  if (!base) throw unknownBase();

  const sent = SECTION_KEYS.filter(k => input.sections[k] !== undefined);
  const needBase = sent.filter(k => base.versions[k] !== live.versions[k]);
  const loaded = await loadVersions(store, [
    ...SECTION_KEYS.map(k => [k, live.versions[k]] as [SectionKey, number]),
    ...needBase.map(k => [k, base.versions[k]] as [SectionKey, number]),
  ]);
  const liveContent = allContent(loaded, live.versions);

  const planned: PartialContent = {};
  const conflicts: Partial<Record<SectionKey, Conflict[]>> = {};
  const combined: SectionKey[] = [];
  for (const k of sent) {
    const baseContent = needBase.includes(k) ? contentOf(loaded, k, base.versions[k]) : null;
    const plan = planSection(k, input.sections[k] as AnySection, baseContent, liveContent[k]);
    (planned as Record<SectionKey, unknown>)[k] = plan.content;
    if (plan.conflicts.length) conflicts[k] = plan.conflicts;
    if (plan.combined) combined.push(k);
  }
  if (Object.keys(conflicts).length && !input.force) throw conflictError(conflicts, live, pick(liveContent, sent));

  // Merged content must follow the rules too (for example two people each adding a What We Do item)
  const final = checkSections(planned);
  const changed = sent.filter(k => !sameContent(final[k], liveContent[k]));
  if (!changed.length) throw badRequest("Nothing to publish: the live site already has this content.");

  const content = { ...liveContent, ...pick(final, changed) } as SectionContent;
  const paths = imagePathsIn(changed.map(k => content[k]));
  const stored = new Set((await store.imageInfo(paths)).map(i => i.path));
  const missing = paths.filter(p => !stored.has(p));
  if (missing.length) throw missingImages(missing);

  const release = await writeRelease(store, {
    live, liveContent, content, versions: live.versions, newVersions: changed, changed,
    actor, now, note: input.note, source: "publish", restoredFrom: null, merged: combined,
  });
  return { release, sections: pick(content, sent) };
}

/* ================= Restore ================= */

/** Makes an old release (or one section of it) live again as a new release. Run it inside one transaction. */
export async function restoreInStore(store: ContentStore, input: RestoreInput, actor: ActorRef, now: Date): Promise<Published> {
  const live = await store.latestRelease();
  if (!live) throw notInitialised();
  const target = input.release === live._id ? live : await store.getRelease(input.release);
  if (!target) throw notFound(`There is no version #${input.release}.`);

  const keys: readonly SectionKey[] = input.section ? [input.section] : SECTION_KEYS;
  const versions: VersionMap = versionMap(live.versions);
  for (const k of keys) versions[k] = target.versions[k];
  const loaded = await loadVersions(store, SECTION_KEYS.flatMap(k => [[k, live.versions[k]], [k, versions[k]]] as [SectionKey, number][]));
  const liveContent = allContent(loaded, live.versions);
  const content = allContent(loaded, versions);

  const changed = SECTION_KEYS.filter(k => !sameContent(content[k], liveContent[k]));
  const what = input.section ? `${SECTION_LABELS[input.section]} from version #${input.release}` : `version #${input.release}`;
  if (!changed.length) throw badRequest(`The live site already shows ${what}.`);
  // The build refuses content that breaks the rules, so an old version must pass today's rules to go live again
  // (for example the starting copy's team links, until they are fixed)
  checkSections(pick(content, changed), `${what[0].toUpperCase()}${what.slice(1)} breaks the current content rules, so the site can't be rebuilt with it. Fix the items listed in the editor and publish instead.`);

  const release = await writeRelease(store, {
    live, liveContent, content, versions, newVersions: [], changed,
    actor, now, note: input.note || `Made ${what} live again`, source: "restore",
    restoredFrom: { release: input.release, section: input.section }, merged: [],
  });
  return { release, sections: pick(content, keys) };
}
