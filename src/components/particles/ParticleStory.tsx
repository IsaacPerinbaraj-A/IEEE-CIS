import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import { ParticleField, type ShapeSpec } from "./engine";
import { prefersReducedMotion } from "../../lib/motion";
import { deviceTier } from "../../lib/device";
import { chaos, sphere, neural, fuzzy, helix, swarm, textShape, yBounds } from "./shapes";
import { BOUNDS, VIS_H, fitShape, isSideLayout, type Placement, type Region } from "./layout";

/** Formation order: 0 intro cloud, 1 chapter name, 2 hero globe, 3-6 the four ideas of computational intelligence. */
const COLORS: [string, string][] = [
  ["#8B5CF6", "#EC4899"], ["#C4B5FD", "#F4EFE4"], ["#22D3EE", "#A855F7"],
  ["#8B5CF6", "#22D3EE"], ["#F472B6", "#A78BFA"], ["#F2B544", "#EC4899"], ["#22D3EE", "#F2B544"],
];
/** Colours of the soft glow behind each formation. */
const GLOW: [string, string][] = [
  ["#6D28D9", "#DB2777"], ["#6D28D9", "#4C1D95"], ["#7C3AED", "#0891B2"],
  ["#6D28D9", "#0E7490"], ["#BE185D", "#6D28D9"], ["#B45309", "#BE185D"], ["#0E7490", "#B45309"],
];
const TEXT = 1, HERO = 2, STEPS = 4;
const FORM = 1700, HOLD = 1300;
/** If the particles still aren't ready after this long, skip the intro and just show the page. */
const INTRO_FAILSAFE = 6000;
/** Remembers (for this browser tab session) that the intro has been seen, so later loads play a shorter version. */
const INTRO_SEEN_KEY = "cis-intro-seen";
const introSeen = () => { try { return sessionStorage.getItem(INTRO_SEEN_KEY) === "1"; } catch { return false; } };
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const INTERACTIVE = "a,button,input,select,textarea,label,[role=button]";
const textLinesFor = (mobile: boolean) => (mobile ? ["IEEE", "CIS", "REC"] : ["IEEE CIS", "REC"]);

/** Resets on every page load, so a refresh on the landing page always replays the intro. */
let introPlayedThisLoad = false;
/** The intro belongs to the landing page: it plays when the site is opened or refreshed on "/", not when you click back to Home. */
const openedOnHome = typeof window !== "undefined" && window.location.pathname === "/";

const NAV_H = 68;
const STORY_BOUNDS = [BOUNDS.neural, BOUNDS.fuzzy, BOUNDS.helix, BOUNDS.swarm];

/** Where the page content actually is, in pixels from the canvas's top-left (independent of scroll). */
function measure(canvas: HTMLCanvasElement, content: HTMLElement | null) {
  const c = canvas.getBoundingClientRect(), top = content?.getBoundingClientRect().top ?? c.top;
  const wrapEl = content?.querySelector<HTMLElement>(".hero-wrap"), copyEl = content?.querySelector<HTMLElement>(".hero-copy");
  const cardEl = content?.querySelector<HTMLElement>(".step-card");
  const pad = wrapEl ? parseFloat(getComputedStyle(wrapEl).paddingLeft) || 20 : 20, wr = wrapEl?.getBoundingClientRect();
  const cL = wr ? wr.left - c.left + pad : 20, cR = wr ? wr.right - c.left - pad : c.width - 20;
  return {
    cL, cR,
    copyR: copyEl ? copyEl.getBoundingClientRect().right - c.left : cL + (cR - cL) * 0.54,
    copyTop: copyEl ? copyEl.getBoundingClientRect().top - top : c.height * 0.45,
    cardR: cardEl ? cardEl.getBoundingClientRect().right - c.left : cL + 470,
  };
}

function layout(w: number, h: number, m: ReturnType<typeof measure>) {
  const visH = VIS_H, visW = visH * (w / h), mobile = w < 760, side = isSideLayout();
  // On wide screens the shape may use part of the empty margin, but never runs to the screen edge
  const right = Math.min(w - 24, m.cR + Math.max(0, w - m.cR) * 0.6);
  const hero: Region = side
    ? { x0: m.copyR + 24, x1: right, y0: NAV_H + 20, y1: h - 28 }
    : { x0: 16, x1: w - 16, y0: NAV_H + 8, y1: Math.max(NAV_H + 120, m.copyTop - 16) };
  const story: Region = side
    ? { x0: m.cardR + 40, x1: right, y0: NAV_H + 20, y1: h - 28 }
    : { x0: 16, x1: w - 16, y0: NAV_H + 8, y1: h * 0.46 };
  // Keep the name inside the screen both ways, leaving room for the caption underneath
  const textWidth = mobile ? visW * 0.8 : Math.min(visW * 0.66, visH * 1.25, 6.2);
  return {
    mobile, visW, visH, textWidth, textY: mobile ? visH * 0.1 : visH * 0.07,
    items: [
      { offset: [0, 0, 0], scale: mobile ? 0.6 : 1 },
      { offset: [0, mobile ? visH * 0.1 : visH * 0.07, 0], scale: 1 },
      fitShape(BOUNDS.sphere, hero, w, h),
      ...STORY_BOUNDS.map(b => fitShape(b, story, w, h)),
    ] as Placement[],
  };
}

type Phase = "off" | "loading" | "forming" | "hold" | "release";

/**
 * `labels` (one per step) adds a progress rail under the header while the four steps scroll by;
 * `skipTo` is the id of the element its "Skip to events" button scrolls to.
 */
export default function ParticleStory({ hero, steps, labels, skipTo }: { hero: ReactNode; steps: ReactNode[]; labels?: string[]; skipTo?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const glowA = useRef<HTMLDivElement>(null), glowB = useRef<HTMLDivElement>(null);
  const skipRef = useRef<() => void>(() => {});
  const [phase, setPhase] = useState<Phase>("off");
  const [loaded, setLoaded] = useState(0);
  const [captionTop, setCaptionTop] = useState<number | null>(null);
  const [webgl, setWebgl] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current!, wrap = wrapRef.current!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // While the name forms, the hidden page behind the intro can't be tabbed to, so "Skip intro" is the first stop
    const lockPage = (lock: boolean) => {
      [document.querySelector("header"), contentRef.current, document.querySelector("footer"), document.querySelector(".skip-link")]
        .forEach(el => { if (lock) el?.setAttribute("inert", ""); else el?.removeAttribute("inert"); });
    };
    const done = () => { document.body.dataset.intro = "done"; lockPage(false); };
    if (!ParticleField.supported()) { setWebgl(false); done(); return; }
    const playIntro = !reduce && openedOnHome && !introPlayedThisLoad;
    if (playIntro) { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; window.scrollTo(0, 0); }

    const L0 = layout(canvas.clientWidth, canvas.clientHeight, measure(canvas, contentRef.current));
    const tier = deviceTier();
    const count = tier === "low" ? (L0.mobile ? 1900 : 4000) : (L0.mobile ? 2600 : 6500);
    let field: ParticleField;
    try { field = new ParticleField(canvas, count, { highPerformance: tier === "high", maxDpr: tier === "low" ? 1 : undefined }); } catch { setWebgl(false); done(); return; }
    field.motion = reduce ? 0 : 1;
    field.interactive = !playIntro;

    let disposed = false, glowStage = -1, textIsMobile = L0.mobile, textPositions: Float32Array | null = null;
    const setGlow = (i: number) => {
      if (i === glowStage) return; glowStage = i;
      if (glowA.current) glowA.current.style.backgroundColor = GLOW[i][0];
      if (glowB.current) glowB.current.style.backgroundColor = GLOW[i][1];
    };
    // Place the caption just under the lowest particle of the name
    const placeCaption = () => {
      if (!textPositions) return;
      const L = layout(canvas.clientWidth, canvas.clientHeight, measure(canvas, contentRef.current)), { min } = yBounds(textPositions);
      const bottomWorld = L.textY + min, h = canvas.clientHeight;
      setCaptionTop(((L.visH / 2 - bottomWorld) / L.visH) * h + (L.mobile ? 26 : 34));
    };

    // How far down the story you are: 0 at the hero, k at the top of step k, STEPS at the last step and beyond
    const storyPos = () => {
      const y = -wrap.getBoundingClientRect().top, els = Array.from(contentRef.current?.children || []) as HTMLElement[];
      const tops = els.map(e => e.offsetTop);
      if (tops.length < 2) return null;
      for (let k = 0; k < tops.length - 1; k++) if (y < tops[k + 1]) return k + Math.max(0, (y - tops[k]) / (tops[k + 1] - tops[k]));
      return STEPS;
    };
    const scrollTarget = () => {
      // Interpolate between the tops of the hero and each step, so shapes line up with cards at any height
      const s = storyPos();
      if (s === null) return HERO;
      const k = Math.min(Math.floor(s), STEPS - 1), f = s - k;
      const x = Math.max(0, Math.min(1, (f - 0.3) / 0.4)), sm = x * x * (3 - 2 * x);
      return HERO + Math.min(STEPS, s >= STEPS ? STEPS : k + sm);
    };

    // Intro timeline (shorter when the intro was already seen earlier in this session)
    const repeat = introSeen();
    const form = repeat ? 1100 : FORM, hold = repeat ? 500 : HOLD, minLoading = repeat ? 250 : 700, releaseMs = repeat ? 1100 : 1500;
    let introStart = 0, releaseAt = 0, releaseFrom = TEXT, releaseDur = releaseMs, skipRequested = false;
    let introPhase: Phase = "off";
    const go = (p: Phase) => {
      introPhase = p; setPhase(p);
      document.body.dataset.intro = p === "off" ? "done" : p === "release" ? "leaving" : "on";
      lockPage(p === "loading" || p === "forming" || p === "hold");
    };
    const markSeen = () => { introPlayedThisLoad = true; try { sessionStorage.setItem(INTRO_SEEN_KEY, "1"); } catch { /* storage blocked: the intro just stays full length */ } };
    // Mark as played only once it finishes, so a remount mid-intro (React dev mode) plays it again
    const finishIntro = () => { markSeen(); go("off"); field.follow = true; field.interactive = true; field.morphTarget = scrollTarget(); };
    const release = (dur: number) => {
      if (introPhase === "release" || introPhase === "off") return;
      releaseFrom = field.morph; releaseAt = performance.now(); releaseDur = dur; go("release");
    };
    skipRef.current = () => { if (introPhase === "loading") { skipRequested = true; return; } release(700); };
    const TOTAL = form + hold;

    field.onFrame = () => {
      const now = performance.now();
      if (introPhase === "forming" || introPhase === "hold") {
        const e = now - introStart;
        if (ringRef.current) ringRef.current.style.strokeDashoffset = String(100 - Math.min(100, (e / TOTAL) * 100));
        if (e < form) field.morph = ease(e / form) * TEXT;
        else { field.morph = TEXT; if (introPhase === "forming") go("hold"); if (e > TOTAL) release(releaseMs); }
      } else if (introPhase === "release") {
        const e = Math.min(1, (now - releaseAt) / releaseDur);
        field.morph = releaseFrom + (HERO - releaseFrom) * ease(e);
        if (e >= 1) finishIntro();
      } else if (field.follow) field.morphTarget = scrollTarget();
      setGlow(Math.max(0, Math.min(GLOW.length - 1, Math.round(field.morph))));
    };

    const build = async () => {
      const L = layout(canvas.clientWidth, canvas.clientHeight, measure(canvas, contentRef.current));
      textPositions = await textShape(count, textLinesFor(L.mobile), L.textWidth);
      placeCaption();
      const gens = [chaos, null, sphere, neural, fuzzy, helix, swarm];
      return gens.map((g, i): ShapeSpec => ({
        positions: i === TEXT ? textPositions! : g!(count), colors: COLORS[i], offset: L.items[i].offset, scale: L.items[i].scale,
        spin: [0.3, 0, 1, 0, 1, 1, 1][i], sway: [0, 0, 0, 1, 0, 0, 0][i],
        flutter: i === 6 ? 1 : i === 0 ? 0.5 : 0, size: [1.5, 1.75, 1, 1.15, 1.05, 1.15, 1.25][i],
      }));
    };

    let loadTimer = 0, failsafeTimer = 0;
    if (playIntro) {
      go("loading");
      const t0 = performance.now();
      loadTimer = window.setInterval(() => setLoaded(v => Math.min(92, v + Math.max(1, Math.round((92 - v) * 0.12)))), 40);
      field.follow = false; field.morph = 0;
      // Failsafe: if building the shapes hangs or fails, drop the intro and show the page instead of a locked screen
      const abortIntro = () => {
        if (disposed || introPhase !== "loading") return;
        clearInterval(loadTimer); markSeen(); go("off");
        field.follow = true; field.interactive = true; field.morph = field.morphTarget = scrollTarget();
      };
      failsafeTimer = window.setTimeout(abortIntro, INTRO_FAILSAFE);
      build().then(specs => {
        if (disposed) return;
        field.setShapes(specs); field.resize(); field.start();
        if (introPhase === "off") { field.morph = field.morphTarget = scrollTarget(); return; } // the failsafe already showed the page
        clearTimeout(failsafeTimer);
        window.setTimeout(() => {
          if (disposed || introPhase !== "loading") return;
          clearInterval(loadTimer); setLoaded(100); introStart = performance.now();
          go("forming");
          if (skipRequested) release(900);
        }, skipRequested ? 0 : Math.max(0, minLoading - (performance.now() - t0)));
      }).catch(abortIntro);
    } else {
      done();
      build().then(specs => {
        if (disposed) return;
        field.setShapes(specs); field.follow = true; field.morph = field.morphTarget = scrollTarget(); field.resize();
        if (reduce) field.draw(); else field.start();
      });
    }

    // Pause when the story is off screen or the tab is hidden
    let inView = true;
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; if (reduce) { field.draw(); return; } if (e.isIntersecting) field.start(); else if (introPhase === "off") field.stop(); });
    io.observe(wrap);
    // Coming back to the tab only restarts the particles if the story is on screen (or the intro is still playing)
    const onVis = () => { if (document.hidden) field.stop(); else if (!reduce && (inView || introPhase !== "off")) field.start(); };
    document.addEventListener("visibilitychange", onVis);

    const toNdc = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) return null;
      return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)] as const;
    };
    const onMove = (e: PointerEvent) => { const p = e.pointerType === "mouse" ? toNdc(e) : null; if (p) field.pointer(p[0], p[1]); else field.pointer(null); };
    const onLeave = () => field.pointer(null);
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest(INTERACTIVE) || (e.target as HTMLElement).closest(".reveal")) return;
      const p = toNdc(e); if (p) field.shock(p[0], p[1]);
    };
    // Progress rail: shown only while the four steps are on screen; each segment fills as its step arrives
    let railRaf = 0;
    const updateRail = () => {
      const rail = railRef.current, s = storyPos();
      if (!rail || s === null) return;
      const show = s > 0.55 && wrap.getBoundingClientRect().bottom > window.innerHeight * 0.75;
      const active = Math.max(0, Math.min(STEPS - 1, Math.round(s) - 1));
      rail.dataset.show = show ? "1" : "0";
      rail.querySelectorAll<HTMLElement>("[data-step]").forEach((li, i) => {
        li.style.setProperty("--fill", Math.max(0, Math.min(1, s - i)).toFixed(3));
        if (show && i === active) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
      });
    };
    const onScroll = () => {
      cancelAnimationFrame(railRaf); railRaf = requestAnimationFrame(updateRail);
      if (reduce) { field.morph = field.morphTarget = scrollTarget(); field.draw(); }
    };
    updateRail();
    let rt = 0;
    const onResize = () => {
      clearTimeout(rt);
      rt = window.setTimeout(async () => {
        const L = layout(canvas.clientWidth, canvas.clientHeight, measure(canvas, contentRef.current));
        field.setLayout(L.items);
        if (L.mobile !== textIsMobile) {
          textIsMobile = L.mobile;
          textPositions = await textShape(count, textLinesFor(L.mobile), L.textWidth);
          field.replaceShape(TEXT, textPositions);
        }
        placeCaption(); field.resize(); updateRail();
      }, 150);
    };
    if (!reduce) {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
      document.addEventListener("pointerleave", onLeave);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") skipRef.current(); };
    window.addEventListener("keydown", onKey);

    return () => {
      disposed = true; clearInterval(loadTimer); clearTimeout(failsafeTimer); cancelAnimationFrame(railRaf); io.disconnect(); field.dispose();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerdown", onDown); document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onResize); window.removeEventListener("keydown", onKey);
      done();
    };
  }, []);

  const introVisible = phase !== "off";
  return (
    // Pulled up under the navbar so the scene fills the whole screen
    <div ref={wrapRef} className="relative -mt-[69px]">
      <div className="sticky top-0 h-[100svh] overflow-hidden" aria-hidden="true">
        <div ref={glowA} className="glow-a absolute h-[60vh] w-[60vh] rounded-full opacity-40 blur-[120px] transition-[background-color,right,top] duration-1000" style={{ backgroundColor: GLOW[2][0] }} />
        <div ref={glowB} className="glow-b absolute h-[50vh] w-[50vh] rounded-full opacity-30 blur-[120px] transition-[background-color,right,bottom] duration-1000" style={{ backgroundColor: GLOW[2][1] }} />
        {webgl && <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />}
        <div className="story-shade pointer-events-none absolute inset-0 transition-opacity duration-1000" />
      </div>

      <div ref={contentRef} className="relative -mt-[100svh]">
        <div className="hero-stage relative flex min-h-[100svh] pt-[68px]">{hero}</div>
        {steps.map((s, i) => <div key={i} className="story-step relative flex">{s}</div>)}
      </div>

      {/* Progress rail (idea from the second version's intelligence stack spine). Sits above the content but only its button takes clicks. */}
      {labels && labels.length === STEPS && (
        <div className="pointer-events-none absolute inset-0 z-[5]">
          <div ref={railRef} data-show="0" className="story-rail sticky top-[69px]">
            <nav aria-label="Story progress" className="wrap flex items-start gap-4 pb-8 pt-3">
              <ol className="flex flex-1 gap-2">
                {labels.map((label, i) => (
                  <li key={label} data-step={i} className="story-rail-step min-w-0 flex-1">
                    <span aria-hidden className="block h-[3px] overflow-hidden rounded-full bg-line"><span className="story-rail-fill block h-full w-full bg-gradient-to-r from-violet to-gold" /></span>
                    <span className="sr-only lg:not-sr-only lg:mt-2 lg:block lg:truncate lg:text-[13px]">{label}</span>
                  </li>
                ))}
              </ol>
              {skipTo && (
                <button type="button" onClick={() => document.getElementById(skipTo)?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" })}
                  className="pointer-events-auto -mt-1.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-ink/70 px-3.5 py-1.5 text-[14px] text-mute backdrop-blur transition-colors hover:border-violet-soft hover:text-cream">
                  Skip to events <ArrowDown size={14} aria-hidden />
                </button>
              )}
            </nav>
          </div>
        </div>
      )}

      {introVisible && (
        // During the release fade the page is already coming back, so clicks pass through to it
        <div className={`intro-overlay fixed inset-0 z-[80] ${phase === "release" ? "pointer-events-none" : ""}`}>
          <div className={`absolute inset-x-0 px-6 text-center transition-all duration-700 ${phase === "hold" ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
               style={{ top: captionTop ?? "72%" }}>
            <p className="font-display text-[clamp(0.95rem,1.8vw,1.3rem)] font-medium text-cream">Computational Intelligence Society</p>
            <p className="mt-1.5 text-[clamp(0.85rem,1.3vw,1rem)] text-mute">Rajalakshmi Engineering College, Chennai</p>
          </div>
          <div className={`absolute bottom-8 left-6 flex items-center gap-3 text-[14px] text-mute transition-opacity duration-500 sm:left-10 ${phase === "loading" ? "opacity-100" : "opacity-0"}`}>
            <span className="h-[3px] w-24 overflow-hidden rounded-full bg-line"><span className="block h-full bg-gradient-to-r from-violet to-gold transition-[width] duration-200" style={{ width: `${loaded}%` }} /></span>
            <span className="tabular-nums">{loaded}%</span>
          </div>
          <button onClick={() => skipRef.current()}
            className="absolute bottom-6 right-6 inline-flex items-center gap-3 rounded-full border border-line bg-ink/60 py-2 pl-4 pr-2 text-[14px] text-mute backdrop-blur transition-colors hover:border-violet-soft hover:text-cream sm:right-10">
            Skip intro
            <svg viewBox="0 0 36 36" className="h-8 w-8 -rotate-90" aria-hidden>
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#33284D" strokeWidth="2.5" />
              <circle ref={ringRef} cx="18" cy="18" r="15.9" fill="none" stroke="#F2B544" strokeWidth="2.5" strokeLinecap="round" pathLength={100} strokeDasharray="100" strokeDashoffset="100" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
