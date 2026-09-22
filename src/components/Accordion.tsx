import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { useMediaQuery, PHONE } from "../lib/useMediaQuery";

/** A closed panel can't be tabbed into or read out. (`inert` isn't in React 18's types, so it's passed as an attribute.) */
const inert = (on: boolean) => (on ? { inert: "" } : {});

export default function Accordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const id = useId();
  const phone = useMediaQuery(PHONE);
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
            {phone ? (
              // Phones: the answer slides open (grid rows 0fr to 1fr) and fades in, instead of appearing at once
              <div id={`${id}-${i}`} {...inert(!isOpen)} style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                className="grid transition-[grid-template-rows] duration-[280ms] ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none">
                <div className="min-h-0 overflow-hidden">
                  <div className={`pb-6 pr-10 text-mute transition-opacity duration-[280ms] ${isOpen ? "opacity-100" : "opacity-0"}`}>{it.a}</div>
                </div>
              </div>
            ) : <div id={`${id}-${i}`} hidden={!isOpen} className="pb-6 pr-10 text-mute">{it.a}</div>}
          </div>
        );
      })}
    </div>
  );
}
