import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useAdmin } from "../context";
import { IconButton, ImageInput, PageTitle, TextArea, TextField } from "../ui";
import { clone, isUrl, slugify, type Achievement } from "../model";
import { fileToImage, renderFit } from "../image";

export default function AchievementsEditor() {
  const { content, update, addImage, preview } = useAdmin();
  const list = content.achievements;
  const [busy, setBusy] = useState(-1);
  const edit = (fn: (a: Achievement[]) => void) => { const next = clone(list); fn(next); update("achievements", next); };
  return (
    <>
      <PageTitle title="Achievements" actions={<button className="btn-gold" onClick={() => edit(a => { a.unshift({ title: "", year: String(new Date().getFullYear()), description: "", people: "", link: "", image: "" }); })}><Plus size={18} /> Add achievement</button>}>
        Wins, papers and milestones. The Achievements page and its menu link appear on the site as soon as there's at least one.
      </PageTitle>
      {list.length === 0 && <p className="adm-card text-mute">No achievements yet. SIH results, competition wins and published papers are great to add here.</p>}
      <div className="grid grid-cols-1 gap-5">
        {list.map((a, i) => (
          <section key={i} className="adm-card grid gap-4 sm:grid-cols-2">
            <TextField label="Title" value={a.title} className="sm:col-span-2" onChange={v => edit(x => { x[i].title = v; })} />
            <TextField label="Year" value={a.year} onChange={v => edit(x => { x[i].year = v; })} />
            <TextField label="People (optional)" value={a.people || ""} hint="Names of the members involved." onChange={v => edit(x => { x[i].people = v; })} />
            <TextArea label="What happened" value={a.description} className="sm:col-span-2" onChange={v => edit(x => { x[i].description = v; })} />
            <TextField label="Link (optional)" type="url" value={a.link || ""} error={a.link && !isUrl(a.link) ? "Needs to start with https://" : undefined} onChange={v => edit(x => { x[i].link = v; })} />
            <ImageInput label="Photo (optional)" src={preview(a.image)} busy={busy === i} onRemove={() => edit(x => { x[i].image = ""; })}
              onFile={async f => { setBusy(i); try { const src = addImage("achievements", slugify(a.title) || `achievement-${i + 1}`, await renderFit(await fileToImage(f), 1200, 900)); edit(x => { x[i].image = src; }); } finally { setBusy(-1); } }} />
            <div className="flex justify-end sm:col-span-2">
              <IconButton label={`Delete ${a.title || "achievement"}`} tone="danger" onClick={() => { if (confirm("Delete this achievement?")) edit(x => { x.splice(i, 1); }); }}><Trash2 size={16} /></IconButton>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
