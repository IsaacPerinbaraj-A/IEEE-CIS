import { useId, useState } from "react";
import { Plus } from "lucide-react";
export default function Accordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const id = useId();
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={it.q}>
            <h3 className="font-sans">
              <button className="flex w-full items-center justify-between gap-6 py-5 text-left text-lg font-medium" aria-expanded={isOpen} aria-controls={`${id}-${i}`} onClick={() => setOpen(isOpen ? null : i)}>
                {it.q}
                <Plus size={20} className={`shrink-0 text-violet-soft transition-transform duration-200 ${isOpen ? "rotate-45" : ""}`} />
              </button>
            </h3>
            <div id={`${id}-${i}`} hidden={!isOpen} className="pb-6 pr-10 text-mute">{it.a}</div>
          </div>
        );
      })}
    </div>
  );
}
