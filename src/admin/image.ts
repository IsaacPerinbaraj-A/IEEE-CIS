/** Image processing in the browser, so uploads are small and consistent before they ever reach the site. */

export async function fileToImage(file: File): Promise<HTMLImageElement> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't an image.");
  const img = new Image();
  img.src = URL.createObjectURL(file);
  try { await img.decode(); } catch { throw new Error("Couldn't open this image. Try a JPG, PNG or WebP."); }
  return img;
}

async function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  const as = (type: string, q: number) => new Promise<Blob | null>(res => canvas.toBlob(res, type, q));
  const webp = await as("image/webp", 0.82);
  if (webp && webp.type === "image/webp") return webp;
  const jpg = await as("image/jpeg", 0.85);                       // browsers that can't write WebP
  if (!jpg) throw new Error("Couldn't process this image.");
  return jpg;
}

export type Crop = { zoom: number; x: number; y: number };        // x, y from -1 (left/top) to 1 (right/bottom)

/** Square crop, e.g. team photos at 480 × 480. */
export async function renderSquare(img: HTMLImageElement, crop: Crop, size = 480): Promise<Blob> {
  const w = img.naturalWidth, h = img.naturalHeight, side = Math.min(w, h) / crop.zoom;
  const sx = (w - side) / 2 + (crop.x * (w - side)) / 2, sy = (h - side) / 2 + (crop.y * (h - side)) / 2;
  const c = document.createElement("canvas"); c.width = c.height = size;
  const ctx = c.getContext("2d")!; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return encode(c);
}

/** Shrink to fit within a box without cropping, e.g. posters up to 900 px wide. */
export async function renderFit(img: HTMLImageElement, maxW = 900, maxH = 1400): Promise<Blob> {
  const k = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
  const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const ctx = c.getContext("2d")!; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return encode(c);
}
