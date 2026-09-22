/**
 * "Import starting content" (owner only, once): copies the repository's starting copy into the empty database as
 * release 1. Reads src/data/*.json (SECTION_FILES) and public/images/<team|events|achievements>/*.webp|jpg under
 * the server's checkout (deps.repoRoot; Render runs from the repository root).
 *
 * The files are normalised but not blocked by the rules: problems come back as `warnings` (with plain labels) and
 * must be fixed in the admin before those sections can be published again. Images that fail the upload checks are
 * skipped with a warning, and so is content that points at an image the folder doesn't have.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { DeployInfo, StartingContentResponse } from "../../shared/api.ts";
import type { SectionContent } from "../../shared/content.ts";
import { IMAGE_FOLDERS, IMAGE_FOLDER_SECTION, IMAGE_PATH_RE, SECTION_FILES, SECTION_KEYS, type SectionKey } from "../../shared/sections.ts";
import { checkSection, errorLabel, listErrors, type ErrorItem } from "../../shared/validate.ts";
import { getAuth } from "../auth/middleware.ts";
import type { ActorRef, ReleaseDoc } from "../db.ts";
import type { AppDeps } from "../deps.ts";
import { booleanField, jsonBody } from "../http/body.ts";
import { HttpError } from "../http/errors.ts";
import type { Handler } from "../http/handler.ts";
import { releaseTarget, writeAudit } from "./audit.ts";
import { deployRelease } from "./deploy.ts";
import { checkImage, imageRefsIn, sha256Hex, typeFromFileName } from "./images.ts";
import { writeRelease } from "./publish.ts";
import { actorOf, mongoTransaction, readStore, type ContentStore, type NewImage } from "./store.ts";

export type StartingCopy = { sections: SectionContent; images: NewImage[]; warnings: ErrorItem[] };

const imageWarning = (section: SectionKey, path: string, message: string): ErrorItem => ({ section, key: "", label: `Photo ${path}`, message });

/** Reads and checks the starting copy from the repository (no database). */
export async function readStartingCopy(repoRoot: string): Promise<StartingCopy> {
  const warnings: ErrorItem[] = [];
  const sections: Partial<Record<SectionKey, unknown>> = {};
  for (const k of SECTION_KEYS) {
    const file = SECTION_FILES[k];
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(join(repoRoot, file), "utf8"));
    } catch {
      throw new HttpError(500, "server_error", `The starting copy ${file} is missing or isn't valid JSON.`);
    }
    const r = checkSection(k, raw);
    sections[k] = r.value;
    warnings.push(...listErrors(k, r.value, r.errors));
  }
  const content = sections as SectionContent;

  const images: NewImage[] = [];
  for (const folder of IMAGE_FOLDERS) {
    const section = IMAGE_FOLDER_SECTION[folder];
    let names: string[];
    try {
      names = (await readdir(join(repoRoot, "public", "images", folder), { withFileTypes: true })).filter(d => d.isFile()).map(d => d.name).sort();
    } catch (e) {
      if ((e as { code?: unknown }).code === "ENOENT") continue;
      throw e;
    }
    for (const name of names) {
      if (name.startsWith(".")) continue;
      const path = `/images/${folder}/${name}`;
      const type = typeFromFileName(name);
      if (!type) { warnings.push(imageWarning(section, path, "Skipped: only .webp and .jpg photos are imported.")); continue; }
      if (!IMAGE_PATH_RE.test(path)) { warnings.push(imageWarning(section, path, "Skipped: the file name must use lowercase letters, numbers and dashes.")); continue; }
      const bytes = await readFile(join(repoRoot, "public", "images", folder, name));
      const check = checkImage(bytes, type);
      if (!check.ok) { warnings.push(imageWarning(section, path, `Skipped: ${check.message}`)); continue; }
      images.push({ path, sha256: sha256Hex(bytes), contentType: check.contentType, size: bytes.length, width: check.width, height: check.height, data: bytes });
    }
  }

  const imported = new Set(images.map(i => i.path));
  for (const k of SECTION_KEYS) {
    for (const ref of imageRefsIn(content[k])) {
      if (imported.has(ref.path)) continue;
      warnings.push({ section: k, key: ref.key, label: errorLabel(k, content[k], ref.key), message: `Uses ${ref.path}, which isn't in the photos being imported. Upload the photo again.` });
    }
  }
  return { sections: content, images, warnings };
}

export const notEmpty = () =>
  new HttpError(409, "not_empty", "The database already has content, so the starting copy can't be imported again. Use History to go back to an earlier version.");

/** Stores the images and makes release 1. Run inside one transaction; refuses when any release exists. */
export async function importStartingInStore(store: ContentStore, copy: StartingCopy, actor: ActorRef, now: Date): Promise<{ release: ReleaseDoc; imagesAdded: number }> {
  if (await store.latestRelease()) throw notEmpty();
  let imagesAdded = 0;
  for (const image of copy.images) if ((await store.addImage(image, now, actor)).added) imagesAdded++;
  const release = await writeRelease(store, {
    live: null, liveContent: null, content: copy.sections,
    versions: Object.fromEntries(SECTION_KEYS.map(k => [k, 0])) as ReleaseDoc["versions"],
    newVersions: SECTION_KEYS, changed: SECTION_KEYS,
    actor, now, note: "Imported starting content", source: "import", restoredFrom: null, merged: [],
  });
  return { release, imagesAdded };
}

/**
 * POST /api/import-starting-content (behind requireOwner) → StartingContentResponse. The body may be {} or
 * { deploy: true }. The site rebuild is requested only with deploy: true and no warnings (otherwise deploy.state is
 * "skipped"): with warnings the owner fixes them in the admin, and that publish rebuilds the site.
 */
export function importStartingContentHandler(deps: AppDeps): Handler<StartingContentResponse> {
  return async (req, res) => {
    const auth = getAuth(res);
    const askDeploy = booleanField(jsonBody(req), "deploy", "deploy");
    const copy = await readStartingCopy(deps.repoRoot);
    const actor = actorOf(auth);
    const now = deps.now();
    const { release, imagesAdded } = await mongoTransaction(deps)(store => importStartingInStore(store, copy, actor, now));
    await writeAudit(deps, req, {
      action: "import_starting_content", actor, target: releaseTarget(release._id),
      detail: `${imagesAdded} photos added, ${copy.warnings.length} warnings`,
    });
    // The build refuses content that breaks the rules, so a rebuild only helps once there are no rule warnings
    const deploy = askDeploy && !copy.warnings.length
      ? await deployRelease(deps, req, actor, release._id)
      : await skipDeploy(deps, release._id, now, copy.warnings.length ? SKIPPED_WARNINGS : SKIPPED_NOT_ASKED);
    res.json({ release: release._id, imagesAdded, warnings: copy.warnings, deploy });
  };
}

const SKIPPED_WARNINGS = "The site wasn't rebuilt: fix the problems listed after the import, then publish. That publish rebuilds the site.";
const SKIPPED_NOT_ASKED = "The site wasn't rebuilt: it already shows the starting content.";

/**
 * Records that no rebuild was requested for this release (so the dashboard shows why, instead of waiting for a
 * build that never comes). Never throws.
 */
async function skipDeploy(deps: AppDeps, release: number, at: Date, reason: string): Promise<DeployInfo> {
  try {
    await (await readStore(deps)).saveDeploy(release, "skipped", reason, at);
  } catch (e) {
    deps.log.warn("deploy_record_failed", { release, errorName: (e as Error)?.name });
  }
  return { state: "skipped", at: at.toISOString(), error: reason };
}
