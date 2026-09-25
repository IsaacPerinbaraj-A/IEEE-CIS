import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigationType, useSearchParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import MemberCard from "../components/MemberCard";
import MemberRow from "../components/MemberRow";
import BearerDeck from "../components/BearerDeck";
import { Reveal } from "../components/Motion";
import { initials, sessions, type Faculty, type Session } from "../lib/data";
import { useTitle } from "../lib/useTitle";
import { prefersReducedMotion, revealChip } from "../lib/motion";
import { useMediaQuery, PHONE } from "../lib/useMediaQuery";

/** Dr., Ms., Mr., Mrs. and Prof. are titles, not names: they must not become someone's initials. */
const TITLE = /^\s*(dr|mr|mrs|ms|prof|professor)\.?\s+/i;

/** A faculty member's photo, falling back to their initials like the member cards do. */
function FacultyFace({ f, size }: { f: Faculty; size: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  return (
    <div style={style} className="grid shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-gradient-to-br from-violet-deep to-panel font-display text-violet-soft">
      {f.photo && !failed
        ? <img src={f.photo} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover" />
        : <span style={{ fontSize: Math.round(size / 2.6) }}>{initials(f.name.replace(TITLE, "") || f.name)}</span>}
    </div>
  );
}

/** On phones the team strip sticks just under the slim site header, which is 56px tall once you scroll. */
const HEADER = 56;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const ease = "cubic-bezier(.2,.7,.2,1)";

/** Scrolls the page so a team's heading sits just under the sticky strip. */
function scrollToTeam(list: HTMLElement | null, strip: HTMLElement | null, slug: string, smooth: boolean) {
  const s = list?.querySelector<HTMLElement>(`[data-team="${CSS.escape(slug)}"]`);
  if (!s) return;
  // Layout position, not the on-screen one: the page's enter animation moves it for a moment after a link click
  let y = 0;
  for (let e: HTMLElement | null = s; e; e = e.offsetParent as HTMLElement | null) y += e.offsetTop;
  const top = y - HEADER - (strip?.offsetHeight ?? 0);
  window.scrollTo({ top: Math.max(0, top), behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto" });
}

/**
 * Phones: a sticky strip of team chips over one grouped list. Tapping a chip scrolls to that team, the chip of the
 * team in view is marked by a violet pill that slides between chips, the office bearers are a swipe deck and every
 * other member is a row that opens to show their links. Keyed by academic year, so switching years starts fresh.
 */
function PhoneTeam({ session, domain, fadeIn }: { session: Session; domain: string | null; fadeIn: boolean }) {
  const groups = session.groups;
  const navType = useNavigationType();
  const strip = useRef<HTMLDivElement>(null), row = useRef<HTMLDivElement>(null), pill = useRef<HTMLSpanElement>(null), list = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(groups[0]?.slug ?? "");
  const [open, setOpen] = useState<string | null>(null);
  // While a tap-scroll runs, the scroll position doesn't pick the chip; `wanted` is the team that was asked for
  const lockUntil = useRef(0), wanted = useRef<string | null>(null);

  const jump = (slug: string, smooth: boolean) => {
    lockUntil.current = performance.now() + 1200; wanted.current = slug;
    setActive(slug);
    scrollToTeam(list.current, strip.current, slug, smooth);
  };

  // A new year's content fades and rises in
  useEffect(() => {
    if (!fadeIn || prefersReducedMotion()) return;
    const a = list.current?.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 350, easing: ease });
    return () => a?.cancel();
  }, [fadeIn]);

  // ?domain=<slug> (Home's team list links here) scrolls to that team instead of filtering. Back/Forward keep the restored position.
  useEffect(() => {
    if (!domain || !groups.some(g => g.slug === domain)) return;
    if (navType === "POP" && window.scrollY > 0) return;
    lockUntil.current = performance.now() + 800; wanted.current = domain;
    setActive(domain);
    let live = true;
    const go = () => { if (live) scrollToTeam(list.current, strip.current, domain, false); };
    const stop = () => { live = false; };
    const input = ["touchstart", "wheel", "keydown"] as const;
    input.forEach(t => window.addEventListener(t, stop, { passive: true, once: true }));
    // Next frame, so it lands after the page transition's own scroll to the top; once more when the web fonts have
    // settled the layout, unless you have started scrolling yourself
    const raf = requestAnimationFrame(go);
    document.fonts.ready.then(() => requestAnimationFrame(go));
    return () => { live = false; cancelAnimationFrame(raf); input.forEach(t => window.removeEventListener(t, stop)); };
  }, [domain, groups, navType]);

  // Marks the team whose section is at the strip. The observer fires as sections cross the line under the strip.
  useEffect(() => {
    const sections = Array.from(list.current?.querySelectorAll<HTMLElement>("[data-team]") ?? []);
    if (!sections.length) return;
    // A section counts as passed once no more than 8px of it is left below the strip. The observer's top edge sits on
    // the same line, so it fires exactly when the answer can change (browsers without scrollend rely on that).
    const line = HEADER + (strip.current?.offsetHeight ?? 0) + 8, doc = document.documentElement;
    const pick = () => {
      if (performance.now() < lockUntil.current) return;
      if (window.scrollY > 0 && window.scrollY + window.innerHeight >= doc.scrollHeight - 4) {
        // At the very end the last teams can't reach the strip, so the one you picked (or the last one) stays marked
        const w = sections.find(s => s.dataset.team === wanted.current);
        setActive((w && w.getBoundingClientRect().top < window.innerHeight ? w : sections[sections.length - 1]).dataset.team!);
        return;
      }
      wanted.current = null;
      const current = sections.find(s => s.getBoundingClientRect().bottom > line) ?? sections[sections.length - 1];
      setActive(current.dataset.team!);
    };
    const io = new IntersectionObserver(pick, { rootMargin: `-${line}px 0px -55% 0px` });
    sections.forEach(s => io.observe(s));
    const end = () => { lockUntil.current = 0; pick(); };
    window.addEventListener("scrollend", end);
    return () => { io.disconnect(); window.removeEventListener("scrollend", end); };
  }, [groups]);

  // The pill slides (transform only) from the last chip to the active one; its size is set, then scaled from the old width
  const last = useRef<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const p = pill.current, chip = row.current?.querySelector<HTMLElement>(`[data-chip="${CSS.escape(active)}"]`);
    if (!p || !chip) return;
    const place = (animate: boolean) => {
      const x = chip.offsetLeft, w = chip.offsetWidth, from = last.current;
      Object.assign(p.style, { width: `${w}px`, height: `${chip.offsetHeight}px`, top: `${chip.offsetTop}px`, transform: `translateX(${x}px)`, opacity: "1" });
      last.current = { x, w };
      if (animate && from && (from.x !== x || from.w !== w) && !prefersReducedMotion()) {
        p.animate([{ transform: `translateX(${from.x}px) scaleX(${from.w / w})` }, { transform: `translateX(${x}px)` }], { duration: 300, easing: ease });
      }
    };
    place(true);
    // Chip widths change once the web font has loaded; any chip before this one moves it, so watch them all
    const ro = new ResizeObserver(() => place(false));
    row.current!.querySelectorAll("[data-chip]").forEach(c => ro.observe(c));
    return () => ro.disconnect();
  }, [active]);

  // Keep the active chip in view inside the strip (sideways only, so the page scroll is never touched)
  useEffect(() => {
    const r = row.current, chip = r?.querySelector<HTMLElement>(`[data-chip="${CSS.escape(active)}"]`);
    if (!r || !chip) return;
    r.scrollTo({ left: chip.offsetLeft - (r.clientWidth - chip.offsetWidth) / 2, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [active]);

  return (
    <div className="wrap mt-2">
      {groups.length > 1 && (
        <div ref={strip} className="sticky top-[56px] z-30 -mx-5 border-b border-line/70 bg-ink px-5">
          <nav aria-label="Teams">
            <div ref={row} className="snap-row snap-row-fade relative flex gap-2">
              <span ref={pill} aria-hidden className="pointer-events-none absolute left-0 top-0 origin-left snap-align-none rounded-full bg-violet opacity-0" />
              {groups.map(g => {
                const on = g.slug === active;
                return (
                  <button key={g.slug} type="button" data-chip={g.slug} aria-current={on ? "true" : undefined} onClick={() => jump(g.slug, true)}
                    className={`chip relative z-10 min-h-[44px] ${on ? "border-transparent text-white" : ""}`}>
                    {g.domain}
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      )}

      <div ref={list}>
        {session.faculty.length > 0 && (
          <section className="mt-2">
            <Reveal>
              <div className="flex h-[60px] items-center"><h2 className="text-[18px] font-semibold">Faculty</h2></div>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
                {session.faculty.map(f => (
                  <li key={f.name} className="flex min-h-[64px] items-center gap-3 px-4 py-3">
                    <FacultyFace f={f} size={44} />
                    <div className="min-w-0"><p className="font-semibold">{f.name}</p><p className="text-[15px] text-mute">{f.role}</p></div>
                  </li>
                ))}
              </ul>
            </Reveal>
          </section>
        )}

        {groups.map((g, gi) => {
          // The office bearers get the swipe deck; without any photos they stay rows like everyone else
          const deck = g.slug === "management" && g.members.some(m => m.photo);
          return (
            <section key={g.slug} data-team={g.slug} aria-labelledby={`team-${g.slug}`} className={gi === 0 && !session.faculty.length ? "mt-2" : "mt-6"}>
              <Reveal>
                <div className="flex h-[60px] items-center justify-between gap-4">
                  <h2 id={`team-${g.slug}`} className="text-[18px] font-semibold">{g.domain}</h2>
                  <span className="shrink-0 text-[14px] text-mute">{plural(g.members.length, "person", "people")}</span>
                </div>
                {deck ? <BearerDeck members={g.members} label={g.domain} /> : (
                  <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
                    {g.members.map((m, i) => {
                      const key = `${g.slug}-${i}`;
                      return <MemberRow key={m.name} m={m} id={`member-${key}`} open={open === key} onToggle={() => setOpen(o => (o === key ? null : key))} />;
                    })}
                  </ul>
                )}
              </Reveal>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default function Team() {
  useTitle("Team", "The students who run IEEE CIS REC, by team and academic year.");
  const [params, setParams] = useSearchParams();
  const phone = useMediaQuery(PHONE);
  // Set when the year is changed on a phone, so the new year's list fades in (not on the first visit)
  const [switched, setSwitched] = useState(false);
  const session = sessions.find(s => s.id === params.get("year")) || sessions[0];
  const domain = params.get("domain") || "all";
  const groups = session.groups.filter(g => domain === "all" || g.slug === domain);
  const count = session.groups.reduce((n, g) => n + g.members.length, 0);
  const set = (k: string, v: string) => setParams(p => {
    if (v) p.set(k, v); else p.delete(k);
    if (k === "year") p.delete("domain");
    return p;
  }, { replace: true });

  if (phone) {
    return (
      <>
        <PageHeader title="Team" shape="constellation">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
            <p><span className="text-cream">{count}</span> {count === 1 ? "person" : "people"} · <span className="text-cream">{session.groups.length}</span> {session.groups.length === 1 ? "team" : "teams"}</p>
            {sessions.length > 1 && (
              // Just the year, so the count and the pill share one line (the newest year is listed first)
              <select aria-label="Academic year" value={session.id} onChange={e => { setSwitched(true); set("year", e.target.value === sessions[0].id ? "" : e.target.value); }}
                className="min-h-[44px] rounded-full border border-line bg-panel pl-4 pr-9 text-[15px] text-cream">
                {sessions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            )}
          </div>
          {session.note && <p className="mt-2 text-[15px]">{session.note}</p>}
        </PageHeader>
        <PhoneTeam key={session.id} session={session} domain={params.get("domain")} fadeIn={switched} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Team"
        shape="constellation"
        below={sessions.length > 1 && (
          <label className="inline-flex items-center gap-3 text-[14px] text-mute">
            Academic year
            <select value={session.id} onChange={e => set("year", e.target.value === sessions[0].id ? "" : e.target.value)}
              className="min-h-[46px] rounded-full border border-line bg-panel px-5 pr-10 text-[15px] text-cream">
              {sessions.map(s => <option key={s.id} value={s.id}>{s.label}{s === sessions[0] ? " (current)" : ""}</option>)}
            </select>
          </label>
        )}>
        {session.note || `${count} students across ${session.groups.length} teams run the chapter in ${session.label}.`}
      </PageHeader>

      <div className="wrap mt-10">
        {session.groups.length > 1 && (
          // One sideways-scrolling row on phones so member photos start on the first screen; wraps from sm up
          <div className="snap-row snap-row-fade flex gap-2 sm:flex-wrap" role="group" aria-label="Filter by team">
            <button aria-pressed={domain === "all"} className={`chip gap-1.5 ${domain === "all" ? "chip-on" : ""}`} onClick={e => { set("domain", ""); revealChip(e.currentTarget); }}>
              Everyone <span className="tabular-nums opacity-70">({count})</span>
            </button>
            {session.groups.map(g => (
              <button key={g.slug} aria-pressed={domain === g.slug} className={`chip gap-1.5 ${domain === g.slug ? "chip-on" : ""}`} onClick={e => { set("domain", g.slug); revealChip(e.currentTarget); }}>
                {g.domain} <span className="tabular-nums opacity-70">({g.members.length})</span>
              </button>
            ))}
          </div>
        )}

        {session.faculty.length > 0 && domain === "all" && (
          <section className="mt-14">
            <h2 className="mb-6 text-xl font-semibold">Faculty</h2>
            <div className="flex flex-wrap gap-4">
              {session.faculty.map(f => (
                <div key={f.name} className="flex items-center gap-4 rounded-2xl border border-line bg-panel px-6 py-4">
                  <FacultyFace f={f} size={56} />
                  <div className="min-w-0"><p className="font-semibold">{f.name}</p><p className="text-[15px] text-mute">{f.role}</p></div>
                </div>
              ))}
            </div>
          </section>
        )}

        {groups.map(g => {
          const lead = g.slug === "management";
          return (
            <section key={g.slug} className="mt-16">
              <div className="mb-8 flex items-baseline gap-4 border-b border-line pb-4">
                <h2 className="text-2xl font-semibold">{g.domain}</h2>
                <span className="text-mute">{g.members.length}</span>
              </div>
              <div className={`grid gap-x-6 gap-y-10 ${lead ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"}`}>
                {g.members.map((m, i) => <Reveal key={m.name} delay={(i % 5) * 80} className="h-full"><MemberCard m={m} large={lead} /></Reveal>)}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
