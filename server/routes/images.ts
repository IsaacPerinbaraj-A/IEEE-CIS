/**
 * Photos, stored in MongoDB and copied into the site at build time (types in shared/api.ts).
 *
 * Upload: the raw body (at most LIMITS.imageBytes; Content-Type checked by app.ts) must really be that type, with
 * each side LIMITS.imageMinSide to imageMaxSide px (422 bad_image otherwise). The address is
 * /images/<folder>/<slug of name>-<first 10 hex of sha256>.<webp|jpg>. Uploading the same bytes again into the same
 * folder returns the stored image (whatever name was given), so nothing is stored twice. Images are never deleted.
 * Get: the bytes by sha256 id, for previews of images the live site doesn't have yet.
 */
import express, { type Router } from "express";
import { LIMITS, ROUTES, type ImageUploadResponse } from "../../shared/api.ts";
import { IMAGE_TYPES, SHA256_RE, isImageFolder, isImageType } from "../../shared/sections.ts";
import { getAuth, requireSession } from "../auth/middleware.ts";
import { writeAudit } from "../content/audit.ts";
import { checkImage, nameSlug, sha256Hex, uploadPath } from "../content/images.ts";
import { actorOf, readStore } from "../content/store.ts";
import type { AppDeps } from "../deps.ts";
import { queryValue } from "../http/body.ts";
import { HttpError, badRequest, notFound } from "../http/errors.ts";
import type { Handler } from "../http/handler.ts";
import { mediaType } from "../http/security.ts";

export function register(router: Router, deps: AppDeps): void {
  const imageBody = express.raw({ type: [...IMAGE_TYPES], limit: LIMITS.imageBytes });
  router.post(ROUTES.images, requireSession(deps), imageBody, upload(deps));
  router.get(ROUTES.image, requireSession(deps), getImage(deps));
}

/** POST /api/images?folder=&name= (raw image body; req.body is a Buffer) → ImageUploadResponse. */
const upload = (deps: AppDeps): Handler<ImageUploadResponse> => async (req, res) => {
  const actor = actorOf(getAuth(res));
  const folder = queryValue(req, "folder");
  if (!isImageFolder(folder)) throw badRequest("Choose where the photo goes: team, events or achievements.");
  const slug = nameSlug(queryValue(req, "name") ?? "");
  if (!slug) throw badRequest("Give the photo a name with letters or numbers, such as the person's name or the event.");
  const declared = mediaType(req.get("content-type"));
  if (!isImageType(declared)) throw new HttpError(415, "unsupported_media_type", "Send the image as WebP or JPEG.");
  const body: unknown = req.body;
  const bytes = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
  const check = checkImage(bytes, declared);
  if (!check.ok) throw new HttpError(422, "bad_image", check.message);

  const sha256 = sha256Hex(bytes);
  const store = await readStore(deps);
  // The same photo uploaded again (under any name) reuses the stored copy in that folder
  const same = (await store.imagesBySha(sha256)).find(i => i.path.startsWith(`/images/${folder}/`));
  if (same) {
    res.json({ id: sha256, path: same.path, contentType: same.contentType, width: same.width, height: same.height, size: same.size });
    return;
  }
  // 10 hex characters keep addresses short; if that address somehow holds other bytes, use the whole hash
  for (const hexChars of [10, 64]) {
    const path = uploadPath(folder, slug, sha256, check.contentType, hexChars);
    const image = { path, sha256, contentType: check.contentType, size: bytes.length, width: check.width, height: check.height };
    const stored = await store.addImage({ ...image, data: bytes }, deps.now(), actor);
    if (stored.sha256 !== sha256) continue;
    if (stored.added) await writeAudit(deps, req, { action: "image_upload", actor, target: path, detail: `${check.width} × ${check.height}, ${bytes.length} bytes` });
    res.json({ id: sha256, ...image });
    return;
  }
  throw new Error("Image address clash");
};

/** GET /api/images/:id → the image bytes. */
const getImage = (deps: AppDeps): Handler<Buffer, { id: string }> => async (req, res) => {
  const id = req.params.id;
  if (!SHA256_RE.test(id)) throw notFound("There is no photo with that id.");
  const image = await (await readStore(deps)).imageData(id);
  if (!image) throw notFound("There is no photo with that id.");
  res.set("Content-Security-Policy", "default-src 'none'; sandbox");
  res.type(image.contentType).send(image.data);
};
