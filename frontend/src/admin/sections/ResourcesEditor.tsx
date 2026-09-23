import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useAdmin } from "../context";
import { IconButton, PageTitle, TextField } from "../ui";
import { clone, isUrl, type ResourceGroup } from "../model";

export default function ResourcesEditor() {
  const { content, update } = useAdmin();
  const groups = content.resources;
  const edit = (fn: (g: ResourceGroup[]) => void) => { const next = clone(groups); fn(next); update("resources", next); };
  const swap = <T,>(a: T[], i: number, j: number) => { [a[i], a[j]] = [a[j], a[i]]; };
  return (
    <>
      <PageTitle title="Resources" actions={<button className="btn-gold" onClick={() => edit(g => { g.push({ domain: "New topic", links: [] }); })}><Plus size={18} /> Add topic</button>}>
        Learning links on the Resources page, grouped by topic.
      </PageTitle>
      <div className="grid grid-cols-1 gap-5">
        {groups.map((g, gi) => (
          <section key={gi} className="adm-card">
            <div className="mb-4 flex items-end gap-2">
              <TextField label="Topic" value={g.domain} className="flex-1" onChange={v => edit(x => { x[gi].domain = v; })} />
              <IconButton label="Move topic up" disabled={gi === 0} onClick={() => edit(x => swap(x, gi, gi - 1))}><ArrowUp size={16} /></IconButton>
              <IconButton label="Move topic down" disabled={gi === groups.length - 1} onClick={() => edit(x => swap(x, gi, gi + 1))}><ArrowDown size={16} /></IconButton>
              <IconButton label={`Delete ${g.domain}`} tone="danger" onClick={() => { if (!g.links.length || confirm(`Delete ${g.domain} and its links?`)) edit(x => { x.splice(gi, 1); }); }}><Trash2 size={16} /></IconButton>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {g.links.map((l, li) => (
                <div key={li} className="grid gap-3 rounded-xl border border-line bg-ink/60 p-4 md:grid-cols-[1fr_1.2fr_1.4fr_auto] md:items-end">
                  <TextField label="Title" value={l.title} onChange={v => edit(x => { x[gi].links[li].title = v; })} />
                  <TextField label="Link" type="url" value={l.url} error={l.url && !isUrl(l.url) ? "Needs to start with https://" : undefined} onChange={v => edit(x => { x[gi].links[li].url = v; })} />
                  <TextField label="Short note" value={l.note} onChange={v => edit(x => { x[gi].links[li].note = v; })} />
                  <IconButton label={`Delete ${l.title || "link"}`} tone="danger" onClick={() => edit(x => { x[gi].links.splice(li, 1); })}><Trash2 size={16} /></IconButton>
                </div>
              ))}
            </div>
            <button className="btn-ghost btn-sm mt-4" onClick={() => edit(x => { x[gi].links.push({ title: "", url: "", note: "" }); })}><Plus size={15} /> Add link</button>
          </section>
        ))}
      </div>
    </>
  );
}
