/**
 * Image checks and addresses, without the database. Used by uploads (routes/images.ts), the starting-content
 * import (starting.ts) and publishing (every image path the content uses must be stored).
 *
 * An upload must really be the type it claims: JPEG starts with FF D8 FF; WebP has "RIFF" at byte 0 and "WEBP" at
 * byte 8. Width and height are read from the file header (no image library needed).
 */
import { createHash } from "node:crypto";
import { LIMITS } from "../../shared/api.ts";
import { IMAGE_EXTENSION, IMAGE_PATH_RE, type ImageFolder, type ImageType } from "../../shared/sections.ts";
import { slugify } from "../../shared/text.ts";
import type { Binary } from "../db.ts";

export type ImageFacts = { contentType: ImageType; width: number; height: number };
export type SniffResult = ({ ok: true } & ImageFacts) | { ok: false; message: string };

const NOT_AN_IMAGE = "That file isn't a WebP or JPEG image.";
const UNREADABLE = "The image couldn't be read. Save it again as WebP or JPEG and try again.";

const ascii = (b: Uint8Array, start: number, length: number) => String.fromCharCode(...b.subarray(start, start + length));
const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32le = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

/** Start-of-frame markers (C0–CF except DHT C4, JPG C8 and DAC CC): they carry the height and width. */
const isSofMarker = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

function sniffJpeg(b: Uint8Array): SniffResult {
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return { ok: false, message: UNREADABLE };
    let m = b[i + 1];
    // Fill bytes: any number of FF before the marker
    while (m === 0xff && i + 2 < b.length) { i++; m = b[i + 1]; }
    // Markers without a length
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) { i += 2; continue; }
    // End of image or start of scan before any frame header
    if (m === 0xd9 || m === 0xda) return { ok: false, message: UNREADABLE };
    if (i + 3 >= b.length) break;
    const length = u16be(b, i + 2);
    if (length < 2) return { ok: false, message: UNREADABLE };
    if (isSofMarker(m)) {
      if (i + 8 >= b.length) break;
      const height = u16be(b, i + 5), width = u16be(b, i + 7);
      return { ok: true, contentType: "image/jpeg", width, height };
    }
    i += 2 + length;
  }
  return { ok: false, message: UNREADABLE };
}

function sniffWebp(b: Uint8Array): SniffResult {
  if (b.length < 30) return { ok: false, message: UNREADABLE };
  const riffSize = u32le(b, 4);
  if (riffSize < 4 || riffSize + 8 > b.length) return { ok: false, message: UNREADABLE };
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 ") {
    // Key frame start code 9D 01 2A, then 14-bit width and height
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return { ok: false, message: UNREADABLE };
    return { ok: true, contentType: "image/webp", width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return { ok: false, message: UNREADABLE };
    const bits = u32le(b, 21);
    return { ok: true, contentType: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    return { ok: true, contentType: "image/webp", width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  }
  return { ok: false, message: UNREADABLE };
}

/** What the bytes really are, with the image's size in pixels. */
export function sniffImage(bytes: Uint8Array): SniffResult {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return sniffJpeg(bytes);
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return sniffWebp(bytes);
  return { ok: false, message: NOT_AN_IMAGE };
}

const TYPE_NAME: Record<ImageType, string> = { "image/webp": "WebP", "image/jpeg": "JPEG" };

/**
 * The checks every stored image passes: at most LIMITS.imageBytes, really the declared type, and each side from
 * LIMITS.imageMinSide to imageMaxSide pixels. `declared` is the upload's Content-Type (or the file extension).
 */
export function checkImage(bytes: Uint8Array, declared: ImageType): SniffResult {
  if (bytes.length === 0) return { ok: false, message: "The image is empty." };
  if (bytes.length > LIMITS.imageBytes) return { ok: false, message: `The image is larger than ${Math.round(LIMITS.imageBytes / 1024 / 1024)} MB.` };
  const facts = sniffImage(bytes);
  if (!facts.ok) return facts;
  if (facts.contentType !== declared)
    return { ok: false, message: `The file says it's a ${TYPE_NAME[declared]} but it's really a ${TYPE_NAME[facts.contentType]}. Save it again and try again.` };
  const { width, height } = facts;
  const min = LIMITS.imageMinSide, max = LIMITS.imageMaxSide;
  if (width < min || height < min || width > max || height > max)
    return { ok: false, message: `Each side of the image must be ${min} to ${max} pixels (this one is ${width} × ${height}).` };
  return facts;
}

/** The image type for a file name in public/images (.webp or .jpg), or null. */
export function typeFromFileName(name: string): ImageType | null {
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".jpg")) return "image/jpeg";
  return null;
}

export const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** The name part of an upload's address, after slugify: lowercase letters, numbers and dashes. */
export const NAME_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** "Priya S." → "priya-s", or null when nothing usable is left. */
export function nameSlug(name: string): string | null {
  const slug = slugify(name);
  return NAME_SLUG_RE.test(slug) ? slug : null;
}

/**
 * The public address of an upload: /images/<folder>/<slug>-<first `hexChars` of the sha256>.<webp|jpg>.
 * The hash in the name means an address never points at different bytes, so it never needs a ?v= query.
 */
export function uploadPath(folder: ImageFolder, slug: string, sha256: string, type: ImageType, hexChars = 10): string {
  const path = `/images/${folder}/${slug}-${sha256.slice(0, hexChars)}.${IMAGE_EXTENSION[type]}`;
  if (!IMAGE_PATH_RE.test(path)) throw new Error("Image path doesn't match IMAGE_PATH_RE");
  return path;
}

/** Where an image path appears inside some content: `key` is the dotted path ("3.poster"), like validation errors. */
export type ImageRef = { key: string; path: string };

/**
 * Every image address used anywhere in some content: any text value that is exactly an image path
 * (IMAGE_PATH_RE: event posters, member photos, achievement photos), in document order.
 */
export function imageRefsIn(value: unknown): ImageRef[] {
  const refs: ImageRef[] = [];
  const walk = (v: unknown, key: string, depth: number) => {
    if (depth > 20) return;
    if (typeof v === "string") { if (IMAGE_PATH_RE.test(v)) refs.push({ key, path: v }); return; }
    const at = (k: string | number) => (key ? `${key}.${k}` : String(k));
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, at(i), depth + 1)); return; }
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, at(k), depth + 1);
  };
  walk(value, "", 0);
  return refs;
}

/** The image paths some content uses: sorted, without duplicates. */
export const imagePathsIn = (value: unknown): string[] => [...new Set(imageRefsIn(value).map(r => r.path))].sort();

/** The bytes of a stored image as a Buffer (no copy). */
export function binaryToBuffer(data: Binary): Buffer {
  const u8 = data.value();
  return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
}
