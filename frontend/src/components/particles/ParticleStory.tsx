import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ParticleField, type ShapeSpec } from "./engine";
import { deviceTier, PHONE_BUDGET } from "../../lib/device";
import { useMediaQuery, PHONE } from "../../lib/useMediaQuery";
import { chaos, sphere, neural, fuzzy, helix, swarm, constellation, ripple, textShape, yBounds } from "./shapes";
import { BOUNDS, VIS_H, fitShape, isSideLayout, type Placement, type Region } from "./layout";

/**
 * Formation order: 0 intro cloud, 1 chapter name, 2 hero globe, 3-8 one abstract shape per "What We Do" step
 * (network, helix, landscape, constellation, ripple, swarm). The shapes are decoration only.
 */
const COLORS: [string, string][] = [
  ["#8B5CF6", "#EC4899"], ["#C4B5FD", "#F4EFE4"], ["#22D3EE", "#A855F7"],
  ["#8B5CF6", "#22D3EE"], ["#F2B544", "#EC4899"], ["#22D3EE", "#A78BFA"], ["#F472B6", "#A78BFA"], ["#22D3EE", "#8B5CF6"], ["#22D3EE", "#F2B544"],
];
/** Colours of the soft glow behind each formation. */
const GLOW: [string, string][] = [
  ["#6D28D9", "#DB2777"], ["#6D28D9", "#4C1D95"], ["#7C3AED", "#0891B2"],
  ["#6D28D9", "#0E7490"], ["#B45309", "#BE185D"], ["#0E7490", "#6D28D9"], ["#BE185D", "#6D28D9"], ["#0891B2", "#6D28D9"], ["#0E7490", "#B45309"],
];
/** Point clouds by formation index; the chapter name (TEXT) is sampled from type instead. */
const GENS: (((n: number) => Float32Array) | null)[] = [chaos, null, sphere, neural, helix, fuzzy, (n: number) => constellation(n, [5, 4, 4, 3, 3, 3]), ripple, swarm];
const SPIN = [0.3, 0, 1, 0, 1, 1, 0.6, 0, 1], SWAY = [0, 0, 0, 1, 0, 0, 0.5, 0.8, 0], SIZE = [1.5, 1.75, 1, 1.15, 1.15, 1.05, 1.15, 1.15, 1.25];
const TEXT = 1, HERO = 2, STEPS = 6;
/** The chapter name takes FORM ms to gather and then holds for HOLD ms: about 4.5 seconds on screen, on every load. */
const FORM = 1500, HOLD = 3000;
/** If the particles still aren't ready after this long, skip the intro and just show the page. */
const INTRO_FAILSAFE = 6000;
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const INTERACTIVE = "a,button,input,select,textarea,label,[role=button]";
const textLinesFor = (mobile: boolean) => (mobile ? ["IEEE", "CIS", "REC"] : ["IEEE CIS", "REC"]);

/** Resets on every page load, so a refresh on the landing page always replays the intro. */
let introPlayedThisLoad = false;
/** The intro belongs to the landing page: it plays when the site is opened or refreshed on "/", not when you click back to Home. */
const openedOnHome = typeof window !== "undefined" && window.location.pathname === "/";

const NAV_H = 68;
const STORY_BOUNDS = [BOUNDS.neural, BOUNDS.helix, BOUNDS.fuzzy, BOUNDS.constellation, BOUNDS.ripple, BOUNDS.swarm];

/**
 * Phones: the two glows are not blurred with `blur-[120px]` (a costly filter to repaint on a phone). Each is a radial
 * gradient, GLOW_PAD px bigger on every side (the `-inset-[360px]` class below), whose stops follow the soft edge of
 * the blurred disc, so it looks the same. Its colour is the registered custom property --story-glow, which transitions
 * like background-color did, so the glow still crossfades between steps. Browsers without color-mix() or @property
 * keep the blur.
 */
const GLOW_BLUR = 120, GLOW_PAD = 3 * GLOW_BLUR, GLOW_VAR = "--story-glow";
const GLOW_EASE = `${GLOW_VAR} 1000ms cubic-bezier(0.4, 0, 0.2, 1)`;   // Tailwind's transition-* duration-1000
const gradientGlow = typeof CSS !== "undefined" && typeof CSS.registerProperty === "function" && CSS.supports("color", "color-mix(in srgb, red 50%, transparent)");
/** Registered the first time a phone glow is shown, so larger screens never see the property at all. */
let glowRegistered = false;
const registerGlow = () => {
  if (glowRegistered) return;
  glowRegistered = true;
  try { CSS.registerProperty({ name: GLOW_VAR, syntax: "<color>", inherits: false, initialValue: "transparent" }); } catch { /* already registered (hot reload) */ }
};
/** The viewport height in CSS pixels, to within 4px, from media queries (reading innerHeight would force a layout). */
function viewportHeight() {
  let lo = 200, hi = 2000;
  while (hi - lo > 4) { const mid = (lo + hi) >> 1; if (window.matchMedia(`(max-height: ${mid}px)`).matches) hi = mid; else lo = mid; }
  return hi;
}
/** Gradient for a disc of radius `R` px blurred by GLOW_BLUR: at each distance, the share of the Gaussian that falls on the disc. */
function blurGradient(R: number) {
  const s2 = 2 * GLOW_BLUR * GLOW_BLUR, N = 16, NR = 24, NT = 32, end = R + GLOW_PAD, stops: string[] = [];
  for (let j = 0; j <= N; j++) {
    const r = (end * j) / N;
    let sum = 0;
    for (let a = 0; a < NR; a++) {
      const rho = ((a + 0.5) / NR) * R;
      for (let b = 0; b < NT; b++) sum += rho * Math.exp(-(rho * rho + r * r - 2 * rho * r * Math.cos(((b + 0.5) / NT) * Math.PI)) / s2);
    }
    const v = j === N ? 0 : Math.min(1, (sum * (R / NR) * (Math.PI / NT) * 2) / (Math.PI * s2));
    stops.push(`color-mix(in srgb, var(${GLOW_VAR}) ${(v * 100).toFixed(1)}%, transparent) ${((j * 100) / N).toFixed(2)}%`);
  }
  return `radial-gradient(closest-side, ${stops.join(",")})`;
}

/** Where the page content actually is, in pixels from the canvas's top-left (independent of scroll). */
function measure(canvas: HTMLCanvasElement, content: HTMLElement | null) {
  const c = canvas.getBoundingClientRect(), top = content?.getBoundingClientRect().top ?? c.top;
  const wrapEl = content?.querySelector<HTMLElement>(".hero-wrap"), copyEl = content?.querySelector<HTMLElement>(".hero-copy");
  // Steps alternate: the first card sits on the left, the second on the right, and so on
  const cards = content?.querySelectorAll<HTMLElement>(".step-card");
  const pad = wrapEl ? parseFloat(getComputedStyle(wrapEl).paddingLeft) || 20 : 20, wr = wrapEl?.getBoundingClientRect();
  const cL = wr ? wr.left - c.left + pad : 20, cR = wr ? wr.right - c.left - pad : c.width - 20;
  const cardR = cards?.[0] ? cards[0].getBoundingClientRect().right - c.left : cL + 600;
  return {
    cL, cR, cardR,
    copyR: copyEl ? copyEl.getBoundingClientRect().right - c.left : cL + (cR - cL) * 0.54,
    copyTop: copyEl ? copyEl.getBoundingClientRect().top - top : c.height * 0.45,
    cardLeftOfRightCard: cards?.[1] ? cards[1].getBoundingClientRect().left - c.left : cR - (cardR - cL),
  };
}

function layout(w: number, h: number, m: ReturnType<typeof measure>) {
  const visH = VIS_H, visW = visH * (w / h), mobile = w < 760, side = isSideLayout();
  // On wide screens the shape may use part of the empty margin, but never runs to the screen edge
  const right = Math.min(w - 24, m.cR + Math.max(0, w - m.cR) * 0.6);
  const left = Math.max(24, m.cL * 0.4);
  const hero: Region = side
    ? { x0: m.copyR + 24, x1: right, y0: NAV_H + 20, y1: h - 28 }
    : { x0: 16, x1: w - 16, y0: NAV_H + 8, y1: Math.max(NAV_H + 120, m.copyTop - 16) };
  // Wide screens: the shape sits opposite the card, so it glides across the screen as it changes. Phones: above the card.
  const story = (k: number): Region => side
    ? (k % 2 === 0 ? { x0: m.cardR + 40, x1: right, y0: NAV_H + 20, y1: h - 28 } : { x0: left, x1: m.cardLeftOfRightCard - 40, y0: NAV_H + 20, y1: h - 28 })
    : { x0: 16, x1: w - 16, y0: NAV_H + 8, y1: h * 0.46 };
  // Keep the name inside the screen both ways, leaving room for the caption underneath
  const textWidth = mobile ? visW * 0.8 : Math.min(visW * 0.66, visH * 1.25, 6.2);
  return {
    mobile, visW, visH, textWidth, textY: mobile ? visH * 0.1 : visH * 0.07,
    items: [
      { offset: [0, 0, 0], scale: mobile ? 0.6 : 1 },
      { offset: [0, mobile ? visH * 0.1 : visH * 0.07, 0], scale: 1 },
      fitShape(BOUNDS.sphere, hero, w, h),
      ...STORY_BOUNDS.map((b, k) => fitShape(b, story(k), w, h)),
    ] as Placement[],
  };
}

type Phase = "off" | "loading" | "forming" | "hold" | "release";

/**
 * `steps` are the vertical story on tablets and desktop. On phones, `deck` (if given) replaces them with one
 * swipeable section, and the formation follows the deck's horizontal position instead of the page scroll.
 */
export default function ParticleStory({ hero, steps, deck }: { hero: ReactNode; steps: ReactNode[]; deck?: ReactNode }) {
  const phone = useMediaQuery(PHONE);
  const phoneGlow = phone && gradientGlow;
  const wrapRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const glowA = useRef<HTMLDivElement>(null), glowB = useRef<HTMLDivElement>(null);
  const glowStage = useRef(HERO);
  const glowColor = useRef<(i: number) => void>(() => {});
  const skipRef = useRef<() => void>(() => {});
  const [phase, setPhase] = useState<Phase>("off");
  const [loaded, setLoaded] = useState(0);
  const [captionTop, setCaptionTop] = useState<number | null>(null);
  const [webgl, setWebgl] = useState(true);

  // The glow elements differ between phones and larger screens: give the current ones their colour (and on phones
  // their gradient, sized like the 60vh and 50vh discs) before they are painted, including after a rotation
  useLayoutEffect(() => {
    if (phoneGlow) registerGlow();
    const color = (i: number) => [glowA.current, glowB.current].forEach((el, k) => {
      if (!el) return;
      if (phoneGlow) el.style.setProperty(GLOW_VAR, GLOW[i][k]); else el.style.backgroundColor = GLOW[i][k];
    });
    glowColor.current = color;
    color(glowStage.current);
    if (!phoneGlow) return;
    let height = 0;
    const size = () => {
      const vh = viewportHeight() / 100;
      if (vh === height) return;
      height = vh;
      if (glowA.current) glowA.current.style.backgroundImage = blurGradient(30 * vh);
      if (glowB.current) glowB.current.style.backgroundImage = blurGradient(25 * vh);
    };
    size();
    window.addEventListener("resize", size);
    return () => window.removeEventListener("resize", size);
  }, [phoneGlow]);

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

    // Page geometry the story needs every frame, measured only when something changes size (never per frame):
    // the top of the hero and of each step, the story's top in the document, the scroll position, and the deck's scroll
    let stepTops: number[] = [], wrapTop = 0, pageY = 0, deckEl: HTMLElement | null = null, deckMax = 0, deckLeft = 0, scrolled = false;
    const measureSteps = () => {
      stepTops = (Array.from(contentRef.current?.children || []) as HTMLElement[]).map(e => e.offsetTop);
      pageY = window.scrollY;
      wrapTop = wrap.getBoundingClientRect().top + pageY;
      deckEl = contentRef.current?.querySelector<HTMLElement>("[data-deck-track]") ?? null;
      deckMax = deckEl ? deckEl.scrollWidth - deckEl.clientWidth : 0;
      deckLeft = deckEl ? deckEl.scrollLeft : 0;
      scrolled = false;
    };
    // After a scroll event, the positions are read once, by the first frame callback that needs them
    const readScroll = () => {
      if (!scrolled) return;
      scrolled = false; pageY = window.scrollY;
      if (deckEl) deckLeft = deckEl.scrollLeft;
    };
    measureSteps();

    let L = layout(canvas.clientWidth, canvas.clientHeight, measure(canvas, contentRef.current));
    const tier = deviceTier(), budget = window.matchMedia(PHONE).matches ? PHONE_BUDGET.story[tier] : null;
    const usual = tier === "low" ? (L.mobile ? 1900 : 4000) : (L.mobile ? 2600 : 6500);
    const count = budget ? budget.count : usual;
    let field: ParticleField;
    try {
      field = new ParticleField(canvas, count, {
        highPerformance: tier === "high",
        maxDpr: budget ? budget.maxDpr : tier === "low" ? 1 : undefined,
        // A thinner cloud on a phone is drawn with slightly larger points, so the shapes look as dense as before
        pointSize: budget && budget.count < usual ? 2.5 : undefined,
      });
    } catch { setWebgl(false); done(); return; }
    field.motion = reduce ? 0 : 1;
    field.interactive = !playIntro;
    field.setShapes(new Array<ShapeSpec | undefined>(COLORS.length));

    let disposed = false, textIsMobile = L.mobile, textPositions: Float32Array | null = null;
    const setGlow = (i: number) => { if (i !== glowStage.current) { glowStage.current = i; glowColor.current(i); } };
    // Place the caption just under the lowest particle of the name
    const placeCaption = () => {
      if (!textPositions) return;
      const PL = layout(canvas.clientWidth, canvas.clientHeight, measure(canvas, contentRef.current)), { min } = yBounds(textPositions);
      const bottomWorld = PL.textY + min, h = canvas.clientHeight;
      setCaptionTop(((PL.visH / 2 - bottomWorld) / PL.visH) * h + (PL.mobile ? 26 : 34));
    };

    // Shapes are built when first needed: the intro cloud and name (or the formation on screen) straight away,
    // the others one at a time in idle time. `ensure` builds any the morph is about to draw that idle time hasn't reached.
    const spec = (i: number, positions: Float32Array): ShapeSpec => ({
      positions, colors: COLORS[i], offset: L.items[i].offset, scale: L.items[i].scale,
      spin: SPIN[i], sway: SWAY[i], flutter: i === 8 ? 1 : i === 0 ? 0.5 : 0, size: SIZE[i],
    });
    const make = (i: number) => { const gen = GENS[i]; if (gen && !field.hasShape(i)) field.setShape(i, spec(i, gen(count))); };
    const ensure = (m: number) => { const f = Math.max(0, Math.min(COLORS.length - 2, Math.floor(m))); make(f); make(f + 1); };
    const hasIdle = typeof window.requestIdleCallback === "function";
    let idleId = 0;
    const later = (cb: () => void) => (hasIdle ? window.requestIdleCallback(cb, { timeout: 1500 }) : window.setTimeout(cb, 60));
    const buildRest = (order: number[]) => {
      const next = () => {
        idleId = 0;
        if (disposed) return;
        const i = order.find(k => GENS[k] && !field.hasShape(k));
        if (i === undefined) return;
        make(i); idleId = later(next);
      };
      idleId = later(next);
    };

    // How far down the story you are: 0 at the hero, k at the top of step k, STEPS at the last step and beyond
    const storyPos = () => {
      readScroll();
      const y = pageY - wrapTop, tops = stepTops;
      if (tops.length < 2) return null;
      for (let k = 0; k < tops.length - 1; k++) if (y < tops[k + 1]) return k + Math.max(0, (y - tops[k]) / (tops[k + 1] - tops[k]));
      return STEPS;
    };
    // Phones: how far along the What We Do deck you have swiped, from 0 (first card) to STEPS - 1 (last card)
    const deckProgress = () => (deckEl ? (deckMax > 0 ? (deckLeft / deckMax) * (STEPS - 1) : 0) : null);
    const scrollTarget = () => {
      // Interpolate between the tops of the hero and each step, so shapes line up with cards at any height
      const s = storyPos();
      if (s === null) return HERO;
      const dp = deckProgress();
      if (dp !== null) {
        // Globe -> first formation as the deck section scrolls up, then the swipe picks the formation
        const x = Math.max(0, Math.min(1, (Math.min(1, s) - 0.3) / 0.4)), sm = x * x * (3 - 2 * x);
        return HERO + sm * (1 + dp);
      }
      const k = Math.min(Math.floor(s), STEPS - 1), f = s - k;
      const x = Math.max(0, Math.min(1, (f - 0.3) / 0.4)), sm = x * x * (3 - 2 * x);
      return HERO + Math.min(STEPS, s >= STEPS ? STEPS : k + sm);
    };

    // Intro timeline
    const form = FORM, hold = HOLD, minLoading = 700, releaseMs = 1500;
    let introStart = 0, releaseAt = 0, releaseFrom = TEXT, releaseDur = releaseMs, skipRequested = false;
    let introPhase: Phase = "off";
    const go = (p: Phase) => {
      introPhase = p; setPhase(p);
      document.body.dataset.intro = p === "off" ? "done" : p === "release" ? "leaving" : "on";
      lockPage(p === "loading" || p === "forming" || p === "hold");
    };
    const markSeen = () => { introPlayedThisLoad = true; };
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
      if (introPhase !== "off") field.wake();   // phones: the intro always runs at full rate
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
      ensure(field.morph);
      setGlow(Math.max(0, Math.min(GLOW.length - 1, Math.round(field.morph))));
    };

    // The rest of the formations, nearest to where the story starts first
    const restFrom = (m: number) => [2, 3, 4, 5, 6, 7, 8].sort((a, b) => Math.abs(a - m) - Math.abs(b - m));

    let loadTimer = 0, failsafeTimer = 0;
    if (playIntro) {
      go("loading");
      const t0 = performance.now();
      loadTimer = window.setInterval(() => setLoaded(v => Math.min(92, v + Math.max(1, Math.round((92 - v) * 0.12)))), 40);
      field.follow = false; field.morph = 0;
      // Failsafe: if building the name hangs or fails, drop the intro and show the page instead of a locked screen
      const abortIntro = () => {
        if (disposed || introPhase !== "loading") return;
        clearInterval(loadTimer); markSeen(); go("off");
        field.follow = true; field.interactive = true; field.morph = field.morphTarget = scrollTarget();
        ensure(field.morph); field.resize(); field.start();
        // The name never finished, so the idle build of the other formations never started: start it here
        buildRest(restFrom(field.morph));
      };
      failsafeTimer = window.setTimeout(abortIntro, INTRO_FAILSAFE);
      // Only the scattered cloud and the name are needed to start; the globe and the steps follow in idle time
      textShape(count, textLinesFor(L.mobile), L.textWidth).then(text => {
        if (disposed) return;
        textPositions = text; placeCaption();
        field.setShape(TEXT, spec(TEXT, text)); make(0);
        field.resize(); field.start();
        buildRest(restFrom(HERO));
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
      // No intro: the cloud and the name are never shown, so only the formation on screen is built now
      field.follow = true; field.morph = field.morphTarget = scrollTarget(); ensure(field.morph);
      field.resize();
      if (reduce) field.draw(); else field.start();
      buildRest(restFrom(field.morph));
    }

    // Pause when the story is off screen or the tab is hidden
    let inView = true;
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; if (reduce) { field.draw(); return; } if (e.isIntersecting) field.start(); else if (introPhase === "off") field.stop(); });
    io.observe(wrap);
    // Coming back to the tab only restarts the particles if the story is on screen (or the intro is still playing)
    const onVis = () => { if (document.hidden) field.stop(); else if (!reduce && (inView || introPhase !== "off")) field.start(); };
    document.addEventListener("visibilitychange", onVis);
    // Re-measure the steps whenever the page's layout changes size (fonts arriving, Read more, rotation)
    const ro = new ResizeObserver(() => measureSteps());
    ro.observe(document.body); ro.observe(wrap);
    if (contentRef.current) ro.observe(contentRef.current);

    const toNdc = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) return null;
      return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)] as const;
    };
    // Touch: drag sideways on the globe (the space above the hero text) to spin it; it coasts when you let go.
    // Vertical drags still scroll the page (the hero has touch-action: pan-y).
    let drag: { id: number; x: number; t: number; v: number } | null = null;
    const startDrag = (e: PointerEvent) => {
      if (introPhase !== "off" || !(e.target as HTMLElement).closest(".hero-stage")) return false;
      const copy = contentRef.current?.querySelector(".hero-copy");
      if (copy && e.clientY >= copy.getBoundingClientRect().top) return false;
      drag = { id: e.pointerId, x: e.clientX, t: e.timeStamp, v: 0 }; field.fling(0);
      return true;
    };
    const onMove = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) {
        const dx = e.clientX - drag.x, turn = dx * 0.009, dt = Math.max(8, e.timeStamp - drag.t) / 1000;
        field.spinBy(turn);
        drag.v = drag.v * 0.5 + (turn / dt) * 0.5; drag.x = e.clientX; drag.t = e.timeStamp;
      }
      const p = e.pointerType === "mouse" ? toNdc(e) : null; if (p) field.pointer(p[0], p[1]); else field.pointer(null);
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      // Only fling if the finger was still moving when it lifted; a cancelled touch (page scroll took over) just stops
      if (e.type === "pointerup" && e.timeStamp - drag.t < 90) field.fling(drag.v);
      drag = null;
    };
    const onLeave = () => field.pointer(null);
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest(INTERACTIVE) || (e.target as HTMLElement).closest(".reveal")) return;
      if (e.pointerType !== "mouse" && startDrag(e)) return;
      const p = toNdc(e); if (p) field.shock(p[0], p[1]);
    };
    // Which side the current step's card is on, so the reading shade (index.css) follows it: steps 1, 3, 5 left; 2, 4, 6 right
    let sideRaf = 0, side = "";
    const updateSide = () => {
      const s = storyPos();
      if (s === null) return;
      const k = Math.round(s) - 1;
      const next = k >= 0 && k % 2 === 1 ? "right" : "left";
      if (next !== side) { side = next; wrap.dataset.side = next; }
    };
    const onScrollFrame = () => {
      updateSide();
      // Reduced motion: no animation loop, so the formation is redrawn only when you scroll
      if (reduce) { field.morph = field.morphTarget = scrollTarget(); ensure(field.morph); field.draw(); }
    };
    // Only the page and the What We Do deck move the story; nothing is measured here (see readScroll)
    const onScroll = (e: Event) => {
      if (e.target !== document && (!deckEl || e.target !== deckEl)) return;
      scrolled = true;
      cancelAnimationFrame(sideRaf); sideRaf = requestAnimationFrame(onScrollFrame);
    };
    updateSide();
    let rt = 0, lastW = canvas.clientWidth, lastH = canvas.clientHeight, lastSide = isSideLayout();
    const onResize = () => {
      clearTimeout(rt);
      rt = window.setTimeout(async () => {
        measureSteps();
        const w = canvas.clientWidth, h = canvas.clientHeight, sideNow = isSideLayout();
        // A phone's address bar showing or hiding fires resize, but the 100svh canvas and the layout stay the same
        if (w === lastW && h === lastH && sideNow === lastSide) { updateSide(); return; }
        lastW = w; lastH = h; lastSide = sideNow;
        L = layout(w, h, measure(canvas, contentRef.current));
        field.setLayout(L.items);
        if (L.mobile !== textIsMobile && field.hasShape(TEXT)) {
          textIsMobile = L.mobile;
          textPositions = await textShape(count, textLinesFor(L.mobile), L.textWidth);
          if (disposed) return;
          field.replaceShape(TEXT, textPositions);
        }
        placeCaption(); field.resize(); updateSide();
      }, 150);
    };
    if (!reduce) {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
      window.addEventListener("pointerup", onUp); window.addEventListener("pointercancel", onUp);
      document.addEventListener("pointerleave", onLeave);
    }
    // Capture on the document so the deck's sideways scroll is heard too (element scroll events don't bubble)
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onResize);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") skipRef.current(); };
    window.addEventListener("keydown", onKey);

    return () => {
      disposed = true; clearInterval(loadTimer); clearTimeout(failsafeTimer); clearTimeout(rt); cancelAnimationFrame(sideRaf); io.disconnect(); ro.disconnect();
      if (idleId) { if (hasIdle) window.cancelIdleCallback(idleId); else clearTimeout(idleId); }
      field.dispose();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerdown", onDown); document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("scroll", onScroll, { capture: true }); window.removeEventListener("resize", onResize); window.removeEventListener("keydown", onKey);
      done();
    };
  }, []);

  const introVisible = phase !== "off";
  return (
    // Pulled up under the navbar so the scene fills the whole screen
    <div ref={wrapRef} className="relative -mt-[69px]">
      <div className="sticky top-0 h-[100svh] overflow-hidden" aria-hidden="true">
        {phoneGlow ? (
          <>
            {/* Phones: a gradient instead of a blur filter (see blurGradient); -inset-[360px] is GLOW_PAD. Colour and gradient are set in the layout effect. */}
            <div className="glow-a absolute h-[60vh] w-[60vh] transition-[right,top] duration-1000">
              <div ref={glowA} className="absolute -inset-[360px] opacity-40" style={{ transition: GLOW_EASE }} />
            </div>
            <div className="glow-b absolute h-[50vh] w-[50vh] transition-[right,bottom] duration-1000">
              <div ref={glowB} className="absolute -inset-[360px] opacity-30" style={{ transition: GLOW_EASE }} />
            </div>
          </>
        ) : (
          <>
            <div ref={glowA} className="glow-a absolute h-[60vh] w-[60vh] rounded-full opacity-40 blur-[120px] transition-[background-color,right,top] duration-1000" style={{ backgroundColor: GLOW[HERO][0] }} />
            <div ref={glowB} className="glow-b absolute h-[50vh] w-[50vh] rounded-full opacity-30 blur-[120px] transition-[background-color,right,bottom] duration-1000" style={{ backgroundColor: GLOW[HERO][1] }} />
          </>
        )}
        {webgl && <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />}
        <div className="story-shade pointer-events-none absolute inset-0 transition-opacity duration-1000" />
        <div className="story-shade story-shade-right pointer-events-none absolute inset-0 transition-opacity duration-1000" />
      </div>

      <div ref={contentRef} className="relative -mt-[100svh]">
        <div className="hero-stage relative flex min-h-[100svh] touch-pan-y touch-pinch-zoom pt-[68px]">{hero}</div>
        {phone && deck
          ? <div className="story-step story-deck relative flex">{deck}</div>
          : steps.map((s, i) => <div key={i} className="story-step relative flex">{s}</div>)}
      </div>

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
