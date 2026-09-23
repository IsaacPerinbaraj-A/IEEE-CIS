import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useAdmin } from "../context";
import { IconButton, PageTitle, TextArea, TextField } from "../ui";
import { clone, validateJoin, type Errors, type JoinContent } from "../model";

const swap = <T,>(a: T[], i: number, j: number) => { [a[i], a[j]] = [a[j], a[i]]; };

export default function JoinEditor() {
  const { content, update } = useAdmin();
  const join = content.join;
  // Problems show once something has been edited here, then update live
  const [edited, setEdited] = useState(false);
  const errors: Errors = edited ? validateJoin(join) : {};
  const edit = (fn: (j: JoinContent) => void) => { const next = clone(join); fn(next); update("join", next); setEdited(true); };
  const { steps, benefits } = join;
  return (
    <>
      <PageTitle title="Join page">The steps to become a member and the list of what members get, shown on the Join page in this order. The questions below them are under FAQs.</PageTitle>

      <section aria-labelledby="join-steps">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="join-steps" className="font-display text-lg font-semibold">Steps</h2>
          <button className="btn-ghost btn-sm" onClick={() => edit(j => { j.steps.push({ title: "", text: "", cta: "", href: "" }); })}><Plus size={15} /> Add step</button>
        </div>
        <div className="grid grid-cols-1 gap-4">
          {steps.map((s, i) => (
            <div key={i} className="adm-card grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex items-end gap-2 md:col-span-2">
                <TextField label={`Step ${i + 1}`} value={s.title} error={errors[`steps.${i}.title`]} className="flex-1" onChange={v => edit(j => { j.steps[i].title = v; })} />
                <IconButton label="Move step up" disabled={i === 0} onClick={() => edit(j => swap(j.steps, i, i - 1))}><ArrowUp size={16} /></IconButton>
                <IconButton label="Move step down" disabled={i === steps.length - 1} onClick={() => edit(j => swap(j.steps, i, i + 1))}><ArrowDown size={16} /></IconButton>
                <IconButton label={`Delete step ${i + 1}`} tone="danger" onClick={() => edit(j => { j.steps.splice(i, 1); })}><Trash2 size={16} /></IconButton>
              </div>
              <TextArea label="What to do" value={s.text} error={errors[`steps.${i}.text`]} className="md:col-span-2" onChange={v => edit(j => { j.steps[i].text = v; })} />
              <TextField label="Button text" value={s.cta} error={errors[`steps.${i}.cta`]} onChange={v => edit(j => { j.steps[i].cta = v; })} />
              {s.useMemberForm
                ? <div><span className="adm-label">Button link</span><p className="adm-hint mt-2">Uses the membership form link from Site settings. While that is empty, the page asks people to email you instead.</p></div>
                : <TextField label="Button link" type="url" value={s.href} error={errors[`steps.${i}.href`]} placeholder="https://" onChange={v => edit(j => { j.steps[i].href = v; })} />}
              <label className="flex items-center gap-2.5 text-[15px] md:col-span-2">
                <input type="checkbox" checked={!!s.useMemberForm} className="h-4 w-4 accent-[#F2B544]"
                  onChange={e => { const on = e.target.checked; edit(j => { if (on) j.steps[i].useMemberForm = true; else delete j.steps[i].useMemberForm; }); }} />
                Link this step to the membership form
              </label>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="join-benefits" className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="join-benefits" className="font-display text-lg font-semibold">What you get</h2>
          <button className="btn-ghost btn-sm" onClick={() => edit(j => { j.benefits.push({ title: "", text: "" }); })}><Plus size={15} /> Add benefit</button>
        </div>
        <div className="grid grid-cols-1 gap-4">
          {benefits.map((b, i) => (
            <div key={i} className="adm-card grid grid-cols-1 gap-4">
              <div className="flex items-end gap-2">
                <TextField label={`Benefit ${i + 1}`} value={b.title} error={errors[`benefits.${i}.title`]} className="flex-1" onChange={v => edit(j => { j.benefits[i].title = v; })} />
                <IconButton label="Move benefit up" disabled={i === 0} onClick={() => edit(j => swap(j.benefits, i, i - 1))}><ArrowUp size={16} /></IconButton>
                <IconButton label="Move benefit down" disabled={i === benefits.length - 1} onClick={() => edit(j => swap(j.benefits, i, i + 1))}><ArrowDown size={16} /></IconButton>
                <IconButton label={`Delete benefit ${i + 1}`} tone="danger" onClick={() => edit(j => { j.benefits.splice(i, 1); })}><Trash2 size={16} /></IconButton>
              </div>
              <TextField label="One line about it" value={b.text} error={errors[`benefits.${i}.text`]} onChange={v => edit(j => { j.benefits[i].text = v; })} />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
