/**
 * The editor's unpublished work: pure logic, no React.
 *
 * A draft is { baseRelease, base, content }. `content` is what the editor sees; `base` is what each section's edits
 * are measured against; `baseRelease` is sent with Publish so the server can combine the edits with anything
 * published since (shared/merge.ts). Rule that keeps this safe: every section's `base` comes from `baseRelease` or a
 * later release, never an older one (otherwise a publish could quietly undo someone else's change). So the draft
 * only moves to a newer release with the full content of that release (GET /api/content).
 *
 * Unpublished work is also kept on this device (localStorage, per signed-in person) until it's published, and
 * offered back on the next visit.
 */
import type { PartialContent } from "../../../shared/content.ts";
import { merge, sameContent } from "../../../shared/merge.ts";
import { SECTION_KEYS, type SectionKey } from "../../../shared/sections.ts";
import { normaliseSection } from "../../../shared/validate.ts";
import type { Content } from "./model";

export type DraftState = { baseRelease: number; base: Content; content: Content };
/** How clashing items are handled when the draft moves to a newer release: "keep" leaves clashing sections for Publish to report. */
export type Prefer = "keep" | "mine" | "theirs";
export type Latest = { release: number; sections: Content };

const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
/** Sets one section (a helper, because `obj[k] = v` with a union key doesn't type-check). */
export function put<K extends SectionKey>(obj: Content | PartialContent, key: K, value: Content[K]) {
  (obj as Record<SectionKey, unknown>)[key] = value;
}

/** An empty value for every section (used while nothing is published yet). */
export const emptyContent = (): Content => {
  const out = {} as Content;
  for (const k of SECTION_KEYS) put(out, k, normaliseSection(k, undefined));
  return out;
};

export const dirtyKeys = (d: DraftState): SectionKey[] => SECTION_KEYS.filter(k => !sameContent(d.base[k], d.content[k]));

/** A fresh draft of a release, with no edits. */
export const fresh = (latest: Latest): DraftState => ({ baseRelease: latest.release, base: latest.sections, content: copy(latest.sections) });

/**
 * Moves the draft onto `latest`, keeping its edits. Sections without edits simply take the new content. Edited
 * sections are combined item by item; if any item clashes and `prefer` is "keep", the edited sections stay exactly
 * as they are on the old base (Publish then shows the clash), and `conflicts` counts the clashes.
 */
export function rebase(prev: DraftState, latest: Latest, prefer: Prefer = "keep"): { state: DraftState; conflicts: number } {
  const dirty = prev.baseRelease === 0 ? [] : dirtyKeys(prev);
  if (!dirty.length) return { state: fresh(latest), conflicts: 0 };
  const base = { ...latest.sections }, content = { ...latest.sections };
  let conflicts = 0;
  for (const k of dirty) {
    const r = merge(k, prev.base[k], prev.content[k], latest.sections[k], prefer === "theirs" ? "theirs" : "mine");
    conflicts += r.conflicts.length;
    put(content, k, copy(r.merged));
  }
  if (conflicts && prefer === "keep") {
    for (const k of dirty) { put(base, k, prev.base[k]); put(content, k, prev.content[k]); }
    return { state: { baseRelease: prev.baseRelease, base, content: copy(content) }, conflicts };
  }
  return { state: { baseRelease: latest.release, base, content: copy(content) }, conflicts };
}

/**
 * After a successful publish: the sections sent become their published (possibly combined) version. Edits made
 * while the publish was on its way are combined on top. The base release stays; reloadContent() moves on.
 */
export function published(prev: DraftState, sent: PartialContent, result: PartialContent): DraftState {
  const base = { ...prev.base }, content = { ...prev.content };
  for (const k of SECTION_KEYS) {
    const done = result[k];
    if (done === undefined) continue;
    put(base, k, done);
    const now = prev.content[k], was = sent[k];
    put(content, k, was === undefined || sameContent(now, was) ? copy(done) : copy(merge(k, was, now, done, "mine").merged));
  }
  return { baseRelease: prev.baseRelease, base, content };
}

/* ---------- Kept on this device ---------- */

export type SavedDraft = {
  v: 1;
  userId: string;
  baseRelease: number;
  savedAt: string;
  /** Only the edited sections. */
  base: PartialContent;
  draft: PartialContent;
  /** Images uploaded from this device: path → image id (for previews before they're live). */
  images: Record<string, string>;
};

const storageKey = (userId: string) => `cis-admin-draft:${userId}`;

export function toSaved(d: DraftState, userId: string, images: Record<string, string>): SavedDraft | null {
  const dirty = dirtyKeys(d);
  if (!dirty.length || d.baseRelease === 0) return null;
  const base: PartialContent = {}, draft: PartialContent = {};
  for (const k of dirty) { put(base, k, d.base[k]); put(draft, k, d.content[k]); }
  return { v: 1, userId, baseRelease: d.baseRelease, savedAt: new Date().toISOString(), base, draft, images };
}

/** Saves (or with null, forgets) the draft. Returns false when this browser won't store it (private mode, full). */
export function writeSaved(userId: string, saved: SavedDraft | null): boolean {
  try {
    if (saved) localStorage.setItem(storageKey(userId), JSON.stringify(saved));
    else localStorage.removeItem(storageKey(userId));
    return true;
  } catch {
    return false;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function readSaved(userId: string): SavedDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const d: unknown = JSON.parse(raw);
    if (!isObject(d) || d.v !== 1 || d.userId !== userId || typeof d.baseRelease !== "number" || !isObject(d.base) || !isObject(d.draft)) return null;
    const base: PartialContent = {}, draft: PartialContent = {};
    for (const k of SECTION_KEYS) {
      if (d.base[k] === undefined || d.draft[k] === undefined) continue;
      put(base, k, normaliseSection(k, d.base[k]));
      put(draft, k, normaliseSection(k, d.draft[k]));
    }
    const images: Record<string, string> = {};
    if (isObject(d.images)) for (const [p, id] of Object.entries(d.images)) if (typeof id === "string") images[p] = id;
    return { v: 1, userId, baseRelease: d.baseRelease, savedAt: typeof d.savedAt === "string" ? d.savedAt : "", base, draft, images };
  } catch {
    return null;
  }
}

/** The sections a saved draft still changes compared with what is live. */
export const savedSections = (saved: SavedDraft, latest: Latest): SectionKey[] =>
  SECTION_KEYS.filter(k => saved.draft[k] !== undefined && !sameContent(saved.draft[k], latest.sections[k]));

/** The saved work on top of the newest release, or null when it's all live already. */
export function restoreSaved(saved: SavedDraft, latest: Latest): DraftState | null {
  const keys = savedSections(saved, latest);
  if (!keys.length) return null;
  // The database was replaced (its releases start again from 1): measure the edits against what is live
  const unknownBase = saved.baseRelease > latest.release || saved.baseRelease < 1;
  const base = { ...latest.sections }, content = { ...latest.sections };
  for (const k of keys) {
    put(content, k, saved.draft[k] as Content[typeof k]);
    if (!unknownBase) put(base, k, saved.base[k] as Content[typeof k]);
  }
  const prev: DraftState = { baseRelease: unknownBase ? latest.release : saved.baseRelease, base, content };
  return rebase(prev, latest).state;
}
