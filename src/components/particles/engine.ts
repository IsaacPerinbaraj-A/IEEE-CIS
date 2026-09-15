/**
 * A tiny WebGL particle engine (no three.js). Thousands of glowing points morph between
 * pre-computed 3D shapes. Each frame draws one transition: shape `from` -> shape `to`.
 */

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

const VERT = `
attribute vec3 aFrom; attribute vec3 aTo; attribute float aRand;
uniform float uT, uTime, uSize, uPR, uFlutter, uMotion, uAspect, uMouseOn, uShockT;
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
  p += normalize(p + vec3(0.0001)) * mid * (0.45 + r * 0.6) * uMotion;          // burst outwards mid-morph
  float w = (0.012 + uFlutter * 0.16) * uMotion;
  p += vec3(sin(uTime * (0.7 + r) + r * 40.0), cos(uTime * (0.6 + r * 0.8) + r * 20.0), sin(uTime * (0.8 + r * 0.5) + r * 10.0)) * w;
  vec4 world = uRot * vec4(p, 1.0);
  world.xyz += mix(uOffFrom, uOffTo, t);
  world.z -= 6.0;
  vec4 clip = uProj * world;
  vec2 ndc = clip.xy / clip.w;
  vec2 dm = (ndc - uMouse) * vec2(uAspect, 1.0);
  float dist = length(dm);
  float push = uMouseOn * (1.0 - smoothstep(0.0, 0.34, dist));
  vec2 dir = dist > 0.0001 ? dm / dist : vec2(0.0);
  vec2 swirl = vec2(-dir.y, dir.x);                                               // vortex: push out and spin around the cursor
  ndc += (dir * 0.09 + swirl * 0.075 * (0.6 + r)) * push * vec2(1.0 / uAspect, 1.0);
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
  gl_PointSize = uSize * uSizeMul * uPR * (0.8 + r * 1.3) * (6.0 / depth) * (1.0 + push * 1.6 + wave * 1.8);
  float gf = clamp(aFrom.y * 0.3 + 0.5, 0.0, 1.0), gt = clamp(aTo.y * 0.3 + 0.5, 0.0, 1.0);
  vColor = mix(mix(uFromA, uFromB, gf), mix(uToA, uToB, gt), t);
  if (r > 0.965) vColor = vec3(0.95, 0.71, 0.27);                                  // gold sparks
  vColor += push * 0.55 + wave * vec3(0.9, 0.75, 1.0);
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

const hex = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

function perspective(fovy: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
function rotation(ax: number, ay: number) {
  const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
  // R = Rx(ax) * Ry(ay), column-major
  return new Float32Array([cy, sx * sy, -cx * sy, 0, 0, cx, sx, 0, sy, -sx * cy, cx * cy, 0, 0, 0, 0, 1]);
}

export class ParticleField {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private buffers: WebGLBuffer[] = [];
  private randBuf: WebGLBuffer;
  private loc: Record<string, number> = {};
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private shapes: ShapeSpec[] = [];
  private raf = 0;
  private last = 0;
  private time = 0;
  private angleY = 0;
  private tilt = { x: 0, y: 0 };
  private tiltTarget = { x: 0, y: 0 };
  private mouse = { x: 0, y: 0, on: 0, target: 0 };
  private running = false;
  private shockAt = -1;
  private shockPos = { x: 0, y: 0 };
  /** When false the particles ignore the pointer (used during the intro). */
  interactive = true;
  readonly count: number;
  morph = 0;          // current position along the shape list (float)
  morphTarget = 0;    // eased towards when `follow` is true
  follow = true;
  motion = 1;         // 0 for reduced motion
  onFrame?: () => void;

  static supported() {
    try { const c = document.createElement("canvas"); return !!(c.getContext("webgl") || c.getContext("experimental-webgl")); } catch { return false; }
  }

  private canvas: HTMLCanvasElement;
  private maxDpr?: number;

  /**
   * `highPerformance` asks for the fast GPU (only worth it on strong devices; it can wake a laptop's discrete GPU).
   * `maxDpr` caps the pixel ratio, e.g. 1 on low-power devices.
   */
  constructor(canvas: HTMLCanvasElement, count: number, opts: { highPerformance?: boolean; maxDpr?: number } = {}) {
    this.canvas = canvas;
    this.maxDpr = opts.maxDpr;
    const gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: opts.highPerformance ? "high-performance" : "default" });
    if (!gl) throw new Error("WebGL not available");
    this.gl = gl; this.count = count;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader"); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog); gl.useProgram(prog); this.prog = prog;
    ["aFrom", "aTo", "aRand"].forEach(n => (this.loc[n] = gl.getAttribLocation(prog, n)));
    ["uT", "uTime", "uSize", "uPR", "uFlutter", "uMotion", "uAspect", "uMouseOn", "uProj", "uRot", "uMouse", "uOffFrom", "uOffTo", "uFromA", "uFromB", "uToA", "uToB", "uScaleFrom", "uScaleTo", "uSizeMul", "uShockT", "uShockPos"]
      .forEach(n => (this.uni[n] = gl.getUniformLocation(prog, n)));
    const rand = new Float32Array(count); for (let i = 0; i < count; i++) rand[i] = Math.random();
    this.randBuf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.randBuf); gl.bufferData(gl.ARRAY_BUFFER, rand, gl.STATIC_DRAW);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.disable(gl.DEPTH_TEST);
  }

  setShapes(shapes: ShapeSpec[]) {
    const gl = this.gl;
    shapes.forEach((s, i) => {
      if (!this.buffers[i]) this.buffers[i] = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[i]); gl.bufferData(gl.ARRAY_BUFFER, s.positions, gl.STATIC_DRAW);
    });
    this.shapes = shapes;
  }
  /** Update where shapes sit and how big they are (after a resize) without re-uploading positions. */
  setLayout(layout: { offset: [number, number, number]; scale: number }[]) {
    layout.forEach((l, i) => { if (this.shapes[i]) { this.shapes[i].offset = l.offset; this.shapes[i].scale = l.scale; } });
  }
  replaceShape(i: number, positions: Float32Array) {
    const gl = this.gl; this.shapes[i].positions = positions;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[i]); gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  }

  pointer(nx: number | null, ny = 0) {
    if (nx === null || !this.interactive) { this.mouse.target = 0; this.tiltTarget = { x: 0, y: 0 }; return; }
    this.mouse.x = nx; this.mouse.y = ny; this.mouse.target = 1;
    this.tiltTarget = { x: -ny * 0.35, y: nx * 0.5 };
  }

  /** Sends a shockwave ring out from a point (normalised device coordinates). */
  shock(nx: number, ny: number) {
    if (!this.interactive || !this.motion) return;
    this.shockPos = { x: nx, y: ny }; this.shockAt = this.time;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr ?? (r.width < 760 ? 1.5 : 1.75));
    this.canvas.width = Math.max(1, Math.round(r.width * dpr)); this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.draw();
  }

  start() { if (this.running) return; this.running = true; this.last = performance.now(); const loop = (now: number) => { this.tick(now); if (this.running) this.raf = requestAnimationFrame(loop); }; this.raf = requestAnimationFrame(loop); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  dispose() { this.stop(); const gl = this.gl; this.buffers.forEach(b => gl.deleteBuffer(b)); gl.deleteBuffer(this.randBuf); gl.deleteProgram(this.prog); }

  private tick(now: number) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.time += dt * this.motion;
    if (this.follow) this.morph += (this.morphTarget - this.morph) * Math.min(1, dt * 4.5);
    this.onFrame?.();
    this.draw(dt);
  }

  draw(dt = 0) {
    const gl = this.gl, n = this.shapes.length;
    if (!n) return;
    const m = Math.max(0, Math.min(n - 1, this.morph));
    const from = Math.min(Math.floor(m), n - 2 < 0 ? 0 : n - 2), to = Math.min(from + 1, n - 1), t = n === 1 ? 0 : m - from;
    const A = this.shapes[from], B = this.shapes[to];
    const spin = A.spin + (B.spin - A.spin) * t, flutter = A.flutter + (B.flutter - A.flutter) * t, sway = A.sway + (B.sway - A.sway) * t;

    this.angleY += dt * 0.16 * spin * this.motion;
    if (this.angleY > Math.PI) this.angleY -= Math.PI * 2;   // keep within one turn so shapes never unwind several times
    const k = Math.min(1, dt * 3);
    this.tilt.x += (this.tiltTarget.x * (0.3 + spin * 0.7) - this.tilt.x) * k;
    this.tilt.y += (this.tiltTarget.y * (0.3 + spin * 0.7) - this.tilt.y) * k;
    this.mouse.on += (this.mouse.target - this.mouse.on) * Math.min(1, dt * 5);
    // Ease the spin back to facing the camera while text is on screen
    const ay = this.angleY * spin + sway * 0.4 * Math.sin(this.time * 0.45) * this.motion;

    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    const bind = (buf: WebGLBuffer, loc: number, size: number) => { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
    bind(this.buffers[from], this.loc.aFrom, 3); bind(this.buffers[to], this.loc.aTo, 3); bind(this.randBuf, this.loc.aRand, 1);

    const aspect = this.canvas.width / this.canvas.height;
    const u = this.uni;
    gl.uniformMatrix4fv(u.uProj, false, perspective(Math.PI / 4, aspect, 0.1, 50));
    gl.uniformMatrix4fv(u.uRot, false, rotation(this.tilt.x, ay + this.tilt.y));
    gl.uniform1f(u.uT, t); gl.uniform1f(u.uTime, this.time);
    gl.uniform1f(u.uSize, this.canvas.clientWidth < 760 ? 2.3 : 2.6); gl.uniform1f(u.uPR, this.canvas.width / Math.max(1, this.canvas.clientWidth));
    gl.uniform1f(u.uFlutter, flutter); gl.uniform1f(u.uMotion, this.motion); gl.uniform1f(u.uAspect, aspect);
    gl.uniform1f(u.uMouseOn, this.mouse.on * this.motion); gl.uniform2f(u.uMouse, this.mouse.x, this.mouse.y);
    gl.uniform3fv(u.uOffFrom, A.offset); gl.uniform3fv(u.uOffTo, B.offset);
    gl.uniform1f(u.uScaleFrom, A.scale); gl.uniform1f(u.uScaleTo, B.scale);
    gl.uniform1f(u.uSizeMul, A.size + (B.size - A.size) * t);
    const st = this.shockAt < 0 ? -1 : this.time - this.shockAt;
    gl.uniform1f(u.uShockT, st > 1.4 ? -1 : st); gl.uniform2f(u.uShockPos, this.shockPos.x, this.shockPos.y);
    gl.uniform3fv(u.uFromA, hex(A.colors[0])); gl.uniform3fv(u.uFromB, hex(A.colors[1]));
    gl.uniform3fv(u.uToA, hex(B.colors[0])); gl.uniform3fv(u.uToB, hex(B.colors[1]));
    gl.drawArrays(gl.POINTS, 0, this.count);
  }
}
