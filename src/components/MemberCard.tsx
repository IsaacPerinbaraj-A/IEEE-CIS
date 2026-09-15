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
  return (
    <article className="group">
      <Tilt className="rounded-2xl" max={12}>
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_18px_40px_-22px_rgba(139,92,246,.6)]">
        {m.photo
          ? <img src={m.photo} alt="" loading="lazy" className="img-wipe h-full w-full object-cover grayscale-[25%] transition duration-300 group-hover:grayscale-0" />
          : <div className="img-wipe grid h-full w-full place-items-center bg-gradient-to-br from-violet-deep to-panel font-display text-4xl text-violet-soft">{initials(m.name)}</div>}
      </div>
      </Tilt>
      <h3 className={`mt-4 font-sans font-semibold tracking-normal ${large ? "text-xl" : "text-lg"}`}>{m.name}</h3>
      <p className="text-[15px] text-mute">{m.role}</p>
      {socials.length > 0 && (
        <div className="mt-3 flex gap-2">
          {socials.map(({ href, label, Icon }) => (
            <a key={label} href={href} target="_blank" rel="noopener" aria-label={`${m.name} on ${label}`}
               className="grid h-10 w-10 place-items-center rounded-full border border-line text-mute transition-colors hover:border-violet-soft hover:text-cream">
              <Icon size={16} />
            </a>
          ))}
        </div>
      )}
    </article>
  );
}
