/**
 * The published content for the Vercel build (types in shared/api.ts). Called by scripts/fetch-content.ts directly
 * on the Render address with `Authorization: Bearer <EXPORT_TOKEN>` (constant-time check in requireExportToken);
 * never by the browser, and not behind a session.
 * - published: the highest release's sections (normalised) and the stored images its content uses
 *   ({ path, sha256, contentType, size }); 409 not_initialised when there is no release.
 * - image: the bytes of the image with that sha256 (404 when unknown), with the stored Content-Type.
 */
import type { Router } from "express";
import { ROUTES, type ExportPublished } from "../../shared/api.ts";
import { SHA256_RE } from "../../shared/sections.ts";
import { requireExportToken } from "../auth/exportToken.ts";
import { readStore } from "../content/store.ts";
import { exportPublished } from "../content/views.ts";
import type { AppDeps } from "../deps.ts";
import { notFound } from "../http/errors.ts";
import type { Handler } from "../http/handler.ts";

export function register(router: Router, deps: AppDeps): void {
  router.get(ROUTES.exportPublished, requireExportToken(deps), published(deps));
  router.get(ROUTES.exportImage, requireExportToken(deps), image(deps));
}

/** GET /api/export/published → ExportPublished. */
const published = (deps: AppDeps): Handler<ExportPublished> => async (_req, res) => {
  const { body, missing } = await exportPublished(await readStore(deps));
  if (missing.length) deps.log.warn("export_missing_images", { release: body.release, count: missing.length, paths: missing.slice(0, 20) });
  deps.log.info("export_published", { release: body.release, images: body.images.length });
  res.json(body);
};

/** GET /api/export/image/:sha → the image bytes. */
const image = (deps: AppDeps): Handler<Buffer, { sha: string }> => async (req, res) => {
  const sha = req.params.sha;
  if (!SHA256_RE.test(sha)) throw notFound("There is no image with that id.");
  const found = await (await readStore(deps)).imageData(sha);
  if (!found) throw notFound("There is no image with that id.");
  res.type(found.contentType).send(found.data);
};
