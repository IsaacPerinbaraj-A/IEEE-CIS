import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { useAdmin } from "../context";
import { IconButton, ImageInput, Modal, PageTitle, SelectField, TextArea, TextField } from "../ui";
import CropDialog from "../CropDialog";
import { clone, emptyMember, slugify, validateMember, type Errors, type Member, type Session } from "../model";
import { fileToImage } from "../image";
import MemberCard from "../../components/MemberCard";
import { initials } from "../../lib/data";

const move = <T,>(arr: T[], i: number, d: number) => { const a = [...arr], j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; };

export default function TeamEditor() {
  const { content, update, preview } = useAdmin();
  const sessions = content.team.sessions;
  const [si, setSi] = useState(0);
  const [editing, setEditing] = useState<{ gi: number; mi?: number; member: Member } | null>(null);
  const [newYear, setNewYear] = useState<string | null>(null);
  const s = sessions[Math.min(si, sessions.length - 1)];
  const setSession = (fn: (s: Session) => Session) => update("team", { sessions: sessions.map((x, i) => (i === si ? fn(clone(x)) : x)) });

  const addYear = () => {
    const label = (newYear || "").trim().replace("-", "–");
    if (!/^\d{4}–\d{2}$/.test(label)) return;
    const id = label.replace("–", "-");
    if (sessions.some(x => x.id === id)) { alert("That academic year already exists."); return; }
    const fresh: Session = { id, label, faculty: clone(sessions[0]?.faculty || []), groups: (sessions[0]?.groups || []).map(g => ({ ...g, members: [] })) };
    update("team", { sessions: [fresh, ...sessions] }); setSi(0); setNewYear(null);
  };

  return (
    <>
      <PageTitle title="Team" actions={<button className="btn-ghost" onClick={() => setNewYear("")}><Plus size={18} /> New academic year</button>}>
        The first year in the list is the one visitors see by default. Older years stay available in the year switcher.
      </PageTitle>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <SelectField label="Academic year" value={String(si)} onChange={v => setSi(Number(v))} className="min-w-[220px]"
          options={sessions.map((x, i) => ({ value: String(i), label: `${x.label}${i === 0 ? " (shown by default)" : ""}` }))} />
        {sessions.length > 1 && (
          <button className="btn-danger btn-sm mb-0.5" onClick={() => {
            if (!confirm(`Delete the whole ${s.label} team? You can still discard this before publishing.`)) return;
            update("team", { sessions: sessions.filter((_, i) => i !== si) }); setSi(0);
          }}><Trash2 size={15} /> Delete this year</button>
        )}
      </div>

      <div className="adm-card mb-6 grid gap-5 sm:grid-cols-2">
        <TextField label="Year label" value={s.label} hint="Shown in the year switcher, e.g. 2026–27." onChange={v => setSession(x => ({ ...x, label: v }))} />
        <TextArea label="Note (optional)" value={s.note || ""} className="sm:col-span-2" hint="Replaces the sentence under the Team heading for this year."
          onChange={v => setSession(x => ({ ...x, note: v || undefined }))} />
      </div>

      <section className="adm-card mb-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-display text-lg font-semibold">Faculty</h2>
          <button className="btn-ghost btn-sm" onClick={() => setSession(x => ({ ...x, faculty: [...x.faculty, { name: "", role: "Faculty Coordinator" }] }))}><Plus size={15} /> Add</button>
        </div>
        {s.faculty.length === 0 && <p className="text-[15px] text-mute">No faculty listed for this year.</p>}
        <div className="grid grid-cols-1 gap-4">
          {s.faculty.map((f, i) => (
            <div key={i} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <TextField label="Name" value={f.name} onChange={v => setSession(x => { x.faculty[i].name = v; return x; })} />
              <TextField label="Role" value={f.role} onChange={v => setSession(x => { x.faculty[i].role = v; return x; })} />
              <IconButton label={`Remove ${f.name || "faculty member"}`} tone="danger" onClick={() => setSession(x => ({ ...x, faculty: x.faculty.filter((_, j) => j !== i) }))}><Trash2 size={16} /></IconButton>
            </div>
          ))}
        </div>
      </section>

      {s.groups.map((g, gi) => (
        <section key={g.slug + gi} className="adm-card mb-5">
          <div className="mb-5 flex flex-wrap items-end gap-3">
            <TextField label="Team name" value={g.domain} className="min-w-[200px] flex-1" onChange={v => setSession(x => { x.groups[gi].domain = v; return x; })} />
            <div className="flex gap-2">
              <IconButton label="Move team up" disabled={gi === 0} onClick={() => setSession(x => ({ ...x, groups: move(x.groups, gi, -1) }))}><ArrowUp size={16} /></IconButton>
              <IconButton label="Move team down" disabled={gi === s.groups.length - 1} onClick={() => setSession(x => ({ ...x, groups: move(x.groups, gi, 1) }))}><ArrowDown size={16} /></IconButton>
              <IconButton label={`Delete the ${g.domain} team`} tone="danger" onClick={() => {
                if (g.members.length && !confirm(`Delete ${g.domain} and its ${g.members.length} members?`)) return;
                setSession(x => ({ ...x, groups: x.groups.filter((_, j) => j !== gi) }));
              }}><Trash2 size={16} /></IconButton>
            </div>
          </div>
          <ul className="grid grid-cols-1 gap-2">
            {g.members.map((m, mi) => (
              <li key={m.name + mi} className="flex items-center gap-3 rounded-xl border border-line bg-ink/60 p-2.5">
                <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-raised font-display text-violet-soft">
                  {m.photo ? <img src={preview(m.photo)} alt="" className="h-full w-full object-cover" /> : initials(m.name || "?")}
                </span>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{m.name || "Unnamed"}</span><span className="block truncate text-[14px] text-mute">{m.role}</span></span>
                <IconButton label={`Move ${m.name} up`} disabled={mi === 0} onClick={() => setSession(x => { x.groups[gi].members = move(x.groups[gi].members, mi, -1); return x; })}><ArrowUp size={15} /></IconButton>
                <IconButton label={`Move ${m.name} down`} disabled={mi === g.members.length - 1} onClick={() => setSession(x => { x.groups[gi].members = move(x.groups[gi].members, mi, 1); return x; })}><ArrowDown size={15} /></IconButton>
                <IconButton label={`Edit ${m.name}`} onClick={() => setEditing({ gi, mi, member: clone(m) })}><Pencil size={15} /></IconButton>
              </li>
            ))}
          </ul>
          <button className="btn-ghost btn-sm mt-4" onClick={() => setEditing({ gi, member: emptyMember() })}><UserPlus size={15} /> Add member</button>
        </section>
      ))}
      <button className="btn-ghost" onClick={() => {
        const name = prompt("Name of the new team, for example Robotics");
        if (name?.trim()) setSession(x => ({ ...x, groups: [...x.groups, { domain: name.trim(), slug: slugify(name), members: [] }] }));
      }}><Plus size={18} /> Add a team</button>

      {newYear !== null && (
        <Modal title="New academic year" onClose={() => setNewYear(null)}
          footer={<><button className="btn-ghost" onClick={() => setNewYear(null)}>Cancel</button><button className="btn-gold" onClick={addYear}>Create year</button></>}>
          <p className="mb-4 text-[15px] text-mute">This copies the team names and faculty from {sessions[0]?.label || "the latest year"}, with no members yet. It becomes the year visitors see first once you publish.</p>
          <TextField label="Academic year" value={newYear} placeholder="2026–27" onChange={setNewYear}
            error={newYear && !/^\d{4}[–-]\d{2}$/.test(newYear.trim()) ? "Use the format 2026–27." : undefined} />
        </Modal>
      )}

      {editing && (
        <MemberForm initial={editing.member} isNew={editing.mi === undefined} groups={s.groups.map(g => g.domain)} groupIndex={editing.gi}
          onClose={() => setEditing(null)}
          onDelete={editing.mi === undefined ? undefined : () => { setSession(x => { x.groups[editing.gi].members.splice(editing.mi!, 1); return x; }); setEditing(null); }}
          onSave={(m, gi) => {
            setSession(x => {
              if (editing.mi !== undefined) x.groups[editing.gi].members.splice(editing.mi, 1, ...(gi === editing.gi ? [m] : []));
              if (editing.mi === undefined || gi !== editing.gi) x.groups[gi].members.push(m);
              return x;
            });
            setEditing(null);
          }} />
      )}
    </>
  );
}

function MemberForm({ initial, isNew, groups, groupIndex, onClose, onSave, onDelete }: {
  initial: Member; isNew: boolean; groups: string[]; groupIndex: number; onClose: () => void; onSave: (m: Member, gi: number) => void; onDelete?: () => void;
}) {
  const { addImage, preview } = useAdmin();
  const [m, setM] = useState<Member>(initial), [gi, setGi] = useState(groupIndex);
  const [tried, setTried] = useState(false), [img, setImg] = useState<HTMLImageElement | null>(null), [imgError, setImgError] = useState("");
  const set = (patch: Partial<Member>) => setM(p => ({ ...p, ...patch }));
  const clean = (v?: string) => (v || "").trim();
  const tidy = (): Member => ({ name: clean(m.name), role: clean(m.role), photo: clean(m.photo), linkedin: clean(m.linkedin), github: clean(m.github), instagram: clean(m.instagram) });
  const errors: Errors = tried ? validateMember(tidy()) : {};
  const save = () => { setTried(true); if (!Object.keys(validateMember(tidy())).length) onSave(tidy(), gi); };
  return (
    <>
      <Modal title={isNew ? "Add member" : `Edit ${initial.name}`} onClose={onClose} wide
        footer={<>
          {onDelete && <button className="btn-danger mr-auto" onClick={() => { if (confirm(`Remove ${initial.name} from the team?`)) onDelete(); }}>Remove member</button>}
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-gold" onClick={save}>Save draft</button>
        </>}>
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="grid grid-cols-1 gap-4">
            <TextField label="Full name" value={m.name} error={errors.name} onChange={v => set({ name: v })} />
            <TextField label="Role" value={m.role} error={errors.role} hint="For example Chair, ML Head, Design Senior Associate." onChange={v => set({ role: v })} />
            <SelectField label="Team" value={String(gi)} onChange={v => setGi(Number(v))} options={groups.map((g, i) => ({ value: String(i), label: g }))} />
            <ImageInput square label="Photo" src={preview(m.photo)} onRemove={() => set({ photo: "" })}
              hint={imgError || "Any photo works. You'll frame it as a square, and it's compressed automatically."}
              onFile={async f => { setImgError(""); try { setImg(await fileToImage(f)); } catch (e) { setImgError((e as Error).message); } }} />
            <TextField type="url" label="LinkedIn (optional)" value={m.linkedin || ""} error={errors.linkedin} placeholder="https://www.linkedin.com/in/…" onChange={v => set({ linkedin: v })} />
            <TextField type="url" label="GitHub (optional)" value={m.github || ""} error={errors.github} placeholder="https://github.com/…" onChange={v => set({ github: v })} />
            <TextField type="url" label="Instagram (optional)" value={m.instagram || ""} error={errors.instagram} placeholder="https://instagram.com/…" onChange={v => set({ instagram: v })} />
          </div>
          <div aria-hidden className="pointer-events-none select-none">
            <p className="mb-3 text-[14px] text-mute">Preview</p>
            <MemberCard m={{ ...m, name: m.name || "Name", role: m.role || "Role", photo: preview(m.photo) }} />
          </div>
        </div>
      </Modal>
      {img && <CropDialog img={img} onCancel={() => setImg(null)} onDone={blob => { set({ photo: addImage("team", m.name || "member", blob) }); setImg(null); }} />}
    </>
  );
}
