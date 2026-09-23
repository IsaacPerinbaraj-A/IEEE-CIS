/**
 * A tiny WebGL particle engine (no three.js). Thousands of glowing points morph between
 * pre-computed 3D shapes. Each frame draws one transition: shape `from` -> shape `to`.
 */
import { PHONE } from "../../lib/useMediaQuery";

export type ShapeSpec = {
  positions: Float32Array;          // xyz per particle, centred on the origin
  colors: [string, string];         // gradient bottom -> top
  offset: [number, number, number]; // where the shape sits on screen (world units)
  scale: number;
  spin: number;                     // 0 keeps the shape facing the camera (used for text)
  flutter: number;                  // how much particles wander on their own (swarm)
  size: number;                     // point size multiplier
  sway: number;                     // gentle side-to-side motion for shapes that face the camera
};

export type FieldOptions = {
  /** Asks for the fast GPU (only worth it on strong devices; it can wake a laptop's discrete GPU). */
  highPerformance?: boolean;
  /** Caps the pixel ratio, e.g. 1 on low-power devices. */
  maxDpr?: number;
  /** Base point size in CSS pixels. Default: 2.3 on canvases under 760px wide, 2.6 on wider ones. */
  pointSize?: number;
  /**
   * Phone mode: a lighter mid-morph burst and swarm flutter, about 30 fps once nothing has moved for a second,
   * and one pixel-ratio step down if frames stay slow. Default: on below 640px (the same query as Tailwind's `max-sm:`).
   */
  phone?: boolean;
};

const VERT = `
attribute vec3 aFrom; attribute vec3 aTo; attribute float aRand;
uniform float uT, uTime, uSize, uPR, uFlutter, uMotion, uAspect, uMouseOn, uShockT, uBurst;
uniform mat4 uProj, uRot;
uniform vec2 uMouse, uShockPos;
uniform vec3 uOffFrom, uOffTo, uFromA, uFromB, uToA, uToB;
uniform float uScaleFrom, uScaleTo, uSizeMul;
varying vec3 vColor; varying float vAlpha;
void main() {
  float r = aRand;
  float d = r * 0.35;
  float t = smoothstep(d, d + 0.65, uT);
  vec3 a = aFrom * uScaleFrom, b = aTo * uScaleTo;
  vec3 p = mix(a, b, t);
  float mid = sin(t * 3.14159);
  p += normalize(p + vec3(0.0001)) * mid * (0.45 + r * 0.6) * uMotion * uBurst;  // burst outwards mid-morph
  float w = (0.012 + uFlutter * 0.16) * uMotion;
  p += vec3(sin(uTime * (0.7 + r) + r * 40.0), cos(uTime * (0.6 + r * 0.8) + r * 20.0), sin(uTime * (0.8 + r * 0.5) + r * 10.0)) * w;
  vec4 world = uRot * vec4(p, 1.0);
  world.xyz += mix(uOffFrom, uOffTo, t);
  world.z -= 6.0;
  vec4 clip = uProj * world;
  vec2 ndc = clip.xy / clip.w;
  vec2 dm = (ndc - uMouse) * vec2(uAspect, 1.0);
  float dist = length(dm);
  float near = 1.0 - smoothstep(0.0, 0.45, dist);
  float push = uMouseOn * near * near;                                             // soft, wide falloff: no hard edge
  vec2 dir = dist > 0.0001 ? dm / dist : vec2(0.0);
  ndc += dir * 0.035 * push * vec2(1.0 / uAspect, 1.0);                             // gentle drift away from the cursor, no swirl
  float wave = 0.0;
  if (uShockT >= 0.0) {                                                          // click: an expanding ring pushes particles outwards
    vec2 ds = (ndc - uShockPos) * vec2(uAspect, 1.0);
    float sd = length(ds), R = uShockT * 1.9;
    float q = (sd - R) / 0.09;
    wave = exp(-q * q) * (1.0 - smoothstep(0.0, 1.3, uShockT));
    ndc += (sd > 0.0001 ? ds / sd : vec2(0.0)) * wave * 0.07 * vec2(1.0 / uAspect, 1.0);
  }
  clip.xy = ndc * clip.w;
  gl_Position = clip;
  float depth = max(-world.z, 0.6);
  gl_PointSize = uSize * uSizeMul * uPR * (0.8 + r * 1.3) * (6.0 / depth) * (1.0 + push * 0.2 + wave * 1.8);
  float gf = clamp(aFrom.y * 0.3 + 0.5, 0.0, 1.0), gt = clamp(aTo.y * 0.3 + 0.5, 0.0, 1.0);
  vColor = mix(mix(uFromA, uFromB, gf), mix(uToA, uToB, gt), t);
  if (r > 0.965) vColor = vec3(0.95, 0.71, 0.27);                                  // gold sparks
  vColor += push * 0.12 + wave * vec3(0.9, 0.75, 1.0);
  vColor = mix(vColor, vec3(1.0, 0.8, 0.45), wave * 0.8);                       // the wave glows gold
  vAlpha = (0.5 + r * 0.5) * smoothstep(13.0, 3.5, depth);
}`;

const FRAG = `
precision mediump float;
varying vec3 vColor; varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.0, 0.5, d);
  a = a * a * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}`;

const UNIFORMS = ["uT", "uTime", "uSize", "uPR", "uFlutter", "uMotion", "uAspect", "uMouseOn", "uProj", "uRot", "uMouse", "uOffFrom", "uOffTo",
  "uFromA", "uFromB", "uToA", "uToB", "uScaleFrom", "uScaleTo", "uSizeMul", "uShockT", "uShockPos", "uBurst"] as const;

/** Phones: how much of the mid-morph burst and of the swarm's wander is kept. */
const PHONE_CALM = 0.55;
/** Phones: after this long with nothing moving (no morph, drag, fling, cursor, scroll or touch), draw at about 30 fps. */
const IDLE_AFTER = 1000;
const IDLE_FRAME = 1000 / 30 - 8;   // the slack keeps it near 30 fps on 60, 90 and 120 Hz screens
/** Phones: if full-rate frames average more than SLOW_FRAME ms over SLOW_WINDOW ms, lower the pixel ratio one step (once). */
const SLOW_FRAME = 24, SLOW_WINDOW = 2000, WARM_UP = 1000;
const DPR_STEPS = [2, 1.75, 1.5, 1.25, 1];

/** Parsed "#rrggbb" colours, shared by every field, so nothing is parsed or allocated per frame. */
const rgbCache = new Map<string, Float32Array>();
function rgb(h: string) {
  let c = rgbCache.get(h);
  if (!c) { const n = parseInt(h.slice(1), 16); c = new Float32Array([(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]); rgbCache.set(h, c); }
  return c;
}

function perspective(out: Float32Array, fovy: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect; out[5] = f; out[10] = (far + near) * nf; out[11] = -1; out[14] = 2 * far * near * nf;
  return out;
}
function rotation(out: Float32Array, ax: number, ay: number) {
  const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
  // R = Rx(ax) * Ry(ay), column-major
  out[0] = cy; out[1] = sx * sy; out[2] = -cx * sy; out[3] = 0;
  out[4] = 0; out[5] = cx; out[6] = sx; out[7] = 0;
  out[8] = sy; out[9] = -sx * cy; out[10] = cx * cy; out[11] = 0;
  out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
  return out;
}

/** WebGL support is probed once; the probe's context is released straight away instead of waiting for garbage collection. */
let webglOk: boolean | undefined;

export class ParticleField {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private shaders: WebGLShader[] = [];
  private buffers: (WebGLBuffer | undefined)[] = [];
  private randBuf: WebGLBuffer;
  private loc: Record<string, number> = {};
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private shapes: (ShapeSpec | undefined)[] = [];
  private raf = 0;
  private last = 0;
  private time = 0;
  private angleY = 0;
  private spinVel = 0;   // extra turn speed after a touch fling, in radians per second
  private tilt = { x: 0, y: 0 };
  private tiltTarget = { x: 0, y: 0 };
  private mouse = { x: 0, y: 0, on: 0, target: 0 };
  private running = false;
  private shockAt = -1;
  private shockPos = { x: 0, y: 0 };
  // Reused every frame instead of allocating new matrices
  private proj = new Float32Array(16);
  private rot = new Float32Array(16);
  // Values that only change on resize are uploaded once, not every frame
  private staticDirty = true;
  private cssW = 0;
  private boundFrom = -1;
  private boundTo = -1;
  // Phone frame pacing
  private phone = false;
  private lastActive = 0;
  private settling = false;
  private dprLimit = Infinity;
  private dprDropped = false;
  private slowStart = 0;
  private slowSum = 0;
  private slowN = 0;
  private warmUntil = 0;
  private ro?: ResizeObserver;
  private listening = false;
  /** When false the particles ignore the pointer (used during the intro). */
  interactive = true;
  readonly count: number;
  morph = 0;          // current position along the shape list (float)
  morphTarget = 0;    // eased towards when `follow` is true
  follow = true;
  motion = 1;         // 0 for reduced motion
  onFrame?: () => void;

  static supported() {
    if (webglOk !== undefined) return webglOk;
    try {
      const c = document.createElement("canvas");
      const gl = (c.getContext("webgl") || c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
      webglOk = !!gl;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch { webglOk = false; }
    return webglOk;
  }

  private canvas: HTMLCanvasElement;
  private maxDpr?: number;
  private pointSize?: number;
  private phoneOpt?: boolean;

  constructor(canvas: HTMLCanvasElement, count: number, opts: FieldOptions = {}) {
    this.canvas = canvas;
    this.maxDpr = opts.maxDpr;
    this.pointSize = opts.pointSize;
    this.phoneOpt = opts.phone;
    this.phone = this.detectPhone();
    const gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: opts.highPerformance ? "high-performance" : "default" });
    if (!gl || gl.isContextLost()) throw new Error("WebGL not available");
    this.gl = gl; this.count = count;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
      this.shaders.push(s); return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog); gl.useProgram(prog); this.prog = prog;
    ["aFrom", "aTo", "aRand"].forEach(n => (this.loc[n] = gl.getAttribLocation(prog, n)));
    UNIFORMS.forEach(n => (this.uni[n] = gl.getUniformLocation(prog, n)));
    const rand = new Float32Array(count); for (let i = 0; i < count; i++) rand[i] = Math.random();
    this.randBuf = gl.createBuffer()!;
    this.attr(this.randBuf, this.loc.aRand, 1);   // never changes, so it is bound once
    gl.bufferData(gl.ARRAY_BUFFER, rand, gl.STATIC_DRAW);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.disable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
    // The canvas can change CSS size without a window resize (e.g. a scrollbar appearing); keep the pixel-ratio uniform right
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => { const w = this.canvas.clientWidth; if (w !== this.cssW) { this.cssW = w; this.staticDirty = true; } });
      this.ro.observe(canvas);
    }
    this.cssW = canvas.clientWidth;
  }

  private detectPhone() {
    return this.phoneOpt ?? (typeof window !== "undefined" && window.matchMedia(PHONE).matches);
  }

  private attr(buf: WebGLBuffer, loc: number, size: number) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }

  /** Sets every shape at once. Entries may be left empty and filled later with `setShape` (e.g. built in idle time). */
  setShapes(shapes: (ShapeSpec | undefined)[]) {
    const gl = this.gl;
    for (let i = 0; i < shapes.length; i++) {
      const s = shapes[i];
      if (!s) continue;
      if (!this.buffers[i]) this.buffers[i] = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[i]!); gl.bufferData(gl.ARRAY_BUFFER, s.positions, gl.STATIC_DRAW);
    }
    this.shapes = shapes;
    this.boundFrom = this.boundTo = -1;
  }
  /** Adds or replaces one shape (its positions are uploaded now). */
  setShape(i: number, s: ShapeSpec) {
    const gl = this.gl;
    if (!this.buffers[i]) this.buffers[i] = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[i]!); gl.bufferData(gl.ARRAY_BUFFER, s.positions, gl.STATIC_DRAW);
    this.shapes[i] = s;
  }
  hasShape(i: number) { return !!this.shapes[i]; }
  get shapeCount() { return this.shapes.length; }
  /** Update where shapes sit and how big they are (after a resize) without re-uploading positions. */
  setLayout(layout: { offset: [number, number, number]; scale: number }[]) {
    layout.forEach((l, i) => { const s = this.shapes[i]; if (s) { s.offset = l.offset; s.scale = l.scale; } });
  }
  replaceShape(i: number, positions: Float32Array) {
    const gl = this.gl, s = this.shapes[i], buf = this.buffers[i];
    if (!s || !buf) return;
    s.positions = positions;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  }

  /** Keeps the full frame rate for at least another second (phones otherwise drop to about 30 fps when nothing moves). */
  wake() { this.lastActive = performance.now(); }
  private onInput = () => { this.lastActive = performance.now(); };

  pointer(nx: number | null, ny = 0) {
    if (nx === null || !this.interactive) { this.mouse.target = 0; this.tiltTarget.x = 0; this.tiltTarget.y = 0; return; }
    this.mouse.x = nx; this.mouse.y = ny; this.mouse.target = 1;
    this.tiltTarget.x = -ny * 0.35; this.tiltTarget.y = nx * 0.5;
    this.wake();
  }

  /** Turns the current shape by `radians` (touch drag) and stops any coasting. */
  spinBy(radians: number) {
    if (!this.interactive || !this.motion) return;
    this.angleY += radians; this.spinVel = 0; this.wake();
  }
  /** Lets go of a drag: the shape keeps turning at `velocity` (radians per second) and slows back to its normal spin. */
  fling(velocity: number) {
    if (!this.interactive || !this.motion) return;
    this.spinVel = Math.max(-6, Math.min(6, velocity)); this.wake();
  }

  /** Sends a shockwave ring out from a point (normalised device coordinates). */
  shock(nx: number, ny: number) {
    if (!this.interactive || !this.motion) return;
    this.shockPos.x = nx; this.shockPos.y = ny; this.shockAt = this.time; this.wake();
  }

  /** Matches the drawing buffer to the canvas's size. Does nothing costly when the size and pixel ratio are unchanged (a phone's address bar showing or hiding). */
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.phone = this.detectPhone();
    this.cssW = this.canvas.clientWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr ?? (r.width < 760 ? 1.5 : 1.75), this.dprLimit);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    const changed = w !== this.canvas.width || h !== this.canvas.height;
    if (changed) {
      // Setting the size clears the canvas and reallocates its buffer, so only do it when the size really changed
      this.canvas.width = w; this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
    this.staticDirty = true;
    if (changed || !this.running) this.draw();
  }

  start() {
    if (this.running) return;
    this.running = true; this.last = performance.now();
    this.lastActive = this.last; this.warmUntil = this.last + WARM_UP; this.slowStart = 0;
    if (!this.listening) {
      // Scrolling (the page or the What We Do deck) and touches keep phones at full rate
      document.addEventListener("scroll", this.onInput, { passive: true, capture: true });
      window.addEventListener("pointerdown", this.onInput, { passive: true });
      window.addEventListener("pointermove", this.onInput, { passive: true });
      this.listening = true;
    }
    const loop = (now: number) => { this.tick(now); if (this.running) this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    this.running = false; cancelAnimationFrame(this.raf);
    if (this.listening) {
      document.removeEventListener("scroll", this.onInput, { capture: true });
      window.removeEventListener("pointerdown", this.onInput); window.removeEventListener("pointermove", this.onInput);
      this.listening = false;
    }
  }
  /** Frees the GPU objects, and the WebGL context itself once the canvas has left the page, so page changes don't pile up contexts. */
  dispose() {
    this.stop(); this.ro?.disconnect();
    const gl = this.gl;
    this.buffers.forEach(b => { if (b) gl.deleteBuffer(b); }); gl.deleteBuffer(this.randBuf);
    this.shaders.forEach(s => { gl.detachShader(this.prog, s); gl.deleteShader(s); });
    gl.deleteProgram(this.prog);
    this.buffers = []; this.shaders = []; this.shapes = [];
    // A canvas still on the page may get a new field (React's development double mount, a new header shape); it reuses this context
    if (!this.canvas.isConnected) gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  private tick(now: number) {
    const gap = now - this.last;
    const paced = this.phone && this.motion > 0;
    const idle = paced && now - this.lastActive > IDLE_AFTER;
    // Nothing is moving: skip this frame and leave the last one on screen (about 30 fps)
    if (idle && gap < IDLE_FRAME) return;
    const dt = Math.min(0.05, gap / 1000); this.last = now;
    this.time += dt * this.motion;
    const before = this.morph;
    if (this.follow) this.morph += (this.morphTarget - this.morph) * Math.min(1, dt * 4.5);
    this.onFrame?.();
    this.draw(dt);
    if (paced) this.pace(now, gap, idle, before);
  }

  /** Phones: notes whether anything moved this frame, and lowers the pixel ratio once if full-rate frames stay slow. */
  private pace(now: number, gap: number, idle: boolean, morphBefore: number) {
    const shockLive = this.shockAt >= 0 && this.time - this.shockAt < 1.4;
    if (Math.abs(this.morph - morphBefore) > 1e-4 || (this.follow && Math.abs(this.morphTarget - this.morph) > 1e-3)
      || Math.abs(this.spinVel) > 0.02 || this.settling || shockLive) this.lastActive = now;
    if (idle || this.dprDropped || now < this.warmUntil) { this.slowStart = 0; return; }
    if (!this.slowStart) { this.slowStart = now; this.slowSum = 0; this.slowN = 0; return; }
    if (gap < 250) { this.slowSum += gap; this.slowN++; }   // ignore one-off stalls (tab switches, a big layout)
    if (now - this.slowStart < SLOW_WINDOW) return;
    const slow = this.slowN >= 8 && this.slowSum / this.slowN > SLOW_FRAME;
    this.slowStart = 0;
    if (!slow) return;
    this.dprDropped = true;
    const current = Math.min(window.devicePixelRatio || 1, this.maxDpr ?? (this.cssW < 760 ? 1.5 : 1.75), this.dprLimit);
    const next = DPR_STEPS.find(s => s < current - 0.01);
    if (next !== undefined) { this.dprLimit = next; this.resize(); }
  }

  draw(dt = 0) {
    const gl = this.gl, n = this.shapes.length;
    if (!n) return;
    const m = Math.max(0, Math.min(n - 1, this.morph));
    const from = Math.min(Math.floor(m), n - 2 < 0 ? 0 : n - 2), to = Math.min(from + 1, n - 1), t = n === 1 ? 0 : m - from;
    const A = this.shapes[from], B = this.shapes[to];
    if (!A || !B) return;   // not built yet: keep the last frame
    const spin = A.spin + (B.spin - A.spin) * t, flutter = A.flutter + (B.flutter - A.flutter) * t, sway = A.sway + (B.sway - A.sway) * t;

    this.angleY += (dt * 0.16 * spin + this.spinVel * dt) * this.motion;
    this.spinVel *= Math.exp(-2.2 * dt);
    // Keep within one turn so shapes never unwind several times
    if (this.angleY > Math.PI) this.angleY -= Math.PI * 2; else if (this.angleY < -Math.PI) this.angleY += Math.PI * 2;
    const k = Math.min(1, dt * 3);
    const tx = this.tiltTarget.x * (0.3 + spin * 0.7) - this.tilt.x, ty = this.tiltTarget.y * (0.3 + spin * 0.7) - this.tilt.y;
    this.tilt.x += tx * k;
    this.tilt.y += ty * k;
    this.mouse.on += (this.mouse.target - this.mouse.on) * Math.min(1, dt * 5);
    this.settling = Math.abs(tx) + Math.abs(ty) > 1e-3 || Math.abs(this.mouse.target - this.mouse.on) > 0.005;
    // Ease the spin back to facing the camera while text is on screen
    const ay = this.angleY * spin + sway * 0.4 * Math.sin(this.time * 0.45) * this.motion;

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    if (from !== this.boundFrom) { this.attr(this.buffers[from]!, this.loc.aFrom, 3); this.boundFrom = from; }
    if (to !== this.boundTo) { this.attr(this.buffers[to]!, this.loc.aTo, 3); this.boundTo = to; }

    const u = this.uni;
    if (this.staticDirty) {
      const aspect = this.canvas.width / this.canvas.height;
      gl.uniformMatrix4fv(u.uProj, false, perspective(this.proj, Math.PI / 4, aspect, 0.1, 50));
      gl.uniform1f(u.uAspect, aspect);
      gl.uniform1f(u.uSize, this.pointSize ?? (this.cssW < 760 ? 2.3 : 2.6));
      gl.uniform1f(u.uPR, this.canvas.width / Math.max(1, this.cssW));
      gl.uniform1f(u.uBurst, this.phone ? PHONE_CALM : 1);
      this.staticDirty = false;
    }
    gl.uniformMatrix4fv(u.uRot, false, rotation(this.rot, this.tilt.x, ay + this.tilt.y));
    gl.uniform1f(u.uT, t); gl.uniform1f(u.uTime, this.time);
    gl.uniform1f(u.uFlutter, flutter * (this.phone ? PHONE_CALM : 1)); gl.uniform1f(u.uMotion, this.motion);
    gl.uniform1f(u.uMouseOn, this.mouse.on * this.motion); gl.uniform2f(u.uMouse, this.mouse.x, this.mouse.y);
    gl.uniform3f(u.uOffFrom, A.offset[0], A.offset[1], A.offset[2]); gl.uniform3f(u.uOffTo, B.offset[0], B.offset[1], B.offset[2]);
    gl.uniform1f(u.uScaleFrom, A.scale); gl.uniform1f(u.uScaleTo, B.scale);
    gl.uniform1f(u.uSizeMul, A.size + (B.size - A.size) * t);
    const st = this.shockAt < 0 ? -1 : this.time - this.shockAt;
    gl.uniform1f(u.uShockT, st > 1.4 ? -1 : st); gl.uniform2f(u.uShockPos, this.shockPos.x, this.shockPos.y);
    gl.uniform3fv(u.uFromA, rgb(A.colors[0])); gl.uniform3fv(u.uFromB, rgb(A.colors[1]));
    gl.uniform3fv(u.uToA, rgb(B.colors[0])); gl.uniform3fv(u.uToB, rgb(B.colors[1]));
    gl.drawArrays(gl.POINTS, 0, this.count);
  }
}
