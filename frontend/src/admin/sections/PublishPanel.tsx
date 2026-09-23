import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, FileJson } from "lucide-react";
import { LIMITS, type PublishConflictError, type PublishRequest, type PublishResponse } from "../../../../shared/api.ts";
import type { PartialContent } from "../../../../shared/content.ts";
import { describeChanges } from "../../../../shared/diff.ts";
import type { Conflict } from "../../../../shared/merge.ts";
import { SECTION_KEYS, SECTION_LABELS, isSectionKey, type SectionKey } from "../../../../shared/sections.ts";
import { isRecord, sameContent } from "../../../../shared/structure.ts";
import { truncate } from "../../../../shared/text.ts";
import { checkSection, listErrors, type ErrorItem } from "../../../../shared/validate.ts";
import { useAdmin } from "../context";
import { ApiError, api, errorText, paths } from "../api";
import { put } from "../draft";
import { ago } from "../format";
import { LiveSteps } from "../LiveStatus";
import { Notice, PageTitle, TextField } from "../ui";

type State =
  | { kind: "idle" | "publishing" | "loading" }
  | { kind: "conflict"; error: PublishConflictError }
  | { kind: "error"; text: string; items?: ErrorItem[]; paths?: string[] };

/** Field names in plain words, for the clash list. */
const FIELD_WORDS: Record<string, string> = {
  q: "question", a: "answer", url: "link", href: "button link", cta: "button text", useMemberForm: "membership form", slug: "page address",
  session: "academic year", date: "start date", endDate: "end date", register: "registration link", poster: "poster", photo: "photo",
  image: "photo", domain: "name", primaryLabel: "first button text", primaryLink: "first button link", secondaryLabel: "second button text",
  secondaryLink: "second button link", memberForm: "membership form link", mapQuery: "map location", fullName: "full name",
};

/** A clashing item's value in a few words: "Deleted", "“New title”", or the fields that differ. */
function describe(v: unknown, other: unknown): string {
  if (v === null || v === undefined) return "Deleted";
  if (typeof v === "string") return v.trim() ? `“${truncate(v, 90)}”` : "Empty";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return `${v.length} ${v.length === 1 ? "item" : "items"}`;
  if (isRecord(v)) {
    const o = isRecord(other) ? other : {};
    const fields = Object.keys(v).filter(k => !sameContent(v[k], o[k]) && typeof v[k] !== "object");
    const shown = fields.slice(0, 3).map(k => `${FIELD_WORDS[k] ?? k}: ${describe(v[k], o[k])}`);
    return shown.length ? shown.join("; ") + (fields.length > 3 ? "; …" : "") : "Edited";
  }
  return "Edited";
}

export default function PublishPanel() {
  const { content, base, baseRelease, dirty, afterPublish, reloadContent, discard, lastPublish, clearLastPublish } = useAdmin();
  const [note, setNote] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [notice, setNotice] = useState("");

  // Problems first: they block publishing (the server checks the same rules)
  const checks = useMemo(() => dirty.map(k => {
    const r = checkSection(k, content[k]);
    return { key: k, problems: r.ok ? [] : listErrors(k, r.value, r.errors), summary: describeChanges(k, base[k], content[k]) };
  }), [dirty, content, base]);
  const problems = checks.flatMap(c => c.problems);
  const busy = state.kind === "publishing" || state.kind === "loading";

  const publish = async (force = false) => {
    setState({ kind: "publishing" }); setNotice("");
    const sections: PartialContent = {};
    for (const k of dirty) put(sections, k, content[k]);
    try {
      const body: PublishRequest = { baseRelease, sections, ...(note.trim() ? { note: note.trim() } : {}), ...(force ? { force: true } : {}) };
      const res = await api<PublishResponse>(paths.publish, { method: "POST", body });
      setNote("");
      await afterPublish(res, sections);
      setState({ kind: "idle" });
    } catch (e) {
      if (!(e instanceof ApiError)) { setState({ kind: "error", text: errorText(e) }); return; }
      const d = e.data;
      if (e.code === "conflict" && isRecord(d.conflicts) && isRecord(d.theirs)) setState({ kind: "conflict", error: d as unknown as PublishConflictError });
      else if (e.code === "invalid") setState({ kind: "error", text: "The server found problems in your changes. Fix them, then publish again.", items: Array.isArray(d.items) ? d.items as ErrorItem[] : [] });
      else if (e.code === "missing_images") setState({ kind: "error", text: "Some images in your changes aren't on the admin server. Remove them and upload them again:", paths: Array.isArray(d.paths) ? d.paths.map(String) : [] });
      else if (e.code === "not_initialised") setState({ kind: "error", text: "Nothing has been published yet. The web lead needs to import the starting content first (Accounts)." });
      else if (e.code === "bad_request" && /nothing|no change/i.test(e.message)) {
        setState({ kind: "error", text: "Everything here is already live, so there's nothing to publish." });
        reloadContent().catch(() => { /* keeps the draft as it is */ });
      } else setState({ kind: "error", text: e.message });
    }
  };

  const loadTheirs = async () => {
    setState({ kind: "loading" });
    try {
      await reloadContent("theirs");
      setState({ kind: "idle" });
      setNotice("Loaded their version of the items you both changed. Your other changes are still here. Check them and publish again.");
    } catch (e) { setState({ kind: "error", text: errorText(e) }); }
  };

  if (lastPublish && dirty.length === 0) return (
    <>
      <PageTitle title="Published" actions={<button className="btn-ghost" onClick={clearLastPublish}>Done</button>} />
      {lastPublish.merged.length > 0 && (
        <Notice tone="info" className="mb-5">Combined with changes someone else published meanwhile in {lastPublish.merged.map(k => SECTION_LABELS[k]).join(", ")}.</Notice>
      )}
      <LiveSteps key={lastPublish.release} release={lastPublish.release} deploy={lastPublish.deploy} />
      {Object.keys(lastPublish.summaries).length > 0 && (
        <ul className="adm-card mt-5 grid grid-cols-1 gap-2 text-[15px]">
          {SECTION_KEYS.filter(k => lastPublish.summaries[k]).map(k => <li key={k}><span className="font-medium">{SECTION_LABELS[k]}</span> <span className="text-mute">{lastPublish.summaries[k]}</span></li>)}
        </ul>
      )}
    </>
  );

  return (
    <>
      <PageTitle title="Review and publish">Check what's about to change, then publish it all in one go.</PageTitle>
      {notice && <Notice tone="ok" className="mb-6">{notice}</Notice>}
      {dirty.length === 0 ? <p className="adm-card text-mute">Nothing to publish. Edits you make in any section will show up here.</p> : (
        <>
          {problems.length > 0 && (
            <Notice tone="error" className="mb-6" title={`Fix ${problems.length === 1 ? "this problem" : `these ${problems.length} problems`} before publishing`}>
              <ProblemList items={problems} />
            </Notice>
          )}
          <ul className="adm-card grid grid-cols-1 gap-3">
            {checks.map(c => (
              <li key={c.key} className="flex items-start gap-3"><FileJson size={18} className="mt-0.5 shrink-0 text-violet-soft" />
                <span className="min-w-0">
                  <Link to={`/admin/${c.key}`} className="font-medium hover:text-gold">{SECTION_LABELS[c.key]}</Link> <span className="text-mute">{c.summary}</span>
                  {c.problems.length > 0 && <span className="block text-[13px] text-[#FCA5A5]">{c.problems.length} {c.problems.length === 1 ? "problem" : "problems"} to fix</span>}
                </span>
              </li>
            ))}
          </ul>
          <TextField className="mt-6" label="Describe the change (optional)" value={note} maxLength={LIMITS.noteMaxLength} placeholder="For example: Added ANALYTICA and the new design team"
            onChange={setNote} hint="Shown in History, so everyone can see what changed and why." />

          {state.kind === "conflict" && <ConflictBox error={state.error} busy={busy} onLoadTheirs={loadTheirs}
            onPublishMine={() => { if (confirm("Publish your version of the items you both changed? Their other changes are kept, and their version stays in History.")) publish(true); }} />}
          {state.kind === "error" && (
            <Notice tone="error" className="mt-6">
              <p>{state.text}</p>
              {state.items && state.items.length > 0 && <div className="mt-2"><ProblemList items={state.items} /></div>}
              {state.paths && state.paths.length > 0 && <ul className="mt-2 list-disc pl-5 text-[14px]">{state.paths.map(p => <li key={p} className="break-all">{p}</li>)}</ul>}
            </Notice>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {state.kind !== "conflict" && (
              <button className="btn-gold" disabled={busy || problems.length > 0} onClick={() => publish()}>
                {state.kind === "publishing" ? "Publishing…" : "Publish to the site"}
              </button>
            )}
            <button className="btn-ghost" disabled={busy} onClick={() => { if (confirm("Throw away all your unpublished changes? This can't be undone.")) discard(); }}>Discard my changes</button>
          </div>
        </>
      )}
    </>
  );
}

function ProblemList({ items }: { items: ErrorItem[] }) {
  return (
    <ul className="grid gap-1.5 text-[14px]">
      {items.map((p, i) => (
        <li key={`${p.section}:${p.key}:${i}`}>
          {isSectionKey(p.section) ? <Link to={`/admin/${p.section}`} className="font-medium text-cream underline decoration-line underline-offset-4 hover:text-gold">{p.label}</Link> : <span className="font-medium text-cream">{p.label}</span>}
          <span className="text-[#FCA5A5]">: {p.message}</span>
        </li>
      ))}
    </ul>
  );
}

function ConflictBox({ error, busy, onLoadTheirs, onPublishMine }: { error: PublishConflictError; busy: boolean; onLoadTheirs: () => void; onPublishMine: () => void }) {
  const sections = SECTION_KEYS.filter(k => (error.conflicts[k]?.length ?? 0) > 0) as SectionKey[];
  const { theirs } = error;
  return (
    <div role="alert" className="mt-6 rounded-2xl border border-gold/50 bg-gold/10 p-5">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 shrink-0 text-gold" />
        <div className="min-w-0 text-[15px]">
          <p className="font-medium">{theirs.publishedBy || "Someone"} changed some of the same items {theirs.publishedAt ? ago(theirs.publishedAt) : "recently"} (release #{theirs.release}).</p>
          <p className="mt-1 text-mute">Their changes to other items will be combined with yours. For the items below, choose whose version to keep. Nothing is lost either way: every release stays in History.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-4">
        {sections.map(k => (
          <section key={k}>
            <h3 className="font-display text-[15px] font-semibold">{SECTION_LABELS[k]}</h3>
            <ul className="mt-2 grid gap-2">
              {(error.conflicts[k] as Conflict[]).map(c => (
                <li key={c.key} className="rounded-xl border border-line bg-ink/60 p-3 text-[14px]">
                  <p className="font-medium">{c.label || c.key}</p>
                  <p className="mt-1 break-words"><span className="text-mute">Yours: </span>{describe(c.mine, c.theirs)}</p>
                  <p className="break-words"><span className="text-mute">Theirs: </span>{describe(c.theirs, c.mine)}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button className="btn-ghost" disabled={busy} onClick={onLoadTheirs}>{busy ? "Loading…" : "Load theirs"}</button>
        <button className="btn-danger" disabled={busy} onClick={onPublishMine}>Publish mine anyway</button>
      </div>
    </div>
  );
}
