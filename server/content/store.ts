/**
 * The content database behind one small interface (ContentStore), so the publish, restore and import logic can be
 * tested without MongoDB (memoryStore.ts implements the same interface for tests).
 *
 * History is append-only: nothing here updates or deletes a release, a section version or an image. The only
 * documents that change are deploy records.
 */
import { MongoServerError, type ClientSession } from "mongodb";
import type { ActorName, DeployInfo, DeployState, ReleaseSummary, VersionMap } from "../../shared/api.ts";
import type { SectionContent } from "../../shared/content.ts";
import { SECTION_KEYS, type ImageType, type SectionKey } from "../../shared/sections.ts";
import { actorOf } from "../auth/audit.ts";
import { Binary, sectionVersionId, type ActorRef, type Collections, type DeployDoc, type ImageDoc, type ReleaseDoc, type SectionVersionDoc } from "../db.ts";
import type { AppDeps } from "../deps.ts";
import { binaryToBuffer } from "./images.ts";

/** An image without its bytes. */
export type ImageInfo = { path: string; sha256: string; contentType: ImageType; size: number; width: number; height: number };
/** A new image to store. */
export type NewImage = ImageInfo & { data: Uint8Array };

export type ContentStore = {
  /** The live release (the highest number), or null when nothing is published. */
  latestRelease(): Promise<ReleaseDoc | null>;
  getRelease(n: number): Promise<ReleaseDoc | null>;
  /** Newest first, only releases below `before` when it is set. */
  listReleases(before: number | null, limit: number): Promise<ReleaseDoc[]>;
  /** Section versions by _id (sectionVersionId); unknown ids are left out. */
  getVersions(ids: string[]): Promise<SectionVersionDoc[]>;
  /** The highest version number stored for a section (0 when none). */
  maxVersion(section: SectionKey): Promise<number>;
  insertVersion(doc: SectionVersionDoc): Promise<void>;
  insertRelease(doc: ReleaseDoc): Promise<void>;
  /** The stored images among these paths. */
  imageInfo(paths: string[]): Promise<ImageInfo[]>;
  /** Stored images with these exact bytes (usually none or one). */
  imagesBySha(sha256: string): Promise<ImageInfo[]>;
  /** The bytes of an image with this sha256, or null. */
  imageData(sha256: string): Promise<{ contentType: ImageType; data: Buffer } | null>;
  /**
   * Stores the image unless its path is already stored (paths never change). Returns whether it was added and the
   * sha256 stored under that path.
   */
  addImage(image: NewImage, at: Date, by: ActorRef): Promise<{ added: boolean; sha256: string }>;
  getDeploys(releases: number[]): Promise<DeployDoc[]>;
  /** Records a rebuild request for a release (attempts counts every request). */
  saveDeploy(release: number, state: DeployState, error: string | null, at: Date): Promise<DeployDoc | null>;
};

/** Runs `fn` with a store whose writes all commit together or not at all. `fn` may run more than once. */
export type RunTransaction = <T>(fn: (store: ContentStore) => Promise<T>) => Promise<T>;

/* ================= MongoDB ================= */

export function mongoStore(c: Collections, session?: ClientSession): ContentStore {
  const s = session ? { session } : {};
  const imageInfoOf = (d: Omit<ImageDoc, "data">): ImageInfo =>
    ({ path: d._id, sha256: d.sha256, contentType: d.contentType, size: d.size, width: d.width, height: d.height });
  return {
    latestRelease: () => c.releases.findOne({}, { ...s, sort: { _id: -1 } }),
    getRelease: n => c.releases.findOne({ _id: n }, s),
    listReleases: (before, limit) =>
      c.releases.find(before === null ? {} : { _id: { $lt: before } }, { ...s, sort: { _id: -1 }, limit }).toArray(),
    getVersions: ids => (ids.length ? c.sectionVersions.find({ _id: { $in: ids } }, s).toArray() : Promise.resolve([])),
    async maxVersion(section) {
      const top = await c.sectionVersions.findOne({ section }, { ...s, sort: { n: -1 }, projection: { n: 1 } });
      return top?.n ?? 0;
    },
    async insertVersion(doc) { await c.sectionVersions.insertOne(doc, s); },
    async insertRelease(doc) { await c.releases.insertOne(doc, s); },
    async imageInfo(paths) {
      if (!paths.length) return [];
      const docs = await c.images.find({ _id: { $in: paths } }, { ...s, projection: { data: 0 } }).toArray();
      return docs.map(imageInfoOf);
    },
    async imagesBySha(sha256) {
      const docs = await c.images.find({ sha256 }, { ...s, projection: { data: 0 }, limit: 20 }).toArray();
      return docs.map(imageInfoOf);
    },
    async imageData(sha256) {
      const d = await c.images.findOne({ sha256 }, { ...s, projection: { contentType: 1, data: 1 } });
      return d ? { contentType: d.contentType, data: binaryToBuffer(d.data) } : null;
    },
    async addImage(image, at, by) {
      const folder = image.path.split("/")[2] as ImageDoc["folder"];
      const doc: Omit<ImageDoc, "_id"> = {
        sha256: image.sha256, folder, contentType: image.contentType, size: image.size, width: image.width, height: image.height,
        data: new Binary(image.data), createdAt: at, createdBy: by,
      };
      const r = await c.images.updateOne({ _id: image.path }, { $setOnInsert: doc }, { ...s, upsert: true });
      if (r.upsertedCount === 1) return { added: true, sha256: image.sha256 };
      const existing = await c.images.findOne({ _id: image.path }, { ...s, projection: { sha256: 1 } });
      return { added: false, sha256: existing?.sha256 ?? image.sha256 };
    },
    getDeploys: releases => (releases.length ? c.deploys.find({ _id: { $in: releases } }, s).toArray() : Promise.resolve([])),
    saveDeploy: (release, state, error, at) =>
      c.deploys.findOneAndUpdate(
        { _id: release },
        { $set: { state, error, updatedAt: at }, $inc: { attempts: 1 }, $setOnInsert: { requestedAt: at } },
        { ...s, upsert: true, returnDocument: "after" },
      ),
  };
}

const isDuplicateKey = (e: unknown) => e instanceof MongoServerError && e.code === 11000;

/**
 * A transaction on the real database. Two publishes at the same moment both try to add the next release number:
 * MongoDB retries write conflicts itself, and a duplicate key is retried here (the loser then merges with the
 * winner's release, like any later publish).
 */
export function mongoTransaction(deps: AppDeps): RunTransaction {
  return async <T>(fn: (store: ContentStore) => Promise<T>) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await deps.db.transaction((session, c) => fn(mongoStore(c, session)));
      } catch (e) {
        if (attempt < 3 && isDuplicateKey(e)) continue;
        throw e;
      }
    }
  };
}

/** A store for reads outside a transaction. */
export const readStore = async (deps: AppDeps) => mongoStore(await deps.db.collections());

/* ================= Helpers ================= */

/** The signed-in account as the author of a release (the same helper the activity log uses). */
export { actorOf };

/** Section content by version id (sectionVersionId). */
export type VersionContent = Map<string, SectionContent[SectionKey]>;

/** Loads the given section versions in one query (duplicates are fetched once). */
export async function loadVersions(store: ContentStore, pairs: readonly (readonly [SectionKey, number])[]): Promise<VersionContent> {
  const ids = [...new Set(pairs.map(([k, n]) => sectionVersionId(k, n)))];
  const docs = await store.getVersions(ids);
  return new Map(docs.map(d => [d._id, d.content]));
}

/** One loaded section version. Throws when it's missing (history is never deleted, so that would be a bug). */
export function contentOf<K extends SectionKey>(loaded: VersionContent, section: K, n: number): SectionContent[K] {
  const c = loaded.get(sectionVersionId(section, n));
  if (c === undefined) throw new Error(`Section version ${sectionVersionId(section, n)} is missing`);
  return c as SectionContent[K];
}

/** Every section of a version map, from loaded versions. */
export const allContent = (loaded: VersionContent, versions: VersionMap): SectionContent =>
  Object.fromEntries(SECTION_KEYS.map(k => [k, contentOf(loaded, k, versions[k])])) as SectionContent;

/** Every section of a release. */
export const loadAllSections = async (store: ContentStore, versions: VersionMap): Promise<SectionContent> =>
  allContent(await loadVersions(store, SECTION_KEYS.map(k => [k, versions[k]] as const)), versions);

/** A copy of the version map with every section present (older records are complete; this keeps the type honest). */
export const versionMap = (v: Record<SectionKey, number>): VersionMap => Object.fromEntries(SECTION_KEYS.map(k => [k, v[k]])) as VersionMap;

export function deployInfoOf(doc: DeployDoc | null | undefined): DeployInfo | null {
  if (!doc) return null;
  return { state: doc.state, at: doc.updatedAt.toISOString(), ...(doc.error ? { error: doc.error } : {}) };
}

const actorName = (a: ActorRef): ActorName => a.name;

export function releaseSummary(r: ReleaseDoc, deploy: DeployDoc | null | undefined): ReleaseSummary {
  return {
    release: r._id,
    publishedAt: r.publishedAt.toISOString(),
    publishedBy: actorName(r.publishedBy),
    note: r.note,
    changed: r.changed,
    summaries: r.summaries,
    source: r.source,
    restoredFrom: r.restoredFrom,
    deploy: deployInfoOf(deploy),
  };
}
