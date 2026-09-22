import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import type { Member } from "../lib/data";
import { initials } from "../lib/data";
import { Linkedin, Github, Instagram } from "../lib/icons";

const ease = "ease-[cubic-bezier(.2,.7,.2,1)]";

/**
 * Phones: one member as a 72px list row (photo, name, role). A member with links opens like a disclosure: the photo
 * grows to 88px, the name moves beside its lower half and labelled LinkedIn/GitHub/Instagram buttons rise in.
 * Only transform and opacity animate, plus the 0fr to 1fr row trick for the height. The parent keeps one row open.
 */
export default function MemberRow({ m, id, open, onToggle }: { m: Member; id: string; open: boolean; onToggle: () => void }) {
  const socials = [
    { href: m.linkedin, label: "LinkedIn", Icon: Linkedin },
    { href: m.github, label: "GitHub", Icon: Github },
    { href: m.instagram, label: "Instagram", Icon: Instagram },
  ].filter(s => s.href);
  // Fall back to initials if the photo file is missing or fails to load
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto = m.photo && failedSrc !== m.photo;
  const panel = useRef<HTMLDivElement>(null);
  const expandable = socials.length > 0;
  const on = expandable && open;

  // A closed panel can't be tabbed into or read out
  useEffect(() => { panel.current?.toggleAttribute("inert", !on); }, [on]);

  const photo = (
    <span className={`relative h-14 w-14 shrink-0 origin-top-left overflow-hidden rounded-xl border border-line bg-raised transition-transform duration-[350ms] ${ease} ${on ? "scale-[1.5714]" : ""}`}>
      {showPhoto
        ? <img src={m.photo} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(m.photo ?? null)} className="h-full w-full object-cover" />
        : <span aria-hidden className="grid h-full w-full place-items-center bg-gradient-to-br from-violet-deep to-panel font-display text-[17px] text-violet-soft">{initials(m.name)}</span>}
    </span>
  );
  // Open: beside the lower half of the grown photo, so a long name never runs under the chevron
  const text = (
    <span className={`min-w-0 flex-1 transition-transform duration-[350ms] ${ease} ${on ? "translate-x-8 translate-y-[38px]" : ""}`}>
      <span className="block truncate text-[17px] font-semibold leading-[1.35]">{m.name}</span>
      <span className="block truncate text-[15px] leading-[1.4] text-mute">{m.role}</span>
    </span>
  );

  if (!expandable) {
    return <li className="flex min-h-[72px] items-center gap-3.5 px-4 py-2">{photo}{text}</li>;
  }

  return (
    <li>
      {/* scroll-mt: a row or link focused from the keyboard scrolls clear of the sticky header and team strip.
          The focus ring is drawn inside, because the list clips anything outside the full-width row. */}
      <button type="button" onClick={onToggle} aria-expanded={on} aria-controls={id}
        className="press flex min-h-[72px] w-full scroll-mt-32 items-center gap-3.5 px-4 py-2 text-left focus-visible:outline-offset-[-3px]">
        {photo}{text}
        <ChevronDown size={18} aria-hidden className={`shrink-0 text-mute transition-transform duration-[350ms] ${ease} ${on ? "rotate-180" : ""}`} />
      </button>
      <div ref={panel} id={id} className={`grid transition-[grid-template-rows] duration-[350ms] ${ease} ${on ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="min-h-0 overflow-hidden">
          {/* Top padding clears the grown photo, which reaches 24px below the 72px row */}
          <div className="flex flex-wrap gap-2 px-4 pb-4 pt-9">
            {socials.map(({ href, label, Icon }, i) => (
              // The wrapper rises in (40ms apart); the link inside keeps its own quick press feedback
              <span key={label} style={{ transitionDelay: on ? `${120 + i * 40}ms` : "0ms" } as CSSProperties}
                className={`flex flex-[1_0_auto] transition-[opacity,transform] duration-300 ${ease} ${on ? "opacity-100" : "translate-y-2 opacity-0"}`}>
                <a href={href} target="_blank" rel="noopener" aria-label={`${m.name} on ${label}`}
                  className="inline-flex min-h-[44px] w-full scroll-mt-32 items-center justify-center gap-1.5 rounded-full border border-line px-2 text-[14px] font-medium text-cream transition-[transform,background-color] duration-200 active:scale-[.97] active:bg-raised">
                  <Icon size={16} aria-hidden />{label}
                </a>
              </span>
            ))}
          </div>
        </div>
      </div>
    </li>
  );
}
