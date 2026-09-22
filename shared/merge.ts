/**
 * Item-level 3-way merge. An editor's changes are worked out against the release they started from (base). If
 * someone else published since (theirs), changes to different items combine on their own; only when both changed
 * the same item differently (or one deleted what the other edited) is it a conflict.
 *
 * Items: events by slug; team by academic year id, then team group slug, then member (and faculty) name;
 * achievements by title and year; FAQs by question; resources by topic, then link URL; Join steps and benefits by
 * title; site settings and Home copy field by field; What We Do items by title; About paragraphs by position.
 *
 * Order: a list keeps "mine" order, unless only "theirs" reordered it (then theirs). Items that are only in the
 * other list keep their place next to the item they followed there, so an item added at the end is appended.
 */
import type { SectionContent } from "./content.ts";
import type { SectionKey } from "./sections.ts";
import { SPECS, isRecord, keyed, reordered, sameContent, type ListSpec, type ParagraphsSpec, type RecordSpec, type Spec } from "./structure.ts";

export { sameContent };

/**
 * Both sides changed the same item. `key` identifies it inside the section (for example "analytica" or
 * "sessions/2025-26/groups/design/members/Vijay R"); `mine` and `theirs` are that item's value on each side,
 * with null meaning it was deleted there.
 */
export type Conflict = { key: string; label: string; mine: unknown; theirs: unknown };
export type MergeResult<T> = { merged: T; conflicts: Conflict[] };
/** Which side a conflicting item takes in `merged`: "mine" (Publish mine anyway) or "theirs" (Load theirs). */
export type Prefer = "mine" | "theirs";

type Ctx = { prefer: Prefer; conflicts: Conflict[] };
const join = (path: string, seg: string) => (path ? `${path}/${seg}` : seg);

function conflict(ctx: Ctx, key: string, label: string, m: unknown, t: unknown): unknown {
  ctx.conflicts.push({ key, label, mine: m === undefined ? null : m, theirs: t === undefined ? null : t });
  return ctx.prefer === "mine" ? m : t;
}

function mergeValue(spec: Spec, b: unknown, m: unknown, t: unknown, path: string, parent: string, ctx: Ctx): unknown {
  if (sameContent(m, t)) return m;
  if (sameContent(m, b)) return t;
  if (sameContent(t, b)) return m;
  // Both sides changed it, differently
  const label = spec.kind === "list" ? parent : spec.label(m ?? t ?? b, parent);
  if (m === undefined || t === undefined) return conflict(ctx, path, label, m, t);
  switch (spec.kind) {
    case "atom": return conflict(ctx, path, label, m, t);
    case "record": return isRecord(m) && isRecord(t) ? mergeRecord(spec, b, m, t, path, label, ctx) : conflict(ctx, path, label, m, t);
    case "list": return Array.isArray(m) && Array.isArray(t) ? mergeList(spec, b, m, t, path, parent, ctx) : conflict(ctx, path, parent, m, t);
    case "paragraphs": return mergeParagraphs(spec, b, m, t, path, parent, ctx);
  }
}

function mergeRecord(spec: RecordSpec, b: unknown, m: Record<string, unknown>, t: Record<string, unknown>, path: string, label: string, ctx: Ctx) {
  const base = isRecord(b) ? b : {};
  const out: Record<string, unknown> = {};
  for (const [f, fieldSpec] of Object.entries(spec.fields)) {
    const v = mergeValue(fieldSpec, base[f], m[f], t[f], join(path, f), label, ctx);
    if (v !== undefined) out[f] = v;
  }
  // Fields the structure doesn't know about (normalised content has none): keep the preferred side's
  const extra = ctx.prefer === "mine" ? m : t;
  for (const [f, v] of Object.entries(extra)) if (!(f in spec.fields) && v !== undefined) out[f] = v;
  return out;
}

function mergeList(spec: ListSpec, b: unknown, m: unknown[], t: unknown[], path: string, parent: string, ctx: Ctx) {
  const B = keyed(b, spec.key), M = keyed(m, spec.key), T = keyed(t, spec.key);
  const kept = new Map<string, unknown>();
  for (const k of new Set([...M.order, ...T.order, ...B.order])) {
    const v = mergeValue(spec.item, B.items.get(k), M.items.get(k), T.items.get(k), join(path, k), parent, ctx);
    if (v !== undefined) kept.set(k, v);
  }
  // Keep mine's order unless only theirs reordered the shared items
  const [primary, other] = !reordered(B, M) && reordered(B, T) ? [T, M] : [M, T];
  const out = primary.order.filter(k => kept.has(k));
  other.order.forEach((k, i) => {
    if (!kept.has(k) || out.includes(k)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const p = out.indexOf(other.order[j]);
      if (p >= 0) { at = p + 1; break; }
    }
    out.splice(at, 0, k);
  });
  for (const k of kept.keys()) if (!out.includes(k)) out.push(k);
  return out.map(k => kept.get(k));
}

/** Paragraphs merge one by one only when no side added or removed any; otherwise the list is one item. */
function mergeParagraphs(spec: ParagraphsSpec, b: unknown, m: unknown, t: unknown, path: string, parent: string, ctx: Ctx) {
  const listLabel = spec.label(m, parent);
  if (!Array.isArray(b) || !Array.isArray(m) || !Array.isArray(t) || m.length !== b.length || t.length !== b.length)
    return conflict(ctx, path, listLabel, m, t);
  return b.map((bp, i) => {
    if (sameContent(m[i], t[i]) || sameContent(t[i], bp)) return m[i];
    if (sameContent(m[i], bp)) return t[i];
    return conflict(ctx, join(path, String(i)), `${parent}: paragraph ${i + 1}`, m[i], t[i]);
  });
}

/**
 * Combines my changes and theirs to one section. `base` is the section as it was in the release I started from,
 * `mine` my edited copy, `theirs` the section as it is live now. Conflicting items take the `prefer` side
 * (default "mine"); every conflict is listed.
 */
export function merge<K extends SectionKey>(
  section: K, base: SectionContent[K], mine: SectionContent[K], theirs: SectionContent[K], prefer: Prefer = "mine",
): MergeResult<SectionContent[K]> {
  const ctx: Ctx = { prefer, conflicts: [] };
  const merged = mergeValue(SPECS[section], base, mine, theirs, "", "", ctx) as SectionContent[K];
  return { merged, conflicts: ctx.conflicts };
}
