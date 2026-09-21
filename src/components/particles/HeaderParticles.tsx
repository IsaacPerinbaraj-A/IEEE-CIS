import { useEffect, useRef } from "react";
import { ParticleField, type ShapeSpec } from "./engine";
import { chaos, sphere, neural, fuzzy, helix, swarm, rings, constellation, ripple } from "./shapes";
import { sessions } from "../../lib/data";
import { BOUNDS, fitShape, type Region } from "./layout";
import { deviceTier } from "../../lib/device";

export type HeaderShape = "sphere" | "neural" | "fuzzy" | "helix" | "swarm" | "chaos" | "rings" | "constellation" | "ripple";

const teamSizes = sessions[0].groups.map(g => g.members.length);

const PRESETS: Record<HeaderShape, { gen: (n: number) => Float32Array; colors: [string, string]; spin: number; sway: number; flutter: number; size: number }> = {
  sphere: { gen: sphere, colors: ["#22D3EE", "#A855F7"], spin: 1, sway: 0, flutter: 0, size: 1 },
  neural: { gen: neural, colors: ["#8B5CF6", "#22D3EE"], spin: 0, sway: 1, flutter: 0, size: 1.15 },
  fuzzy: { gen: fuzzy, colors: ["#F472B6", "#A78BFA"], spin: 1, sway: 0, flutter: 0, size: 1.05 },
  helix: { gen: helix, colors: ["#F2B544", "#EC4899"], spin: 1, sway: 0, flutter: 0, size: 1.15 },
  swarm: { gen: swarm, colors: ["#22D3EE", "#F2B544"], spin: 1, sway: 0, flutter: 1, size: 1.25 },
  rings: { gen: rings, colors: ["#8B5CF6", "#22D3EE"], spin: 1, sway: 0, flutter: 0, size: 1.1 },
  constellation: { gen: (n: number) => constellation(n, teamSizes), colors: ["#F472B6", "#A78BFA"], spin: 0.6, sway: 0.5, flutter: 0, size: 1.15 },
  ripple: { gen: ripple, colors: ["#22D3EE", "#8B5CF6"], spin: 0, sway: 0.8, flutter: 0, size: 1.15 },
  chaos: { gen: (n: number) => chaos(n).map(v => v * 0.55), colors: ["#8B5CF6", "#EC4899"], spin: 0.6, sway: 0, flutter: 0.6, size: 1.3 },
};
const INTERACTIVE = "a,button,input,select,textarea,label,[role=button]";

/** A single 3D particle formation for a page header: it assembles on load, spins, and reacts to the cursor. */
export default function HeaderParticles({ shape }: { shape: HeaderShape }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!, host = canvas.parentElement!;
    if (!ParticleField.supported()) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Fit the formation into the free space beside the title (desktop) or the top-right corner (phones, tablets)
    const layout = () => {
      const w = canvas.clientWidth, h = Math.max(1, canvas.clientHeight), mobile = w < 760;
      const c = canvas.getBoundingClientRect(), wrapEl = host.querySelector<HTMLElement>(".wrap"), titleEl = host.querySelector<HTMLElement>(".page-title");
      const pad = wrapEl ? parseFloat(getComputedStyle(wrapEl).paddingLeft) || 20 : 20, wr = wrapEl?.getBoundingClientRect();
      const cR = wr ? wr.right - c.left - pad : w - 20, titleR = titleEl ? titleEl.getBoundingClientRect().right - c.left : w * 0.55;
      const side = w >= 1024 && cR - titleR > 260;
      // Phones: the compact header is short, so the shape uses the full height of its right side (behind the fade)
      const region: Region = side ? { x0: titleR + 48, x1: Math.min(w - 24, cR + Math.max(0, w - cR) * 0.5), y0: 18, y1: h - 18 }
        : w < 640 ? { x0: w * 0.45, x1: w - 8, y0: 8, y1: h - 8 } : { x0: w * 0.5, x1: w - 10, y0: 10, y1: h * 0.58 };
      const place = fitShape(BOUNDS[shape] ?? BOUNDS.sphere, region, w, h, 0.95);
      return { offset: place.offset, scale: place.scale, mobile };
    };
    const tier = deviceTier();
    const L = layout(), P = PRESETS[shape], count = tier === "low" ? (L.mobile ? 900 : 1800) : (L.mobile ? 1500 : 3000);
    let field: ParticleField;
    try { field = new ParticleField(canvas, count, { highPerformance: tier === "high", maxDpr: tier === "low" ? 1 : undefined }); } catch { return; }
    field.motion = reduce ? 0 : 1;
    const start: ShapeSpec = { positions: chaos(count), colors: ["#8B5CF6", "#EC4899"], offset: [0, 0, 0], scale: L.mobile ? 0.7 : 1.4, spin: 0.3, sway: 0, flutter: 0.5, size: 1.3 };
    const target: ShapeSpec = { positions: P.gen(count), colors: P.colors, offset: L.offset, scale: L.scale, spin: P.spin, sway: P.sway, flutter: P.flutter, size: P.size };
    field.setShapes([start, target]); field.follow = false; field.resize();

    // Assemble from a scattered cloud when the page opens
    const t0 = performance.now(), DUR = 1800;
    field.morph = reduce ? 1 : 0;
    field.onFrame = () => { if (field.morph < 1) { const e = Math.min(1, (performance.now() - t0) / DUR); field.morph = 1 - Math.pow(1 - e, 3); } };
    if (reduce) field.draw(); else field.start();

    let inView = true;
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; if (reduce) return; if (e.isIntersecting) field.start(); else field.stop(); });
    io.observe(host);
    const toNdc = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
      return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)] as const;
    };
    const onMove = (e: PointerEvent) => { const p = e.pointerType === "mouse" ? toNdc(e) : null; if (p) field.pointer(p[0], p[1]); else field.pointer(null); };
    const onDown = (e: PointerEvent) => { if ((e.target as HTMLElement).closest(INTERACTIVE)) return; const p = toNdc(e); if (p) field.shock(p[0], p[1]); };
    let rt = 0;
    const onResize = () => { clearTimeout(rt); rt = window.setTimeout(() => { const l = layout(); field.setLayout([{ offset: [0, 0, 0], scale: l.mobile ? 0.7 : 1.4 }, l]); field.resize(); }, 150); };
    // Coming back to the tab only restarts the particles if the header is actually on screen
    const onVis = () => { if (document.hidden) field.stop(); else if (!reduce && inView) field.start(); };
    if (!reduce) { window.addEventListener("pointermove", onMove, { passive: true }); window.addEventListener("pointerdown", onDown, { passive: true }); }
    window.addEventListener("resize", onResize); document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect(); field.dispose();
      window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", onResize); document.removeEventListener("visibilitychange", onVis);
    };
  }, [shape]);

  return <canvas ref={ref} aria-hidden="true" className="absolute inset-0 h-full w-full" />;
}
