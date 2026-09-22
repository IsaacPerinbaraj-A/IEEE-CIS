import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Check, Mail, Sparkles } from "lucide-react";
import PageHeader from "../components/PageHeader";
import Accordion from "../components/Accordion";
import StickyAction from "../components/StickyAction";
import faqs from "../data/faqs.json";
import { join, site, type JoinStep } from "../lib/data";
import { Instagram } from "../lib/icons";
import { prefersReducedMotion } from "../lib/motion";
import { useMediaQuery, PHONE } from "../lib/useMediaQuery";
import { useTitle } from "../lib/useTitle";
import { Reveal, RevealWords, Tilt } from "../components/Motion";

/** Where a step's button goes. Steps marked useMemberForm open the chapter form from Site settings (empty until it exists). */
const linkFor = (s: JoinStep) => (s.useMemberForm ? site.memberForm : s.href);

// Phones remember which steps were ticked off, by step title. Storage can be missing or blocked (private mode),
// so every access is guarded and the page works without it.
const DONE_KEY = "ieee-cis-rec:join-done";
const readDone = (): string[] => {
  try { const v: unknown = JSON.parse(localStorage.getItem(DONE_KEY) || "[]"); return Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : []; }
  catch { return []; }
};
const saveDone = (titles: string[]) => { try { localStorage.setItem(DONE_KEY, JSON.stringify(titles)); } catch { /* ticks last until the page closes */ } };

/** Header height on phones once it has slimmed, plus a little air, for scrolling a step into view. */
const HEADER = 56 + 16;

/**
 * Phones: the three steps as a vertical stepper. Gold marks the step to do next; ticking a step flips its number
 * to a check and moves the gold on. The line between steps draws once when the list comes into view.
 * A bar at the bottom ("Step 2 of 3", Become a member) appears once the steps are scrolled above the screen.
 */
function PhoneSteps({ steps }: { steps: JoinStep[] }) {
  const [done, setDone] = useState(readDone);
  const [drawn, setDrawn] = useState(prefersReducedMotion);
  const [above, setAbove] = useState(false), [footerOn, setFooterOn] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const isDone = (s: JoinStep) => done.includes(s.title);
  const current = steps.findIndex(s => !isDone(s));

  const toggle = (s: JoinStep) => {
    const next = (isDone(s) ? done.filter(t => t !== s.title) : [...done, s.title]).filter(t => steps.some(x => x.title === t));
    setDone(next); saveDone(next);
  };

  useEffect(() => {
    const el = list.current!, footer = document.querySelector("footer");
    // Draw once the list is on screen, or straight away if it's already above (Back returns mid-page)
    const draw = new IntersectionObserver(entries => {
      const e = entries[entries.length - 1];
      if (e.isIntersecting || e.boundingClientRect.top < 0) { setDrawn(true); draw.disconnect(); }
    }, { rootMargin: "0px 0px -12% 0px" });
    // Position-based: the bar shows while the whole list is above the screen (behind the header counts)
    const pos = new IntersectionObserver(entries => {
      const e = entries[entries.length - 1];
      setAbove(!e.isIntersecting && e.boundingClientRect.bottom <= (e.rootBounds?.top ?? 56));
    }, { rootMargin: "-56px 0px 0px 0px" });
    const foot = new IntersectionObserver(entries => setFooterOn(entries[entries.length - 1].isIntersecting));
    draw.observe(el); pos.observe(el); if (footer) foot.observe(footer);
    return () => { draw.disconnect(); pos.disconnect(); foot.disconnect(); };
  }, []);

  const goToCurrent = () => {
    const li = list.current?.children[current] as HTMLElement | undefined;
    if (!li) return;
    window.scrollTo({ top: li.getBoundingClientRect().top + window.scrollY - HEADER, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    li.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  };

  // Staggered one-time entrance. Only the entrance properties carry a delay, so ticking responds at once
  const after = (ms: number): CSSProperties => ({ transitionDelay: drawn ? `${ms}ms` : "0ms" });

  return (
    <section className="wrap mt-8">
      <ol ref={list} aria-label="Steps to join">
        {steps.map((s, i) => {
          const ticked = isDone(s), cur = i === current, last = i === steps.length - 1, href = linkFor(s);
          const btn = `${cur ? "btn-gold" : "btn-ghost"} mt-4 min-h-[48px] w-full`;
          return (
            <li key={`${i}-${s.title}`} aria-current={cur ? "step" : undefined} className={`relative flex gap-4 ${last ? "" : "pb-9"}`}>
              {/* Line to the next step: draws down once, turns gold when this step is done */}
              {!last && (
                <span aria-hidden style={after(i * 180 + 260)}
                  className={`absolute bottom-1 left-[19px] top-[48px] w-0.5 origin-top rounded-full bg-line transition-transform duration-700 ease-out ${drawn ? "scale-y-100" : "scale-y-0"}`}>
                  <span className={`absolute inset-0 rounded-full bg-gold/70 transition-opacity duration-500 ${ticked ? "opacity-100" : "opacity-0"}`} />
                </span>
              )}
              {/* Node: settles in once, flips from the number to a check when ticked (a crossfade with reduced motion) */}
              <span aria-hidden style={after(i * 180)}
                className={`relative mt-0.5 h-10 w-10 shrink-0 transition-[transform,opacity] duration-500 ease-out [perspective:320px] ${drawn ? "scale-100 opacity-100" : "scale-75 opacity-0"}`}>
                <span className={`absolute inset-0 transition-transform duration-[450ms] ease-[cubic-bezier(.2,.7,.2,1)] [transform-style:preserve-3d] motion-reduce:[transform:none] ${ticked ? "[transform:rotateY(180deg)]" : ""}`}>
                  <span className={`absolute inset-0 grid place-items-center rounded-full border-2 font-display text-[15px] font-semibold transition-opacity [backface-visibility:hidden] ${cur ? "border-gold bg-gold text-ink" : "border-gold/50 bg-ink text-gold"} ${ticked ? "motion-reduce:opacity-0" : ""}`}>{i + 1}</span>
                  <span className={`absolute inset-0 grid place-items-center rounded-full border-2 border-gold bg-ink text-gold transition-opacity [backface-visibility:hidden] [transform:rotateY(180deg)] motion-reduce:[transform:none] ${ticked ? "" : "motion-reduce:opacity-0"}`}><Check size={18} strokeWidth={3} /></span>
                </span>
              </span>
              <div style={after(i * 180 + 80)} className={`min-w-0 flex-1 transition-[transform,opacity] duration-700 ease-out ${drawn ? "" : "translate-y-3 opacity-0"}`}>
                <h2 tabIndex={-1} className="pt-2 text-lg font-semibold leading-snug outline-none">{s.title}</h2>
                <p className="mt-2 text-mute">{s.text}</p>
                {href
                  ? <a href={href} target="_blank" rel="noopener" className={btn}>{s.cta}</a>
                  : <><p className="mt-2 text-[15px] text-mute">The form link will be added soon.</p><a href={`mailto:${site.email}`} className={btn}>Email us that you've joined</a></>}
                <label className="press mt-1.5 flex min-h-[44px] w-fit cursor-pointer items-center gap-3 text-[15px] text-mute">
                  <input type="checkbox" className="peer sr-only" aria-label={`I've done this: ${s.title}`} checked={ticked} onChange={() => toggle(s)} />
                  <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold ${ticked ? "border-gold bg-gold text-ink" : "border-line"}`}>
                    {ticked && <Check size={15} strokeWidth={3} />}
                  </span>
                  I've done this
                </label>
              </div>
            </li>
          );
        })}
      </ol>
      <StickyAction show={above && !footerOn && current >= 0} label="Become a member">
        <p className="min-w-0 flex-1 leading-tight">
          {current >= 0 && <><span className="block text-[14px] text-mute">Step {current + 1} of {steps.length}</span>
            <span className="block truncate text-[15px] font-medium">{steps[current].title}</span></>}
        </p>
        <button type="button" className="btn-gold min-h-[48px] shrink-0 px-5" onClick={goToCurrent}>Become a member</button>
      </StickyAction>
    </section>
  );
}

export default function Join() {
  useTitle("Join", "Open to every REC student, in any department and any year. How to become an IEEE student member, add the Computational Intelligence Society and join the chapter.");
  const phone = useMediaQuery(PHONE);
  return (
    <>
      <PageHeader title="Join the chapter" shape="swarm">Open to every REC student, in any department and any year. You don't need to know AI yet, just want to learn it.</PageHeader>

      {phone ? <PhoneSteps steps={join.steps} /> : (
        <section className="wrap mt-16">
          <ol className="grid gap-6 lg:grid-cols-3">
            {join.steps.map((s, i) => {
              const href = linkFor(s);
              return (
                <Reveal as="li" key={`${i}-${s.title}`} delay={i * 130}><Tilt className="h-full rounded-3xl" max={6}><div className="flex h-full flex-col rounded-3xl border border-line bg-panel p-7">
                  <span className="font-display text-5xl font-semibold text-gold">{i + 1}</span>
                  <h2 className="mt-6 text-xl font-semibold">{s.title}</h2>
                  <p className="mt-3 text-mute">{s.text}</p>
                  {href
                    ? <a href={href} target="_blank" rel="noopener" className="btn-ghost mt-6 self-start">{s.cta}</a>
                    : <p className="mt-auto pt-6 text-[14px] text-mute">The form link will be added soon. Until then, <a className="link" href={`mailto:${site.email}`}>email us</a>.</p>}
                </div></Tilt></Reveal>
              );
            })}
          </ol>
        </section>
      )}

      <section className="wrap mt-28 grid gap-12 max-sm:mt-12 max-sm:gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div><RevealWords text="What you get" className="h-section" /><p className="lede mt-4">Here's what the chapter is actually for.</p></div>
        <ul className="grid gap-x-10 gap-y-8 max-sm:gap-y-6 sm:grid-cols-2">
          {join.benefits.map((b, i) => (
            <Reveal as="li" key={`${i}-${b.title}`} delay={(i % 2) * 120} className="border-l-2 border-violet pl-5 max-sm:pl-4">
              {phone
                ? <h3 className="flex items-start gap-2.5 font-sans text-lg font-semibold"><Sparkles size={20} aria-hidden className="mt-1 shrink-0 text-violet-soft" />{b.title}</h3>
                : <h3 className="font-sans text-lg font-semibold">{b.title}</h3>}
              <p className="mt-1 text-mute">{b.text}</p>
            </Reveal>
          ))}
        </ul>
      </section>

      <section className="wrap mt-28 grid gap-12 max-sm:mt-12 max-sm:gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div>
          <RevealWords text="Questions" className="h-section" />
          <p className="lede mt-4">Something else? <Link to="/contact" className="link">Get in touch</Link>.</p>
        </div>
        <Reveal>
          <Accordion items={faqs} />
          {phone && (
            <div className="mt-6 grid grid-cols-1 gap-3">
              <a href={`mailto:${site.email}`} className="btn-ghost min-h-[48px]"><Mail size={18} aria-hidden />Email us</a>
              <a href={site.instagram} target="_blank" rel="noopener" className="btn-ghost min-h-[48px]"><Instagram size={18} aria-hidden />Message on Instagram</a>
            </div>
          )}
        </Reveal>
      </section>
    </>
  );
}
