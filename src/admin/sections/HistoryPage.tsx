import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, Loader2, RotateCcw } from "lucide-react";
import { useAdmin } from "../context";
import { ApiError, api, errorText as say } from "../api";
import { Modal, PageTitle, SelectField, TextField } from "../ui";
import {
  api as paths, CONTENT_VERSION_PATH, LIMITS,
  type ContentVersion, type DeployInfo, type HistoryPage as HistoryPageData, type ReleaseDetail, type ReleaseSource, type ReleaseSummary,
  type RestoreRequest, type RestoreResponse, type RetryDeployResponse,
} from "../../../shared/api.ts";
import { SECTION_KEYS, SECTION_LABELS, type SectionKey } from "../../../shared/sections.ts";
import { diffSection, type ChangeKind } from "../../../shared/diff.ts";
import { SPECS, isRecord, keyed, reordered, sameContent, type Spec } from "../../../shared/structure.ts";
import type { ErrorItem } from "../../../shared/validate.ts";

/* ---------- Small helpers ---------- */

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
const SMALL_BTN = "btn-ghost btn-sm max-sm:min-h-[44px]";

const SOURCE_LABELS: Record<ReleaseSource, string> = { publish: "", restore: "Undo", import: "Starting content", backup: "From a backup" };

function restoredLine(r: ReleaseSummary) {
  if (r.source === "import") return "Copied the starting content into the database.";
  if (r.source === "backup") return "Made the content from a backup file live.";
  if (r.source !== "restore" || !r.restoredFrom) return "";
  const { release, section } = r.restoredFrom;
  return section ? `Made the ${SECTION_LABELS[section]} section from release #${release} live again.` : `Made release #${release} live again.`;
}

/* ---------- Before and after, item by item ---------- */

type RowKind = ChangeKind | "moved";
type Row = { kind: RowKind; label: string; before: unknown; after: unknown };

/** Walks a section like diff.ts does, but keeps the changed items themselves so they can be shown. */
function collect(spec: Spec, before: unknown, after: unknown, parent: string, out: Row[]) {
  if (sameContent(before, after)) return;
  const kind: ChangeKind = before === undefined ? "added" : after === undefined ? "removed" : "edited";
  switch (spec.kind) {
    case "atom":
      out.push({ kind, label: spec.label(after ?? before, parent), before, after });
      return;
    case "record": {
      const label = spec.label(after ?? before, parent);
      if (kind !== "edited" && spec.noun) { out.push({ kind, label, before, after }); return; }
      const b = isRecord(before) ? before : {}, a = isRecord(after) ? after : {};
      for (const [f, s] of Object.entries(spec.fields)) collect(s, b[f], a[f], label, out);
      return;
    }
    case "list": {
      const B = keyed(before, spec.key), A = keyed(after, spec.key);
      for (const k of new Set([...A.order, ...B.order])) collect(spec.item, B.items.get(k), A.items.get(k), parent, out);
      if (reordered(B, A)) out.push({ kind: "moved", label: `${parent}: order changed`, before: undefined, after: undefined });
      return;
    }
    case "paragraphs": {
      const b = Array.isArray(before) ? before : [], a = Array.isArray(after) ? after : [];
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (sameContent(b[i], a[i])) continue;
        out.push({ kind: i >= b.length ? "added" : i >= a.length ? "removed" : "edited", label: `${parent}: paragraph ${i + 1}`, before: b[i], after: a[i] });
      }
    }
  }
}

const FIELD_NAMES: Record<string, string> = {
  slug: "page address", title: "title", type: "type", domain: "domain", series: "series", session: "academic year", date: "start date",
  endDate: "end date", time: "time", venue: "venue", summary: "summary", description: "description", poster: "poster",
  register: "registration link", coordinator: "coordinator", name: "name", role: "role", photo: "photo", linkedin: "LinkedIn",
  github: "GitHub", instagram: "Instagram", year: "year", people: "people", link: "link", image: "photo", q: "question",
  a: "answer", url: "link", note: "note", cta: "button text", href: "button link", useMemberForm: "uses the membership form",
  text: "text", icon: "icon",
};
const blank = (v: unknown) => v === undefined || v === null || v === "" || v === false;
const asText = (v: unknown) =>
  blank(v) ? "(empty)" : typeof v === "string" ? v : typeof v === "boolean" ? "Yes" : typeof v === "number" ? String(v) : JSON.stringify(v, null, 2);

function Value({ tone, title, value }: { tone: "old" | "new"; title: string; value: unknown }) {
  return (
    <div className={`min-w-0 rounded-lg border px-3 py-2 ${tone === "old" ? "border-[#7F1D1D]/70 bg-[#7F1D1D]/15" : "border-[#166534]/70 bg-[#166534]/15"}`}>
      <span className={`block text-[12px] font-medium uppercase tracking-wide ${tone === "old" ? "text-[#FCA5A5]" : "text-[#86EFAC]"}`}>{title}</span>
      <span className={`mt-0.5 block max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-[14px] ${blank(value) ? "text-mute" : "text-cream/90"}`}>{asText(value)}</span>
    </div>
  );
}

function BeforeAfter({ kind, before, after }: { kind: ChangeKind; before: unknown; after: unknown }) {
  if (kind === "added") return <Value tone="new" title="Added" value={after} />;
  if (kind === "removed") return <Value tone="old" title="Removed" value={before} />;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Value tone="old" title="Before" value={before} />
      <Value tone="new" title="After" value={after} />
    </div>
  );
}

const KIND_STYLE: Record<RowKind, { text: string; cls: string }> = {
  added: { text: "Added", cls: "border-[#166534] text-[#86EFAC]" },
  edited: { text: "Edited", cls: "border-violet-soft/60 text-violet-soft" },
  removed: { text: "Removed", cls: "border-[#7F1D1D] text-[#FCA5A5]" },
  moved: { text: "Moved", cls: "border-line text-mute" },
};

function ChangeRow({ row }: { row: Row }) {
  const { kind, before, after } = row;
  const style = KIND_STYLE[kind];
  let body: ReactNode = null;
  if (kind !== "moved") {
    if (isRecord(before) || isRecord(after)) {
      // An item with fields (an event, a member, a question): show only the fields that changed, or every filled field
      const b = isRecord(before) ? before : {}, a = isRecord(after) ? after : {};
      const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(f =>
        kind === "edited" ? !(blank(b[f]) && blank(a[f])) && !sameContent(b[f], a[f]) : !blank(kind === "added" ? a[f] : b[f]));
      body = (
        <dl className="mt-3 grid grid-cols-1 gap-3">
          {fields.map(f => (
            <div key={f} className="min-w-0">
              <dt className="mb-1 text-[13px] font-medium text-mute">{FIELD_NAMES[f] ?? f}</dt>
              <dd><BeforeAfter kind={kind} before={b[f]} after={a[f]} /></dd>
            </div>
          ))}
        </dl>
      );
    } else body = <div className="mt-3"><BeforeAfter kind={kind} before={before} after={after} /></div>;
  }
  return (
    <li className="min-w-0 rounded-xl border border-line bg-ink/40 p-4">
      <p className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-0.5 text-[12.5px] font-medium ${style.cls}`}>{style.text}</span>
        <span className="min-w-0 break-words font-medium">{row.label}</span>
      </p>
      {body}
    </li>
  );
}

/* ---------- After a restore or an import: rebuild status and "Live" check ---------- */

/**
 * What happened to the site rebuild after a new release: waits for /content-version.json to show the release
 * ("Live"), or offers Try again when the rebuild didn't start. Also used by the Accounts page.
 */
export function ReleaseResult({ release, deploy: initial, children }: { release: number; deploy: DeployInfo; children?: ReactNode }) {
  const [deploy, setDeploy] = useState(initial);
  const [live, setLive] = useState<"waiting" | "live" | "slow">("waiting");
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");

  useEffect(() => {
    if (deploy.state !== "requested") return;
    let stopped = false, timer = 0;
    const started = Date.now();
    const tick = async () => {
      try {
        const r = await fetch(`${CONTENT_VERSION_PATH}?t=${Date.now()}`, { cache: "no-store" });
        if (r.ok) {
          const v = (await r.json()) as ContentVersion;
          if (typeof v.release === "number" && v.release >= release) { if (!stopped) setLive("live"); return; }
        }
      } catch { /* not built yet, or the file isn't there locally: keep checking */ }
      if (stopped) return;
      if (Date.now() - started > LIMITS.liveCheckMinutes * 60_000) { setLive("slow"); return; }
      timer = window.setTimeout(tick, LIMITS.liveCheckIntervalSeconds * 1000);
    };
    setLive("waiting");
    timer = window.setTimeout(tick, LIMITS.liveCheckIntervalSeconds * 1000);
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [deploy.state, deploy.at, release]);

  const retry = async () => {
    setRetrying(true); setRetryError("");
    try { const res = await api<RetryDeployResponse>(paths.retryDeploy, { method: "POST", body: {} }); setDeploy(res.deploy); }
    catch (e) { setRetryError(say(e)); }
    finally { setRetrying(false); }
  };

  const failed = deploy.state === "failed";
  const icon = failed || live === "slow" ? <AlertTriangle className="mt-0.5 shrink-0 text-gold" />
    : deploy.state === "requested" && live === "waiting" ? <Loader2 className="mt-0.5 shrink-0 text-violet-soft motion-safe:animate-spin" />
      : <CheckCircle2 className="mt-0.5 shrink-0 text-[#4ADE80]" />;
  const status = failed ? `Saved as release #${release}, but the rebuild didn't start.`
    : deploy.state === "skipped" ? `Saved as release #${release}. ${deploy.error || "This admin server isn't set up to rebuild the site, so the live site won't change until the next deploy."}`
      : live === "live" ? `Release #${release} is live on the site.`
        : live === "slow" ? `Saved as release #${release}. The rebuild is taking longer than usual; check the site again in a few minutes.`
          : `Saved as release #${release}. The site is rebuilding, which usually takes a minute or two.`;

  return (
    <div role="status" className={`adm-card flex gap-4 ${failed ? "border-gold/50" : ""}`}>
      {icon}
      <div className="min-w-0 flex-1 text-[15px]">
        {children}
        <p className={children ? "mt-1 text-mute" : "font-medium"}>{status}</p>
        {failed && deploy.error && <p className="mt-1 text-[14px] text-mute">{deploy.error}</p>}
        {failed && (
          <div className="mt-3">
            <button className={SMALL_BTN} disabled={retrying} onClick={retry}>{retrying ? "Trying again…" : "Try again"}</button>
            {retryError && <p role="alert" className="adm-error">{retryError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/** A failed restore in plain words, with the rule problems when an old version breaks today's rules (422 invalid). */
function restoreErrorText(e: unknown): string {
  const items = e instanceof ApiError && e.code === "invalid" && Array.isArray(e.data.items) ? (e.data.items as ErrorItem[]) : [];
  return items.length ? `${say(e)} ${items.map(i => `${i.label}: ${i.message}`).join("; ")}.` : say(e);
}

/* ---------- The page ---------- */

export default function HistoryPage() {
  const { reloadContent } = useAdmin();
  const [releases, setReleases] = useState<ReleaseSummary[] | null>(null);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"" | SectionKey>("");
  const [open, setOpen] = useState<number | null>(null);
  const lastOpened = useRef<number | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async (before?: number) => {
    setLoading(true); setError("");
    try {
      const page = await api<HistoryPageData>(paths.history(before, LIMITS.historyPageSize));
      if (!alive.current) return;
      setReleases(prev => (before === undefined ? page.releases : [...(prev ?? []), ...page.releases]));
      setNextBefore(page.nextBefore);
    } catch (e) { if (alive.current) setError(say(e)); }
    finally { if (alive.current) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Going back to the list puts focus on the release you were looking at
  useEffect(() => {
    if (open !== null || lastOpened.current === null) return;
    document.getElementById(`release-${lastOpened.current}`)?.focus();
  }, [open]);

  const current = releases?.[0]?.release ?? null;
  const shown = releases ? (filter ? releases.filter(r => r.changed.includes(filter)) : releases) : [];

  if (open !== null) return (
    <ReleaseView release={open} current={current}
      onBack={() => setOpen(null)}
      onRestored={() => { void load(); void Promise.resolve(reloadContent()).catch(() => undefined); }} />
  );

  return (
    <>
      <PageTitle title="History">
        Every publish is a numbered release, kept for good. Open one to see what changed, or to make it live again. Restoring creates a new release and deletes nothing.
      </PageTitle>

      <div className="mb-6 max-w-sm">
        <SelectField label="Show releases that changed" value={filter} onChange={v => setFilter(v as "" | SectionKey)}
          options={[{ value: "", label: "Any section" }, ...SECTION_KEYS.map(k => ({ value: k, label: SECTION_LABELS[k] }))]} />
      </div>

      {error && (
        <div role="alert" className="mb-6 rounded-xl border border-[#7F1D1D] bg-[#7F1D1D]/25 px-4 py-3 text-[15px] text-[#FCA5A5]">
          <p>Couldn't load the history. {error}</p>
          <button className={`${SMALL_BTN} mt-3`} onClick={() => void load(releases?.length ? (nextBefore ?? undefined) : undefined)}>Try again</button>
        </div>
      )}

      {releases === null ? (!error && <p role="status" className="adm-card text-mute">Loading the history…</p>)
        : releases.length === 0 ? <p className="adm-card text-mute">Nothing has been published yet. The first publish (or the starting content import) will show up here as release #1.</p>
          : (
            <>
              {shown.length === 0 && (
                <p className="adm-card text-mute">
                  None of the {releases.length} releases loaded so far changed {filter ? SECTION_LABELS[filter] : "anything"}.{nextBefore !== null ? " Load more to look further back." : ""}
                </p>
              )}
              <ul className="grid grid-cols-1 gap-3">
                {shown.map(r => (
                  <li key={r.release}>
                    <button id={`release-${r.release}`} type="button" onClick={() => { lastOpened.current = r.release; setOpen(r.release); window.scrollTo(0, 0); }}
                      className="adm-card flex w-full min-w-0 items-start gap-3 text-left transition-colors hover:border-violet-soft hover:bg-raised">
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-lg font-semibold">Release #{r.release}</span>
                          {r.release === current && <span className="rounded-full bg-gold px-2.5 py-0.5 text-[12.5px] font-semibold text-ink">Current</span>}
                          {SOURCE_LABELS[r.source] && <span className="rounded-full border border-line px-2.5 py-0.5 text-[12.5px] text-mute">{SOURCE_LABELS[r.source]}</span>}
                        </span>
                        <span className="mt-1 block text-[14px] text-mute">{r.publishedBy} · {when(r.publishedAt)}</span>
                        {r.note && <span className="mt-2 block break-words text-[15px]">{r.note}</span>}
                        {restoredLine(r) && <span className="mt-2 block text-[15px] text-cream/90">{restoredLine(r)}</span>}
                        {r.changed.length > 0 && (
                          <span className="mt-2 grid grid-cols-1 gap-1 text-[14px] text-mute">
                            {r.changed.map(k => <span key={k} className="min-w-0 break-words"><span className="text-cream/90">{SECTION_LABELS[k]}:</span> {r.summaries[k] || "edited"}</span>)}
                          </span>
                        )}
                        {r.deploy?.state === "failed" && <span className="mt-2 flex items-center gap-1.5 text-[14px] text-gold"><AlertTriangle size={14} /> The site rebuild didn't start for this release.</span>}
                      </span>
                      <ChevronRight size={18} className="mt-1.5 shrink-0 text-mute" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              {nextBefore !== null && (
                <button className="btn-ghost mt-6 w-full sm:w-auto" disabled={loading} onClick={() => void load(nextBefore)}>{loading ? "Loading…" : "Load older releases"}</button>
              )}
            </>
          )}
    </>
  );
}

/* ---------- One release ---------- */

function ReleaseView({ release, current, onBack, onRestored }: { release: number; current: number | null; onBack: () => void; onRestored: () => void }) {
  const [data, setData] = useState<{ detail: ReleaseDetail; previous: ReleaseDetail | null } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [ask, setAsk] = useState<{ section: SectionKey | null } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [askError, setAskError] = useState("");
  const [done, setDone] = useState<{ res: RestoreResponse; section: SectionKey | null } | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(""); setData(null);
    (async () => {
      try {
        const [detail, previous] = await Promise.all([
          api<ReleaseDetail>(paths.historyRelease(release), { signal: ctrl.signal }),
          release > 1 ? api<ReleaseDetail>(paths.historyRelease(release - 1), { signal: ctrl.signal }).catch(() => null) : Promise.resolve(null),
        ]);
        if (!ctrl.signal.aborted) setData({ detail, previous });
      } catch (e) { if (!ctrl.signal.aborted) setError(say(e)); }
    })();
    return () => ctrl.abort();
  }, [release, attempt]);

  const restore = async () => {
    if (!ask) return;
    setBusy(true); setAskError("");
    try {
      const body: RestoreRequest = { release, ...(ask.section ? { section: ask.section } : {}), ...(note.trim() ? { note: note.trim() } : {}) };
      const res = await api<RestoreResponse>(paths.restore, { method: "POST", body });
      setDone({ res, section: ask.section }); setAsk(null); setNote(""); onRestored();
      window.scrollTo(0, 0);
    } catch (e) { setAskError(restoreErrorText(e)); }
    finally { setBusy(false); }
  };

  const isCurrent = release === current;
  const s = data?.detail.summary;
  const changed = s ? SECTION_KEYS.filter(k => s.changed.includes(k)) : [];

  return (
    <>
      <button className={`${SMALL_BTN} mb-6`} onClick={onBack}><ArrowLeft size={15} /> All releases</button>
      <PageTitle title={`Release #${release}`}
        actions={data && !isCurrent && !done ? <button className="btn-gold" onClick={() => { setAskError(""); setAsk({ section: null }); }}><RotateCcw size={17} /> Make this release live again</button> : undefined}>
        {s ? `${s.publishedBy} · ${when(s.publishedAt)}` : undefined}
      </PageTitle>

      {done && (
        <div className="mb-6">
          <ReleaseResult release={done.res.release} deploy={done.res.deploy}>
            <p className="font-medium">{done.section ? `The ${SECTION_LABELS[done.section]} section from release #${release} is saved as a new release.` : `The content of release #${release} is saved as a new release.`}</p>
          </ReleaseResult>
        </div>
      )}

      {error ? (
        <div role="alert" className="rounded-xl border border-[#7F1D1D] bg-[#7F1D1D]/25 px-4 py-3 text-[15px] text-[#FCA5A5]">
          <p>Couldn't load release #{release}. {error}</p>
          <button className={`${SMALL_BTN} mt-3`} onClick={() => setAttempt(a => a + 1)}>Try again</button>
        </div>
      ) : !data || !s ? <p role="status" className="adm-card text-mute">Loading release #{release}…</p> : (
        <>
          <div className="adm-card mb-6 grid grid-cols-1 gap-2 text-[15px]">
            {s.note && <p className="break-words"><span className="text-mute">Note:</span> {s.note}</p>}
            {restoredLine(s) && <p>{restoredLine(s)}</p>}
            <p className="text-mute">
              {isCurrent ? "This is the current release: it is what the site shows once the rebuild has finished." : "Making this release (or one of its sections) live again creates a new release with that content. Nothing is deleted, so you can always switch back."}
            </p>
          </div>

          {changed.length === 0 && <p className="adm-card text-mute">No content changed in this release.</p>}
          <div className="grid grid-cols-1 gap-6">
            {changed.map(k => <SectionChanges key={k} section={k} detail={data.detail} previous={data.previous}
              onRestore={isCurrent ? undefined : () => { setAskError(""); setAsk({ section: k }); }} />)}
          </div>
        </>
      )}

      {ask && (
        <Modal title={ask.section ? `Restore ${SECTION_LABELS[ask.section]} from release #${release}?` : `Make release #${release} live again?`}
          onClose={() => { if (!busy) setAsk(null); }}
          footer={<>
            <button className="btn-ghost" disabled={busy} onClick={() => setAsk(null)}>Cancel</button>
            <button className="btn-gold" disabled={busy} onClick={restore}>{busy ? "Restoring…" : ask.section ? "Restore this section" : "Make it live"}</button>
          </>}>
          <div className="grid grid-cols-1 gap-4 text-[15px]">
            <p>
              {ask.section
                ? `The ${SECTION_LABELS[ask.section]} section will go back to how it was in release #${release}. Other sections stay as they are now.`
                : `Every section will go back to how it was in release #${release}.`}
            </p>
            <p className="text-mute">This creates a new release and deletes nothing: today's content stays in the history, so you can switch back. It replaces what is live without merging, so edits published after release #{release} to {ask.section ? "this section" : "any section"} are undone.</p>
            <TextField label="Note (optional)" value={note} maxLength={LIMITS.noteMaxLength} placeholder="Why you're restoring it" onChange={setNote} />
            {askError && <p role="alert" className="adm-error">{askError}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}

function SectionChanges({ section, detail, previous, onRestore }: { section: SectionKey; detail: ReleaseDetail; previous: ReleaseDetail | null; onRestore?: () => void }) {
  const after = detail.sections[section];
  const before = previous?.sections[section];
  const summary = before !== undefined ? diffSection(section, before, after).summary : detail.diffs[section]?.summary ?? "First version";
  const rows: Row[] = [];
  if (before !== undefined) collect(SPECS[section], before, after, SECTION_LABELS[section], rows);
  return (
    <section aria-labelledby={`changes-${section}`} className="adm-card min-w-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id={`changes-${section}`} className="font-display text-lg font-semibold">{SECTION_LABELS[section]}</h2>
          <p className="mt-1 break-words text-[15px] text-mute">{summary}</p>
        </div>
        {onRestore && <button className={`${SMALL_BTN} shrink-0`} onClick={onRestore}><RotateCcw size={15} /> Restore just this section</button>}
      </div>
      {before === undefined
        ? <p className="mt-4 text-[14px] text-mute">{previous ? "This section didn't exist before this release." : "This is the first release, so there is nothing to compare it with."}</p>
        : rows.length > 0
          ? <ul className="mt-4 grid grid-cols-1 gap-3">{rows.map((r, i) => <ChangeRow key={i} row={r} />)}</ul>
          : <p className="mt-4 text-[14px] text-mute">Only spacing or empty fields changed.</p>}
    </section>
  );
}
