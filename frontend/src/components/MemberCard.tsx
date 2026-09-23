import { useState } from "react";
import type { Member } from "../lib/data";
import { initials } from "../lib/data";
import { Linkedin, Github, Instagram } from "../lib/icons";
import { Tilt } from "./Motion";

export default function MemberCard({ m, large = false }: { m: Member; large?: boolean }) {
  const socials = [
    { href: m.linkedin, label: "LinkedIn", Icon: Linkedin },
    { href: m.github, label: "GitHub", Icon: Github },
    { href: m.instagram, label: "Instagram", Icon: Instagram },
  ].filter(s => s.href);
  // Fall back to initials if the photo file is missing or fails to load
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto = m.photo && failedSrc !== m.photo;
  return (
    // Full-height column so the social icons sit on one line across a row even when a name wraps.
    // Phones (the admin preview; the Team page uses rows there): photos in full colour and 44px link buttons
    <article className="group flex h-full flex-col">
      <Tilt className="rounded-2xl" max={12}>
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_18px_40px_-22px_rgba(139,92,246,.6)]">
        {showPhoto
          ? <img src={m.photo} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(m.photo ?? null)} className="h-full w-full object-cover grayscale-[25%] transition duration-300 group-hover:grayscale-0 max-sm:grayscale-0" />
          : <div className="grid h-full w-full place-items-center bg-gradient-to-br from-violet-deep to-panel font-display text-4xl text-violet-soft">{initials(m.name)}</div>}
      </div>
      </Tilt>
      <h3 className={`mt-4 font-sans font-semibold tracking-normal ${large ? "text-xl" : "text-lg"}`}>{m.name}</h3>
      <p className="text-[15px] text-mute">{m.role}</p>
      {socials.length > 0 && (
        <div className="mt-auto flex gap-1.5 pt-3 sm:gap-2">
          {socials.map(({ href, label, Icon }) => (
            <a key={label} href={href} target="_blank" rel="noopener" aria-label={`${m.name} on ${label}`}
               className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line text-mute transition-colors hover:border-violet-soft hover:text-cream max-sm:h-11 max-sm:w-11">
              <Icon size={16} />
            </a>
          ))}
        </div>
      )}
    </article>
  );
}
