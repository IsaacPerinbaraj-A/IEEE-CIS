import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Binary } from "mongodb";
import { LIMITS } from "../../shared/api.ts";
import { IMAGE_FOLDERS, IMAGE_PATH_RE } from "../../shared/sections.ts";
import { binaryToBuffer, checkImage, imagePathsIn, imageRefsIn, nameSlug, sha256Hex, sniffImage, typeFromFileName, uploadPath } from "./images.ts";

/** A minimal JPEG header: SOI, an APP0 segment, then a start-of-frame marker with the size. */
function jpeg(width: number, height: number, sof = 0xc0): Buffer {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const frame = [0xff, sof, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
  return Buffer.from([0xff, 0xd8, ...app0, 0xff, 0xff, ...frame, 0xff, 0xd9]);
}

/** A RIFF/WEBP file with one chunk whose first bytes are `payload` (padded to a plausible size). */
function webp(chunk: string, payload: number[]): Buffer {
  const data = Buffer.alloc(Math.max(payload.length, 20));
  Buffer.from(payload).copy(data);
  const header = Buffer.alloc(20);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(12 + data.length, 4);
  header.write("WEBP", 8, "ascii");
  header.write(chunk, 12, "ascii");
  header.writeUInt32LE(data.length, 16);
  return Buffer.concat([header, data]);
}

const vp8 = (w: number, h: number) => webp("VP8 ", [0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, w & 0xff, (w >> 8) & 0x3f, h & 0xff, (h >> 8) & 0x3f]);
function vp8l(w: number, h: number) {
  const bits = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14);
  return webp("VP8L", [0x2f, bits & 0xff, (bits >>> 8) & 0xff, (bits >>> 16) & 0xff, (bits >>> 24) & 0xff]);
}
const vp8x = (w: number, h: number) =>
  webp("VP8X", [0x10, 0, 0, 0, (w - 1) & 0xff, ((w - 1) >> 8) & 0xff, ((w - 1) >> 16) & 0xff, (h - 1) & 0xff, ((h - 1) >> 8) & 0xff, ((h - 1) >> 16) & 0xff]);

test("reads the size of JPEG and every kind of WebP", () => {
  assert.deepEqual(sniffImage(jpeg(640, 480)), { ok: true, contentType: "image/jpeg", width: 640, height: 480 });
  assert.deepEqual(sniffImage(jpeg(1200, 900, 0xc2)), { ok: true, contentType: "image/jpeg", width: 1200, height: 900 });
  assert.deepEqual(sniffImage(vp8(480, 480)), { ok: true, contentType: "image/webp", width: 480, height: 480 });
  assert.deepEqual(sniffImage(vp8l(900, 1125)), { ok: true, contentType: "image/webp", width: 900, height: 1125 });
  assert.deepEqual(sniffImage(vp8x(572, 712)), { ok: true, contentType: "image/webp", width: 572, height: 712 });
});

test("refuses files that aren't really WebP or JPEG", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(40).fill(0)]);
  assert.equal(sniffImage(png).ok, false);
  assert.equal(sniffImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")).ok, false);
  assert.equal(sniffImage(Buffer.alloc(0)).ok, false);
  // Right magic bytes, but cut short or broken inside
  assert.equal(sniffImage(jpeg(640, 480).subarray(0, 12)).ok, false);
  assert.equal(sniffImage(vp8(480, 480).subarray(0, 24)).ok, false);
  const broken = vp8(480, 480);
  broken[23] = 0;
  assert.equal(sniffImage(broken).ok, false);
  assert.equal(sniffImage(webp("ABCD", [1, 2, 3])).ok, false);
});

test("checkImage enforces the declared type, the byte limit and the pixel limits", () => {
  assert.equal(checkImage(jpeg(640, 480), "image/jpeg").ok, true);
  const mismatch = checkImage(jpeg(640, 480), "image/webp");
  assert.equal(mismatch.ok, false);
  assert.match(!mismatch.ok ? mismatch.message : "", /really a JPEG/);
  assert.equal(checkImage(jpeg(LIMITS.imageMaxSide + 1, 100), "image/jpeg").ok, false);
  assert.equal(checkImage(jpeg(100, LIMITS.imageMinSide - 1), "image/jpeg").ok, false);
  assert.equal(checkImage(jpeg(LIMITS.imageMaxSide, LIMITS.imageMinSide), "image/jpeg").ok, true);
  assert.equal(checkImage(Buffer.alloc(0), "image/webp").ok, false);
  const huge = Buffer.concat([vp8(480, 480), Buffer.alloc(LIMITS.imageBytes)]);
  const tooBig = checkImage(huge, "image/webp");
  assert.equal(tooBig.ok, false);
  assert.match(!tooBig.ok ? tooBig.message : "", /larger than 1 MB/);
});

test("every photo in the starting copy passes the upload checks", async () => {
  let count = 0;
  for (const folder of IMAGE_FOLDERS) {
    let names: string[] = [];
    try { names = await readdir(join(process.cwd(), "public", "images", folder)); } catch { continue; }
    for (const name of names) {
      const type = typeFromFileName(name);
      if (!type) continue;
      const r = checkImage(await readFile(join(process.cwd(), "public", "images", folder, name)), type);
      assert.equal(r.ok, true, `${folder}/${name}: ${!r.ok ? r.message : ""}`);
      count++;
    }
  }
  assert.ok(count > 0);
});

test("upload addresses are slugged, hashed and match IMAGE_PATH_RE", () => {
  const sha = sha256Hex(Buffer.from("photo"));
  assert.match(sha, /^[0-9a-f]{64}$/);
  assert.equal(nameSlug("Priya S."), "priya-s");
  assert.equal(nameSlug("  Événement 2025!  "), "evenement-2025");
  assert.equal(nameSlug("!!!"), null);
  assert.equal(nameSlug(""), null);
  const path = uploadPath("team", "priya-s", sha, "image/webp");
  assert.equal(path, `/images/team/priya-s-${sha.slice(0, 10)}.webp`);
  assert.match(path, IMAGE_PATH_RE);
  assert.match(uploadPath("events", nameSlug("x".repeat(200)) ?? "", sha, "image/jpeg", 64), IMAGE_PATH_RE);
  assert.ok(uploadPath("achievements", "sih", sha, "image/jpeg").endsWith(".jpg"));
});

test("image references are found anywhere in content, with their error keys", () => {
  const content = {
    sessions: [{ groups: [{ members: [{ name: "A", photo: "/images/team/a.webp" }, { name: "B", photo: "" }, { name: "C", photo: "/images/team/a.webp" }] }] }],
    note: "See /images/team/a.webp for details",
    link: "/images/events/poster-1.jpg",
    bad: "/images/team/A.webp",
  };
  assert.deepEqual(imageRefsIn(content), [
    { key: "sessions.0.groups.0.members.0.photo", path: "/images/team/a.webp" },
    { key: "sessions.0.groups.0.members.2.photo", path: "/images/team/a.webp" },
    { key: "link", path: "/images/events/poster-1.jpg" },
  ]);
  assert.deepEqual(imagePathsIn([content, { poster: "/images/events/b.webp" }]), ["/images/events/b.webp", "/images/events/poster-1.jpg", "/images/team/a.webp"]);
});

test("stored image bytes come back unchanged", () => {
  const bytes = vp8(32, 32);
  assert.deepEqual(binaryToBuffer(new Binary(bytes)), bytes);
});
