/**
 * Plain-language summaries of what changed in a section between two versions, for the Publish and History pages:
 * "1 event added (ANALYTICA), 2 members edited (Priya S and Arun K)".
 */
import type { SectionContent } from "./content.ts";
import type { SectionKey } from "./sections.ts";
import { SPECS, isRecord, keyed, reordered, sameContent, type Noun, type ParagraphsSpec, type RecordSpec, type Spec } from "./structure.ts";
import { joinWords, truncate } from "./text.ts";

export type ChangeKind = "added" | "edited" | "removed";
/** One changed thing. `name` may be "" when there is nothing useful to name (About paragraphs). */
export type Change = { kind: ChangeKind; one: string; many: string; name: string };
export type SectionDiff = {
  section: SectionKey;
  changed: boolean;
  /** The order of existing items changed (for example a member moved up). */
  reordered: boolean;
  changes: Change[];
  /** "1 event added (ANALYTICA)", "Order changed", "No changes" or "First version". */
  summary: string;
};

type Acc = { changes: Change[]; reordered: boolean };

const push = (acc: Acc, kind: ChangeKind, noun: Noun, value: unknown) =>
  acc.changes.push({ kind, one: noun.one, many: noun.many, name: noun.name(value).trim() });

/** Walks one value. Returns true when something changed that the caller should count as an edit of its own item. */
function walk(spec: Spec, before: unknown, after: unknown, acc: Acc): boolean {
  if (sameContent(before, after)) return false;
  switch (spec.kind) {
    case "atom":
      if (!spec.noun) return true;
      push(acc, before === undefined ? "added" : after === undefined ? "removed" : "edited", spec.noun, after ?? before);
      return false;
    case "record":
      return walkRecord(spec, before, after, acc);
    case "list": {
      const B = keyed(before, spec.key), A = keyed(after, spec.key);
      for (const k of new Set([...A.order, ...B.order])) walk(spec.item, B.items.get(k), A.items.get(k), acc);
      if (reordered(B, A)) acc.reordered = true;
      return false;
    }
    case "paragraphs":
      walkParagraphs(spec, before, after, acc);
      return false;
  }
}

function walkRecord(spec: RecordSpec, before: unknown, after: unknown, acc: Acc): boolean {
  if (before === undefined || after === undefined) {
    if (!spec.noun) return true;
    push(acc, before === undefined ? "added" : "removed", spec.noun, after ?? before);
    return false;
  }
  const b = isRecord(before) ? before : {}, a = isRecord(after) ? after : {};
  let edited = false;
  for (const [f, fieldSpec] of Object.entries(spec.fields)) if (walk(fieldSpec, b[f], a[f], acc)) edited = true;
  if (!edited) return false;
  if (!spec.noun) return true;
  push(acc, "edited", spec.noun, after);
  return false;
}

function walkParagraphs(spec: ParagraphsSpec, before: unknown, after: unknown, acc: Acc) {
  const b = Array.isArray(before) ? before : [], a = Array.isArray(after) ? after : [];
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) if (!sameContent(a[i], b[i])) push(acc, "edited", spec.noun, "");
  for (let i = shared; i < a.length; i++) push(acc, "added", spec.noun, "");
  for (let i = shared; i < b.length; i++) push(acc, "removed", spec.noun, "");
}

const KIND_ORDER: ChangeKind[] = ["added", "edited", "removed"];

/** "2 members edited (Priya S and Arun K)" for each kind of change, joined with commas. */
export function summariseChanges(changes: Change[], order = false): string {
  const groups = new Map<string, Change[]>();
  for (const kind of KIND_ORDER) {
    for (const c of changes) {
      if (c.kind !== kind) continue;
      const k = `${kind}|${c.one}`;
      groups.set(k, [...(groups.get(k) ?? []), c]);
    }
  }
  const parts = [...groups.values()].map(list => {
    const n = list.length, { kind, one, many } = list[0];
    const names = [...new Set(list.map(c => c.name).filter(Boolean))].map(s => truncate(s, 40));
    const shown = names.length > 3 ? [...names.slice(0, 3), `${names.length - 3} more`] : names;
    return `${n} ${n === 1 ? one : many} ${kind}${shown.length ? ` (${joinWords(shown)})` : ""}`;
  });
  if (order) parts.push(parts.length ? "order changed" : "Order changed");
  return parts.join(", ") || "No changes";
}

/**
 * What changed in one section from `before` to `after`. With no `before` (the first release, or a section that
 * didn't exist yet) the summary is "First version".
 */
export function diffSection<K extends SectionKey>(section: K, before: SectionContent[K] | null | undefined, after: SectionContent[K]): SectionDiff {
  if (before === null || before === undefined) return { section, changed: true, reordered: false, changes: [], summary: "First version" };
  const acc: Acc = { changes: [], reordered: false };
  walk(SPECS[section], before, after, acc);
  const changed = acc.changes.length > 0 || acc.reordered || !sameContent(before, after);
  const summary = acc.changes.length || acc.reordered ? summariseChanges(acc.changes, acc.reordered) : changed ? "Edited" : "No changes";
  return { section, changed, reordered: acc.reordered, changes: acc.changes, summary };
}

/** Just the summary line. */
export const describeChanges = <K extends SectionKey>(section: K, before: SectionContent[K] | null | undefined, after: SectionContent[K]) =>
  diffSection(section, before, after).summary;
