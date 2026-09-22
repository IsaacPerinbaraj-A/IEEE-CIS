import { useEffect, useRef, useState } from "react";
import { Modal } from "./ui";
import { renderSquare, type Crop } from "./image";

/** Drag to position, zoom to frame the face. Produces a 480 × 480 image. */
export default function CropDialog({ img, onCancel, onDone }: { img: HTMLImageElement; onCancel: () => void; onDone: (blob: Blob) => void | Promise<void> }) {
  const [crop, setCrop] = useState<Crop>({ zoom: 1.15, x: 0, y: -0.35 });
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null), drag = useRef<{ x: number; y: number } | null>(null);
  const SIZE = 300;

  useEffect(() => {
    const c = canvas.current!, ctx = c.getContext("2d")!, dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = c.height = SIZE * dpr;
    const w = img.naturalWidth, h = img.naturalHeight, side = Math.min(w, h) / crop.zoom;
    const sx = (w - side) / 2 + (crop.x * (w - side)) / 2, sy = (h - side) / 2 + (crop.y * (h - side)) / 2;
    ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(img, sx, sy, side, side, 0, 0, c.width, c.height);
  }, [crop, img]);

  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const pan = (dx: number, dy: number) => setCrop(c => {
    const w = img.naturalWidth, h = img.naturalHeight, side = Math.min(w, h) / c.zoom, perPx = side / SIZE;
    return { ...c, x: w > side ? clamp(c.x - (dx * perPx) / ((w - side) / 2)) : 0, y: h > side ? clamp(c.y - (dy * perPx) / ((h - side) / 2)) : 0 };
  });

  return (
    <Modal title="Frame the photo" onClose={onCancel}
      footer={<>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn-gold" disabled={busy} onClick={async () => { setBusy(true); try { await onDone(await renderSquare(img, crop)); } finally { setBusy(false); } }}>
          {busy ? "Uploading…" : "Use this photo"}
        </button>
      </>}>
      <p className="mb-4 text-[15px] text-mute">Drag the photo to move it and use the slider to zoom. Keep the face near the middle.</p>
      <div className="flex flex-col items-center gap-5">
        <canvas ref={canvas} aria-label="Photo crop preview" style={{ width: SIZE, height: SIZE, touchAction: "none" }}
          className="max-w-full cursor-grab rounded-2xl border border-line active:cursor-grabbing"
          onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
          onPointerMove={e => { if (!drag.current) return; pan(e.clientX - drag.current.x, e.clientY - drag.current.y); drag.current = { x: e.clientX, y: e.clientY }; }}
          onPointerUp={() => { drag.current = null; }}
          onWheel={e => setCrop(c => ({ ...c, zoom: Math.max(1, Math.min(3, c.zoom - e.deltaY * 0.001)) }))}
          onKeyDown={e => {
            const step = 12, k = e.key;
            if (k === "ArrowLeft") pan(step, 0); else if (k === "ArrowRight") pan(-step, 0); else if (k === "ArrowUp") pan(0, step); else if (k === "ArrowDown") pan(0, -step); else return;
            e.preventDefault();
          }} tabIndex={0} />
        <label className="flex w-full max-w-[300px] items-center gap-3 text-[14px] text-mute">
          Zoom
          <input type="range" min={1} max={3} step={0.01} value={crop.zoom} onChange={e => setCrop(c => ({ ...c, zoom: Number(e.target.value) }))} className="w-full accent-[#F2B544]" />
        </label>
      </div>
    </Modal>
  );
}
