import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useAdmin } from "../context";
import { IconButton, PageTitle, TextArea, TextField } from "../ui";

export default function FaqEditor() {
  const { content, update } = useAdmin();
  const faqs = content.faqs;
  const set = (i: number, patch: Partial<{ q: string; a: string }>) => update("faqs", faqs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, d: number) => { const a = [...faqs], j = i + d; [a[i], a[j]] = [a[j], a[i]]; update("faqs", a); };
  return (
    <>
      <PageTitle title="FAQs" actions={<button className="btn-gold" onClick={() => update("faqs", [...faqs, { q: "", a: "" }])}><Plus size={18} /> Add question</button>}>
        Questions and answers on the Join page, in this order.
      </PageTitle>
      <div className="grid grid-cols-1 gap-4">
        {faqs.map((f, i) => (
          <div key={i} className="adm-card grid grid-cols-1 gap-4">
            <div className="flex items-end gap-2">
              <TextField label={`Question ${i + 1}`} value={f.q} className="flex-1" onChange={v => set(i, { q: v })} />
              <IconButton label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} /></IconButton>
              <IconButton label="Move down" disabled={i === faqs.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} /></IconButton>
              <IconButton label="Delete question" tone="danger" onClick={() => update("faqs", faqs.filter((_, j) => j !== i))}><Trash2 size={16} /></IconButton>
            </div>
            <TextArea label="Answer" value={f.a} onChange={v => set(i, { a: v })} />
          </div>
        ))}
      </div>
    </>
  );
}
