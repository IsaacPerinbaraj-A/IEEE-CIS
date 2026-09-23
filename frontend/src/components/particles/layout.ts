/**
 * Places particle formations inside a region of the page (in CSS pixels) instead of against the screen edge.
 * Perspective makes parts of a shape that turn toward the camera look bigger, so the fit samples the shape's
 * footprint in 3D and shrinks it until even the nearest points stay inside the region.
 */

export const CAMERA_Z = 6;
export const VIS_H = 2 * CAMERA_Z * Math.tan(Math.PI / 8);   // visible world height at z = 0 (45° field of view)

/** Side-by-side (text left, shape right) vs stacked (shape above text). Shared with CSS in index.css. */
export const SIDE_QUERY = "(min-width: 1024px), (min-width: 640px) and (min-aspect-ratio: 13/10)";
export const isSideLayout = () => window.matchMedia(SIDE_QUERY).matches;

/** Horizontal radius (x–z plane, shapes spin around the vertical axis) and vertical half-height, at scale 1. */
export type Bounds = { rxz: number; ry: number };
export const BOUNDS: Record<string, Bounds> = {
  sphere: { rxz: 2.0, ry: 2.0 },
  neural: { rxz: 2.05, ry: 1.3 },
  fuzzy: { rxz: 2.37, ry: 0.9 },
  helix: { rxz: 0.82, ry: 1.78 },
  swarm: { rxz: 1.95, ry: 1.0 },
  rings: { rxz: 2.15, ry: 1.4 },
  constellation: { rxz: 2.3, ry: 1.9 },
  ripple: { rxz: 2.08, ry: 1.62 },
  chaos: { rxz: 3.0, ry: 2.5 },
};

/** A rectangle in CSS pixels, measured from the canvas's top-left corner. */
export type Region = { x0: number; x1: number; y0: number; y1: number };
export type Placement = { offset: [number, number, number]; scale: number };

const project = (v: number, z: number) => (v * CAMERA_Z) / (CAMERA_Z - z);

function extents(b: Bounds, s: number, ox: number, oy: number) {
  const R = b.rxz * s, H = b.ry * s;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 24) {
    const x = ox + Math.cos(a) * R, z = Math.sin(a) * R;
    const px = project(x, z), top = project(oy + H, z), bottom = project(oy - H, z);
    if (px < minX) minX = px; if (px > maxX) maxX = px;
    if (bottom < minY) minY = bottom; if (top > maxY) maxY = top;
  }
  return { minX, maxX, minY, maxY };
}

/** Largest scale (up to `maxScale`) at which the shape fits inside the region, centred on what you actually see. */
export function fitShape(b: Bounds, region: Region, canvasW: number, canvasH: number, maxScale = 1): Placement {
  const visW = VIS_H * (canvasW / Math.max(1, canvasH)), k = visW / Math.max(1, canvasW);
  const X0 = (region.x0 - canvasW / 2) * k, X1 = (region.x1 - canvasW / 2) * k;
  const Y1 = -(region.y0 - canvasH / 2) * k, Y0 = -(region.y1 - canvasH / 2) * k;   // world y points up
  const cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2;
  for (let s = maxScale; s > 0.06; s -= 0.02) {
    // Nearer points spread outward, so shift the centre until the projected footprint is balanced
    let ox = cx, oy = cy;
    for (let i = 0; i < 3; i++) {
      const e = extents(b, s, ox, oy);
      ox -= (e.minX + e.maxX) / 2 - cx; oy -= (e.minY + e.maxY) / 2 - cy;
    }
    const e = extents(b, s, ox, oy);
    if (e.minX >= X0 && e.maxX <= X1 && e.minY >= Y0 && e.maxY <= Y1) return { offset: [ox, oy, 0], scale: s };
  }
  return { offset: [cx, cy, 0], scale: 0.06 };
}
