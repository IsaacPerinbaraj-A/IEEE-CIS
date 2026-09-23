/** Point clouds for each formation. All are centred on the origin, roughly 3.6 units across. */

const rnd = (a = -1, b = 1) => a + Math.random() * (b - a);
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

function fill(n: number, gen: (i: number) => [number, number, number]) {
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const [x, y, z] = gen(i); a[i * 3] = x; a[i * 3 + 1] = y; a[i * 3 + 2] = z; }
  return a;
}

/** Scattered cloud the intro starts from. */
export const chaos = (n: number) => fill(n, () => {
  const th = rnd(0, Math.PI * 2), ph = Math.acos(rnd()), r = rnd(3.2, 5.5);
  return [r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th) * 0.8, Math.min(2, r * Math.cos(ph) * 0.7 - 1)];
});

/** Hero: a glowing globe of neurons with orbit rings and a bright core. */
export const sphere = (n: number) => {
  const R = 1.55, surf = Math.floor(n * 0.7), rings = Math.floor(n * 0.14), golden = Math.PI * (3 - Math.sqrt(5));
  const tilts = [[0.4, 0.2], [-0.5, 0.9], [1.2, -0.4]];
  return fill(n, i => {
    if (i < surf) {
      const y = 1 - (i / (surf - 1)) * 2, rad = Math.sqrt(1 - y * y), th = golden * i;
      const j = 1 + rnd(-0.015, 0.015);
      return [Math.cos(th) * rad * R * j, y * R * j, Math.sin(th) * rad * R * j];
    }
    if (i < surf + rings) {
      const [ax, az] = tilts[i % 3], a = rnd(0, Math.PI * 2), rr = R * 1.28 + rnd(-0.02, 0.02);
      let x = Math.cos(a) * rr, y = 0, z = Math.sin(a) * rr;
      [y, z] = [y * Math.cos(ax) - z * Math.sin(ax), y * Math.sin(ax) + z * Math.cos(ax)];
      [x, y] = [x * Math.cos(az) - y * Math.sin(az), x * Math.sin(az) + y * Math.cos(az)];
      return [x, y, z];
    }
    const r = Math.cbrt(Math.random()) * 0.55;
    const th = rnd(0, Math.PI * 2), ph = Math.acos(rnd());
    return [r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)];
  });
};

/** Network: layers of nodes, with particles streaming along the connections (abstract decoration). */
export const neural = (n: number) => {
  const layers = [3, 4, 5, 4, 2];
  const nodes = layers.map((c, li) => Array.from({ length: c }, (_, j) => [
    -2 + li * 1.0, (j - (c - 1) / 2) * 0.62, Math.sin(j * 1.7 + li) * 0.25] as [number, number, number]));
  const nodeCount = Math.floor(n * 0.3);
  return fill(n, i => {
    if (i < nodeCount) {
      const l = nodes[i % nodes.length], p = l[Math.floor(Math.random() * l.length)];
      return [p[0] + gauss() * 0.05, p[1] + gauss() * 0.05, p[2] + gauss() * 0.05];
    }
    const li = Math.floor(Math.random() * (layers.length - 1));
    const a = nodes[li][Math.floor(Math.random() * layers[li])], b = nodes[li + 1][Math.floor(Math.random() * layers[li + 1])];
    const t = Math.random(), j = 0.012;
    return [a[0] + (b[0] - a[0]) * t + rnd(-j, j), a[1] + (b[1] - a[1]) * t + rnd(-j, j), a[2] + (b[2] - a[2]) * t + rnd(-j, j)];
  });
};

/** Landscape: overlapping hills over a floor grid (abstract decoration). */
export const fuzzy = (n: number) => {
  const centres = [-1.25, 0, 1.25];
  const mu = (x: number, z: number) => {
    let top = 0;
    for (const c of centres) { const v = Math.exp(-((x - c) ** 2) / (2 * 0.36 ** 2)); if (v > top) top = v; }
    return top * (0.82 + 0.18 * Math.cos(z * 3));
  };
  const surf = Math.floor(n * 0.76);
  return fill(n, i => {
    if (i < surf) { const x = rnd(-2.1, 2.1), z = rnd(-1.1, 1.1); return [x, mu(x, z) * 1.6 - 0.85, z]; }
    const onX = Math.random() < 0.5, k = Math.floor(rnd(0, 9)) / 8;
    return onX ? [rnd(-2.1, 2.1), -0.9, -1.1 + k * 2.2] : [-2.1 + k * 4.2, -0.9, rnd(-1.1, 1.1)];
  });
};

/** Helix: a double helix (abstract decoration). */
export const helix = (n: number) => {
  const strand = Math.floor(n * 0.38), rungs = 20;
  return fill(n, i => {
    if (i < strand * 2) {
      const y = rnd(-1.75, 1.75), th = y * 2.6 + (i < strand ? 0 : Math.PI), r = 0.78 + rnd(-0.03, 0.03);
      return [Math.cos(th) * r, y, Math.sin(th) * r];
    }
    const k = Math.floor(Math.random() * rungs), y = -1.75 + (k + 0.5) * (3.5 / rungs), th = y * 2.6, t = Math.random();
    const x1 = Math.cos(th) * 0.78, z1 = Math.sin(th) * 0.78;
    return [x1 + (-x1 * 2) * t, y + rnd(-0.01, 0.01), z1 + (-z1 * 2) * t];
  });
};

/** Swarm: flocks spread around a loop; particles also wander in the shader (abstract decoration). */
export const swarm = (n: number) => {
  const flocks = 7;
  return fill(n, i => {
    const f = i % flocks, a = (f / flocks) * Math.PI * 2, cx = Math.cos(a) * 1.45, cz = Math.sin(a) * 1.0, cy = Math.sin(a * 2) * 0.55;
    const tx = -Math.sin(a), tz = Math.cos(a), s = gauss() * 0.34;   // stretch each flock along its direction of travel
    return [cx + tx * s + gauss() * 0.13, cy + gauss() * 0.13, cz + tz * s + gauss() * 0.13];
  });
};

/** Samples the chapter name as a point cloud. `width` is the text width in world units. */
export async function textShape(n: number, lines: string[], width: number) {
  try { await document.fonts.load("600 160px Unbounded"); } catch { /* fall back to system font */ }
  const W = 1400, lh = 190, H = lh * lines.length + 60;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  // Read back once, so a CPU-backed canvas avoids a slow copy from the GPU
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  let size = 170;
  const font = () => `600 ${size}px Unbounded, system-ui, sans-serif`;
  ctx.font = font();
  while (Math.max(...lines.map(l => ctx.measureText(l).width)) > W * 0.94 && size > 40) { size -= 6; ctx.font = font(); }
  lines.forEach((l, i) => ctx.fillText(l, W / 2, 30 + lh * i + lh / 2));
  // Every third pixel inside the letters, kept as two flat lists instead of one small array per point
  const data = ctx.getImageData(0, 0, W, H).data, xs: number[] = [], ys: number[] = [];
  let minX = W, maxX = 0;
  for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) if (data[(y * W + x) * 4 + 3] > 140) {
    xs.push(x); ys.push(y); if (x < minX) minX = x; if (x > maxX) maxX = x;
  }
  const k = width / Math.max(1, maxX - minX), cy = H / 2, np = xs.length;
  return fill(n, () => {
    const j = Math.floor(Math.random() * np), x = np ? xs[j] : W / 2, y = np ? ys[j] : cy;
    return [(x - (minX + maxX) / 2) * k + rnd(-0.008, 0.008), -(y - cy) * k + rnd(-0.008, 0.008), rnd(-0.06, 0.06)];
  });
}

/** Lowest and highest y of a point cloud. */
export function yBounds(a: Float32Array) {
  let min = Infinity, max = -Infinity;
  for (let i = 1; i < a.length; i += 3) { if (a[i] < min) min = a[i]; if (a[i] > max) max = a[i]; }
  return { min, max };
}

/** Events: tilted orbit rings around a bright core, like the cycle of a year's events. */
export const rings = (n: number) => {
  const orbits: [number, number, number][] = [[0.8, 1.1, -0.3], [1.3, -0.5, 0.6], [1.75, 0.35, 0.1], [2.1, 0.15, -0.7]];
  const core = Math.floor(n * 0.12);
  return fill(n, i => {
    if (i < core) return [gauss() * 0.16, gauss() * 0.16, gauss() * 0.16];
    const [r, ax, az] = orbits[i % orbits.length], a = rnd(0, Math.PI * 2), rr = r + gauss() * 0.018;
    let x = Math.cos(a) * rr, y = 0, z = Math.sin(a) * rr;
    [y, z] = [y * Math.cos(ax) - z * Math.sin(ax), y * Math.sin(ax) + z * Math.cos(ax)];
    [x, y] = [x * Math.cos(az) - y * Math.sin(az), x * Math.sin(az) + y * Math.cos(az)];
    return [x, y, z];
  });
};

/** Team: one cluster per team (sized by its members), wired to a hub and to neighbouring teams. */
export const constellation = (n: number, sizes: number[]) => {
  const G = sizes.length || 1;
  const hubs = sizes.map((_, g) => { const a = (g / G) * Math.PI * 2; return [Math.cos(a) * 1.9, Math.sin(a * 2) * 0.4 + Math.sin(a) * 1.1, Math.sin(a) * 0.55] as const; });
  const people = sizes.flatMap((c, g) => Array.from({ length: c }, (_, j) => {
    const a = (j / c) * Math.PI * 2 + g, rr = 0.27 + (c > 3 ? 0.1 : 0);
    return [hubs[g][0] + Math.cos(a) * rr, hubs[g][1] + Math.sin(a) * rr, hubs[g][2] + Math.sin(a * 1.3) * 0.12, g] as const;
  }));
  const lerp = (a: readonly number[], b: readonly number[], t: number, j = 0.01): [number, number, number] =>
    [a[0] + (b[0] - a[0]) * t + rnd(-j, j), a[1] + (b[1] - a[1]) * t + rnd(-j, j), a[2] + (b[2] - a[2]) * t + rnd(-j, j)];
  const nodes = Math.floor(n * 0.34), spokes = Math.floor(n * 0.72);
  return fill(n, i => {
    if (i < nodes) { const p = people[i % people.length]; return [p[0] + gauss() * 0.03, p[1] + gauss() * 0.03, p[2] + gauss() * 0.03]; }
    if (i < spokes) { const p = people[Math.floor(Math.random() * people.length)]; return lerp(p, hubs[p[3]], Math.random()); }
    const g = Math.floor(Math.random() * G);
    return lerp(hubs[g], hubs[(g + 1) % G], Math.random(), 0.014);
  });
};

/** Contact: concentric signal ripples spreading from a point. */
export const ripple = (n: number) => {
  const waves = 7, source = Math.floor(n * 0.08);
  return fill(n, i => {
    if (i < source) return [gauss() * 0.09, gauss() * 0.09, gauss() * 0.09];
    const k = i % waves, r = 0.3 + k * 0.26 + gauss() * 0.012, a = rnd(0, Math.PI * 2);
    const x = Math.cos(a) * r, y = Math.sin(k * 0.9) * 0.05 - 0.04 * k, z = Math.sin(a) * r, tilt = 1.05;   // tip the rings toward the viewer
    return [x, y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt)];
  });
};
