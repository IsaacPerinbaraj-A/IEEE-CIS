import { Fragment, useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Sets data-shown="1" on the element once it scrolls into view (straight away for reduced motion). */
function useShowOnScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current!;
    if (reduced()) { el.dataset.shown = "1"; return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.dataset.shown = "1"; io.disconnect(); } }, { rootMargin: "0px 0px -12% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
}

/** Fades, lifts and un-blurs its content when it scrolls into view. */
export function Reveal({ children, delay = 0, className = "", as: Tag = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "section" | "li" }) {
  const ref = useRef<HTMLElement>(null);
  useShowOnScroll(ref);
  return <Tag ref={ref as never} className={`reveal ${className}`} style={{ "--d": `${delay}ms` } as CSSProperties}>{children}</Tag>;
}

/**
 * A heading whose words rise one after another out of a mask when it scrolls into view
 * (idea from the second version's word reveal). Screen readers get the plain text once.
 */
export function RevealWords({ text, as: Tag = "h2", className = "", delay = 0 }: { text: string; as?: "h1" | "h2"; className?: string; delay?: number }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useShowOnScroll(ref);
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <Tag ref={ref} className={`words ${className}`} style={{ "--d": `${delay}ms` } as CSSProperties}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((w, i) => (
          <Fragment key={i}>{i > 0 && " "}<span className="word"><span style={{ "--w": i } as CSSProperties}>{w}</span></span></Fragment>
        ))}
      </span>
    </Tag>
  );
}

/**
 * Pulls a button a few pixels toward the pointer while it's hovered (idea from the second version's
 * magnetic buttons). Mouse and trackpad only; still for touch screens and reduced motion.
 */
export function Magnetic({ children, className = "", strength = 6 }: { children: ReactNode; className?: string; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current!;
    if (reduced() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--mx", `${(x * strength * 2).toFixed(2)}px`); el.style.setProperty("--my", `${(y * strength * 2).toFixed(2)}px`); el.dataset.active = "1";
      });
    };
    const leave = () => { cancelAnimationFrame(raf); el.style.setProperty("--mx", "0px"); el.style.setProperty("--my", "0px"); el.dataset.active = "0"; };
    el.addEventListener("pointermove", move); el.addEventListener("pointerleave", leave);
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); cancelAnimationFrame(raf); };
  }, [strength]);
  return <span ref={ref} className={`magnetic ${className}`}>{children}</span>;
}

/** Button text that rolls up and is replaced by a copy rolling in from below when the button is hovered or focused. */
export function RollLabel({ children }: { children: string }) {
  return <span className="roll"><span className="roll-a">{children}</span><span className="roll-b" aria-hidden>{children}</span></span>;
}

/** Tilts toward the pointer in 3D with a moving highlight. Only on devices with a precise pointer. */
export function Tilt({ children, className = "", max = 9 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    if (reduced() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--rx", `${(0.5 - y) * max}deg`); el.style.setProperty("--ry", `${(x - 0.5) * max * 1.2}deg`);
        el.style.setProperty("--gx", `${x * 100}%`); el.style.setProperty("--gy", `${y * 100}%`); el.dataset.active = "1";
      });
    };
    const leave = () => { cancelAnimationFrame(raf); el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); el.dataset.active = "0"; };
    el.addEventListener("pointermove", move); el.addEventListener("pointerleave", leave);
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); cancelAnimationFrame(raf); };
  }, [max]);
  return <div ref={ref} className={`tilt ${className}`}>{children}<span aria-hidden className="tilt-glare" /></div>;
}

/** A band of large words that scrolls sideways, speeding up (and reversing) with page scroll. */
export function Marquee({ items }: { items: string[] }) {
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = track.current!;
    if (reduced()) return;
    const anim = el.animate([{ transform: "translateX(0)" }, { transform: "translateX(-50%)" }], { duration: 38000, iterations: Infinity });
    let lastY = window.scrollY, rate = 1, target = 1, raf = 0, dir = 1;
    const loop = () => {
      rate += (target - rate) * 0.08; target += (dir - target) * 0.04;
      anim.playbackRate = rate; raf = requestAnimationFrame(loop);
    };
    const onScroll = () => {
      const dy = window.scrollY - lastY; lastY = window.scrollY;
      if (dy !== 0) dir = dy > 0 ? 1 : -1;
      target = dir * Math.min(9, 1 + Math.abs(dy) * 0.35);
    };
    // Only move (and run the speed loop) while the band is on screen
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { anim.play(); if (!raf) raf = requestAnimationFrame(loop); }
      else { anim.pause(); cancelAnimationFrame(raf); raf = 0; }
    });
    io.observe(el);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { io.disconnect(); anim.cancel(); cancelAnimationFrame(raf); window.removeEventListener("scroll", onScroll); };
  }, []);
  const row = items.flatMap((t, i) => [
    <span key={`t${i}`} className={i % 2 ? "marquee-outline" : "marquee-fill"}>{t}</span>,
    <span key={`d${i}`} aria-hidden className="mx-8 inline-block h-4 w-4 rounded-full border-[3px] border-gold align-middle sm:mx-12" />,
  ]);
  return (
    <div className="relative overflow-hidden border-y border-line py-8 sm:py-10" aria-label={items.join(", ")} role="img">
      <div ref={track} className="flex w-max whitespace-nowrap font-display text-[clamp(2.4rem,7vw,5.5rem)] font-semibold leading-none tracking-[-0.03em]">
        <div className="flex items-center pr-8 sm:pr-12">{row}</div>
        <div className="flex items-center pr-8 sm:pr-12" aria-hidden>{row}</div>
      </div>
    </div>
  );
}

/** Sets data-play="1" only while on screen, so looping CSS animations on it (and inside it) can pause when scrolled away. */
export function PlayWhenVisible({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const io = new IntersectionObserver(([e]) => { el.dataset.play = e.isIntersecting ? "1" : "0"; });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}

/** Thin gradient bar along the top showing how far down the page you are. */
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (ref.current) ref.current.style.transform = `scaleX(${h > 0 ? window.scrollY / h : 0})`;
    };
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true }); window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(raf); };
  }, []);
  return <div ref={ref} aria-hidden className="scroll-progress fixed inset-x-0 top-0 z-[60] h-[3px] origin-left scale-x-0 bg-gradient-to-r from-violet via-[#EC4899] to-gold" />;
}

type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string };
const SPARK_COLORS = ["#C4B5FD", "#F472B6", "#F2B544", "#22D3EE", "#A78BFA"];
const INTRO_COLORS = ["#F2B544", "#FDE68A", "#F4EFE4", "#C4B5FD"];

/**
 * Custom cursor for mouse users: a gold dot, a ring that trails behind, and a stardust trail.
 * The ring grows over anything clickable, shows a label over elements with data-cursor="...",
 * and every click bursts into sparks. During the intro it becomes a golden halo with a longer tail.
 */
export function CursorAura() {
  const ring = useRef<HTMLDivElement>(null), dot = useRef<HTMLDivElement>(null), label = useRef<HTMLElement>(null), trail = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (reduced() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const r = ring.current!, d = dot.current!, c = trail.current!, ctx = c.getContext("2d")!, html = document.documentElement;
    let x = -100, y = -100, rx = -100, ry = -100, lx = 0, ly = 0, raf = 0, visible = false, last = performance.now(), dpr = 1;
    const sparks: Spark[] = [];
    const intro = () => document.body.dataset.intro === "on";

    const size = () => { dpr = Math.min(window.devicePixelRatio || 1, 2); c.width = innerWidth * dpr; c.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    const emit = (px: number, py: number, vx: number, vy: number, big = false) => {
      const cols = intro() ? INTRO_COLORS : SPARK_COLORS, max = (big || intro() ? 1.1 : 0.65) + Math.random() * 0.6;
      sparks.push({ x: px, y: py, vx, vy, life: max, max, size: (intro() ? 1.4 : 1) * (0.9 + Math.random() * 1.8), color: cols[Math.floor(Math.random() * cols.length)] });
      if (sparks.length > 420) sparks.shift();
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      rx += (x - rx) * 0.2; ry += (y - ry) * 0.2;
      r.style.transform = `translate3d(${rx}px, ${ry}px, 0)`; d.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      if (sparks.length) {
        ctx.globalCompositeOperation = "lighter";
        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i];
          s.life -= dt; if (s.life <= 0) { sparks.splice(i, 1); continue; }
          s.vx *= 0.94; s.vy = s.vy * 0.94 - 0.015; s.x += s.vx; s.y += s.vy;
          const a = s.life / s.max;
          ctx.globalAlpha = a * 0.22; ctx.fillStyle = s.color;
          ctx.beginPath(); ctx.arc(s.x, s.y, s.size * 3.2, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(s.x, s.y, s.size * a + 0.3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      }
      // Stop when nothing is moving (ring caught up, no sparks left); the next pointer move or click restarts it
      if (!sparks.length && Math.abs(x - rx) + Math.abs(y - ry) < 0.3) { raf = 0; return; }
      raf = requestAnimationFrame(loop);
    };
    const wake = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } };

    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x = e.clientX; y = e.clientY; wake();
      if (!visible) { visible = true; rx = lx = x; ry = ly = y; html.dataset.aura = "on"; }
      const t = e.target as HTMLElement, labelled = t.closest<HTMLElement>("[data-cursor]");
      const hover = t.closest("input,textarea,[contenteditable]") ? "text" : labelled ? "label" : t.closest("a,button,select,[role=button],[role=tab],label,summary") ? "link" : "";
      html.dataset.auraHover = hover;
      if (label.current) label.current.textContent = labelled?.dataset.cursor || "";
      // Stardust: one spark every few pixels of travel, more during the intro
      const dist = Math.hypot(x - lx, y - ly), step = intro() ? 5 : 9;
      if (hover !== "text" && dist > step) {
        const n = Math.min(intro() ? 6 : 3, Math.floor(dist / step)), mx = (x - lx) / dist, my = (y - ly) / dist;
        for (let i = 0; i < n; i++) {
          const k = i / n;
          emit(lx + (x - lx) * k, ly + (y - ly) * k, -mx * 0.6 + (Math.random() - 0.5) * 0.9, -my * 0.6 + (Math.random() - 0.5) * 0.9);
        }
        lx = x; ly = y;
      }
    };
    const out = () => { visible = false; html.dataset.aura = ""; };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      html.dataset.auraPress = "1"; wake();
      for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2 + Math.random() * 0.3, v = 2 + Math.random() * 3.5; emit(e.clientX, e.clientY, Math.cos(a) * v, Math.sin(a) * v, true); }
    };
    const up = () => { html.dataset.auraPress = ""; };

    size();
    raf = requestAnimationFrame(loop);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("resize", size);
    document.addEventListener("pointerleave", out);
    return () => {
      cancelAnimationFrame(raf); html.dataset.aura = ""; html.dataset.auraHover = "";
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerdown", down); window.removeEventListener("pointerup", up);
      window.removeEventListener("resize", size); document.removeEventListener("pointerleave", out);
    };
  }, []);
  return (
    <>
      <canvas ref={trail} aria-hidden className="pointer-events-none fixed inset-0 z-[89] h-full w-full" />
      <div ref={ring} aria-hidden className="cursor-ring pointer-events-none fixed left-0 top-0 z-[90]"><span /><b ref={label} /></div>
      <div ref={dot} aria-hidden className="cursor-dot pointer-events-none fixed left-0 top-0 z-[90]"><span /></div>
    </>
  );
}

/** Floating button that appears after scrolling, with a ring showing how far down you are. */
export function BackToTop() {
  const btn = useRef<HTMLButtonElement>(null), ring = useRef<SVGCircleElement>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight, p = h > 0 ? window.scrollY / h : 0;
      if (ring.current) ring.current.style.strokeDashoffset = String(100 - p * 100);
      if (btn.current) btn.current.dataset.show = window.scrollY > 600 ? "1" : "0";
    };
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true }); window.addEventListener("resize", onScroll);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, []);
  return (
    <button ref={btn} data-show="0" aria-label="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" })}
      className="back-to-top group fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full border border-line bg-panel/80 text-cream shadow-[0_10px_40px_-10px_rgba(139,92,246,.7)] backdrop-blur-md sm:bottom-7 sm:right-7">
      <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
        <defs><linearGradient id="btt" x1="0" x2="1"><stop offset="0" stopColor="#8B5CF6" /><stop offset=".55" stopColor="#EC4899" /><stop offset="1" stopColor="#F2B544" /></linearGradient></defs>
        <circle cx="18" cy="18" r="16.5" fill="none" stroke="url(#btt)" strokeWidth="2" strokeLinecap="round" pathLength={100} strokeDasharray="100" ref={ring} />
      </svg>
      <svg viewBox="0 0 24 24" className="relative h-5 w-5 transition-transform duration-300 group-hover:-translate-y-0.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 19V5M5 12l7-7 7 7" /></svg>
    </button>
  );
}
