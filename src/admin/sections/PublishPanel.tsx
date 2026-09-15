import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, FileJson, ImageIcon } from "lucide-react";
import { useAdmin } from "../context";
import { PageTitle, TextField } from "../ui";
import { FILES, LABELS, serialize, type ContentKey } from "../model";
import { blobToBase64 } from "../image";
import type { FileChange } from "../backend";

/** Plain-language summary of what changed in one file. */
function describe(key: ContentKey, before: string, after: unknown) {
  try {
    const old = JSON.parse(before);
    if (key === "events") {
      const a = old as { slug: string }[], b = after as { slug: string }[], was = new Map(a.map(e => [e.slug, JSON.stringify(e)]));
      const added = b.filter(e => !was.has(e.slug)).length, removed = a.filter(e => !b.some(x => x.slug === e.slug)).length;
      const edited = b.filter(e => was.has(e.slug) && was.get(e.slug) !== JSON.stringify(e)).length;
      return [added && `${added} added`, edited && `${edited} edited`, removed && `${removed} removed`].filter(Boolean).join(", ") || "reordered";
    }
    if (key === "team") {
      const count = (t: { sessions: { groups: { members: unknown[] }[] }[] }) => t.sessions.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.members.length, 0), 0);
      const d = count(after as never) - count(old);
      return d > 0 ? `${d} member${d === 1 ? "" : "s"} added, plus edits` : d < 0 ? `${-d} member${d === -1 ? "" : "s"} removed, plus edits` : "details edited";
    }
    return "edited";
  } catch { return "edited"; }
}

export default function PublishPanel() {
  const { dirty, images, content, original, backend, afterPublish, discard } = useAdmin();
  const [message, setMessage] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "checking" | "publishing" | "done" | "error" | "conflict"; text?: string; url?: string; files?: string[] }>({ kind: "idle" });
  const imgs = Object.values(images);
  const defaultMessage = useMemo(() => `Update ${[...dirty.map(k => LABELS[k].toLowerCase()), imgs.length ? "images" : ""].filter(Boolean).join(", ")} via admin`, [dirty, imgs.length]);
  const nothing = dirty.length === 0 && imgs.length === 0;

  const publish = async (force = false) => {
    try {
      if (!force && backend.kind !== "offline") {
        setState({ kind: "checking" });
        const changedElsewhere: string[] = [];
        for (const k of dirty) {
          const remote = await backend.read(FILES[k]);
          if (remote !== null && serialize(JSON.parse(remote)) !== original[k]) changedElsewhere.push(LABELS[k]);
        }
        if (changedElsewhere.length) { setState({ kind: "conflict", files: changedElsewhere }); return; }
      }
      setState({ kind: "publishing" });
      const changes: FileChange[] = [
        ...dirty.map(k => ({ path: FILES[k], content: serialize(content[k]), encoding: "utf-8" as const })),
        ...(await Promise.all(imgs.map(async i => ({ path: i.path, content: await blobToBase64(i.blob), encoding: "base64" as const })))),
      ];
      const res = await backend.publish(changes, message.trim() || defaultMessage);
      afterPublish();
      setState({ kind: "done", text: res.note, url: res.url });
    } catch (e) { setState({ kind: "error", text: (e as Error).message }); }
  };

  if (state.kind === "done") return (
    <>
      <PageTitle title="Published" />
      <div className="adm-card flex gap-4">
        <CheckCircle2 className="mt-0.5 shrink-0 text-[#4ADE80]" />
        <div><p className="font-medium">{state.text}</p>
          {state.url && <a href={state.url} target="_blank" rel="noopener" className="link mt-2 inline-flex items-center gap-1.5 text-[15px]">See the update on GitHub <ExternalLink size={14} /></a>}</div>
      </div>
    </>
  );

  return (
    <>
      <PageTitle title="Review and publish">Check what's about to change, then publish it all in one go.</PageTitle>
      {nothing ? <p className="adm-card text-mute">Nothing to publish. Edits you make in any section will show up here.</p> : (
        <>
          <ul className="adm-card grid grid-cols-1 gap-3">
            {dirty.map(k => (
              <li key={k} className="flex items-start gap-3"><FileJson size={18} className="mt-0.5 shrink-0 text-violet-soft" />
                <span><span className="font-medium">{LABELS[k]}</span> <span className="text-mute">{describe(k, original[k], content[k])}</span><span className="block text-[13px] text-mute/80">{FILES[k]}</span></span></li>
            ))}
            {imgs.map(i => (
              <li key={i.path} className="flex items-center gap-3"><ImageIcon size={18} className="shrink-0 text-violet-soft" />
                <img src={i.url} alt="" className="h-10 w-10 rounded-md object-cover" /><span className="min-w-0"><span className="block font-medium">New image</span><span className="block truncate text-[13px] text-mute/80">{i.path}</span></span></li>
            ))}
          </ul>
          <TextField className="mt-6" label="Describe the change (optional)" value={message} placeholder={defaultMessage} onChange={setMessage}
            hint="Helps everyone see what changed and when, in the site's history." />
          {state.kind === "conflict" && (
            <div role="alert" className="mt-6 flex gap-3 rounded-2xl border border-gold/50 bg-gold/10 p-5">
              <AlertTriangle className="mt-0.5 shrink-0 text-gold" />
              <div className="text-[15px]">
                <p className="font-medium">Someone else changed {state.files!.join(" and ")} since you opened the admin.</p>
                <p className="mt-1 text-mute">Publishing now would replace their changes with yours. To keep both, note your edits, reload this page to get their version, and make your edits again.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="btn-ghost btn-sm" onClick={() => location.reload()}>Reload the latest version</button>
                  <button className="btn-danger btn-sm" onClick={() => publish(true)}>Publish mine anyway</button>
                </div>
              </div>
            </div>
          )}
          {state.kind === "error" && <p role="alert" className="mt-6 rounded-xl border border-[#7F1D1D] bg-[#7F1D1D]/25 px-4 py-3 text-[15px] text-[#FCA5A5]">{state.text}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="btn-gold" disabled={state.kind === "checking" || state.kind === "publishing"} onClick={() => publish()}>
              {state.kind === "checking" ? "Checking for other changes…" : state.kind === "publishing" ? "Publishing…" : backend.kind === "offline" ? "Download the files" : backend.kind === "local" ? "Save to project files" : "Publish to the site"}
            </button>
            <button className="btn-ghost" onClick={() => { if (confirm("Throw away all unpublished changes?")) discard(); }}>Discard all changes</button>
          </div>
        </>
      )}
    </>
  );
}
