/**
 * An in-memory ContentStore for tests (no database). Documents are copied in and out, like a real database, and
 * a transaction that throws leaves nothing behind. Not used by the running server.
 */
import type { DeployDoc, ReleaseDoc, SectionVersionDoc } from "../db.ts";
import type { ContentStore, ImageInfo, RunTransaction } from "./store.ts";

type StoredImage = ImageInfo & { data: Buffer };
type State = {
  releases: Map<number, ReleaseDoc>;
  versions: Map<string, SectionVersionDoc>;
  images: Map<string, StoredImage>;
  deploys: Map<number, DeployDoc>;
};

const copy = <T>(v: T): T => structuredClone(v);

/** Thrown like MongoDB's duplicate key error. */
export class DuplicateKeyError extends Error {
  code = 11000;
  constructor(what: string) {
    super(`E11000 duplicate key: ${what}`);
    this.name = "DuplicateKeyError";
  }
}

export type MemoryStore = ContentStore & {
  /** Runs `fn` as one transaction (all or nothing). */
  transaction: RunTransaction;
  /** Everything stored, for assertions. */
  state: State;
};

export function createMemoryStore(): MemoryStore {
  const state: State = { releases: new Map(), versions: new Map(), images: new Map(), deploys: new Map() };
  const store: ContentStore = {
    async latestRelease() {
      const top = Math.max(0, ...state.releases.keys());
      return top ? copy(state.releases.get(top) ?? null) : null;
    },
    async getRelease(n) { return copy(state.releases.get(n) ?? null); },
    async listReleases(before, limit) {
      return [...state.releases.values()].filter(r => before === null || r._id < before).sort((a, b) => b._id - a._id).slice(0, limit).map(copy);
    },
    async getVersions(ids) { return ids.flatMap(id => { const d = state.versions.get(id); return d ? [copy(d)] : []; }); },
    async maxVersion(section) { return Math.max(0, ...[...state.versions.values()].filter(v => v.section === section).map(v => v.n)); },
    async insertVersion(doc) {
      if (state.versions.has(doc._id)) throw new DuplicateKeyError(doc._id);
      state.versions.set(doc._id, copy(doc));
    },
    async insertRelease(doc) {
      if (state.releases.has(doc._id)) throw new DuplicateKeyError(`release ${doc._id}`);
      state.releases.set(doc._id, copy(doc));
    },
    async imageInfo(paths) {
      return paths.flatMap(p => { const i = state.images.get(p); return i ? [{ path: i.path, sha256: i.sha256, contentType: i.contentType, size: i.size, width: i.width, height: i.height }] : []; });
    },
    async imagesBySha(sha256) {
      return [...state.images.values()].filter(x => x.sha256 === sha256).map(i => ({ path: i.path, sha256: i.sha256, contentType: i.contentType, size: i.size, width: i.width, height: i.height }));
    },
    async imageData(sha256) {
      const i = [...state.images.values()].find(x => x.sha256 === sha256);
      return i ? { contentType: i.contentType, data: Buffer.from(i.data) } : null;
    },
    async addImage(image) {
      const existing = state.images.get(image.path);
      if (existing) return { added: false, sha256: existing.sha256 };
      state.images.set(image.path, { ...image, data: Buffer.from(image.data) });
      return { added: true, sha256: image.sha256 };
    },
    async getDeploys(releases) { return releases.flatMap(r => { const d = state.deploys.get(r); return d ? [copy(d)] : []; }); },
    async saveDeploy(release, deployState, error, at) {
      const old = state.deploys.get(release);
      const doc: DeployDoc = { _id: release, state: deployState, error, updatedAt: at, requestedAt: old?.requestedAt ?? at, attempts: (old?.attempts ?? 0) + 1 };
      state.deploys.set(release, doc);
      return copy(doc);
    },
  };

  const transaction: RunTransaction = async fn => {
    const before = {
      releases: new Map(state.releases), versions: new Map(state.versions), images: new Map(state.images), deploys: new Map(state.deploys),
    };
    try {
      return await fn(store);
    } catch (e) {
      state.releases = before.releases;
      state.versions = before.versions;
      state.images = before.images;
      state.deploys = before.deploys;
      throw e;
    }
  };

  return { ...store, transaction, state };
}
