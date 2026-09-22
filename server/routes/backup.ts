/**
 * Backups and the one-time import of the starting content, for the owner only (types in shared/api.ts).
 *
 * - GET /api/backup: one JSON file (BackupFile) with every release, every section version and every image
 *   (base64), plus the account list WITHOUT passphrase hashes, sessions or links (`accounts`, so people can be
 *   re-invited after a disaster). Records meta "last-backup" (the owner's dashboard reminder reads it through
 *   GET /api/auth/session → owner.lastBackupAt). Audit "backup_download".
 * - POST /api/backup/import: always "a new release on top", whether the database is empty or not. The backup's
 *   images that the database doesn't have are added first (checked like uploads; a stored path is never
 *   overwritten), then the backup's live release content becomes a new release (source "backup") in one
 *   transaction. Nothing is removed and accounts are never touched. The older releases inside the file are not
 *   replayed: the file itself stays the archive of that history. The content is normalised but not blocked by the
 *   rules (it was live before); problems come back as `warnings`. Audit "backup_import", then the site rebuild,
 *   which is skipped (deploy state "skipped", like the starting content) when there are warnings: the build refuses
 *   rule breaks, so the owner fixes them in the admin and that publish rebuilds the site.
 * - POST /api/import-starting-content: the content builder's handler (server/content/starting.ts).
 * Release writing, image checks and the deploy hook are shared with publishing (server/content/*).
 */
import express, { type Router } from "express";
import {
  LIMITS, ROUTES,
  type BackupFile, type BackupImage, type BackupImportResponse, type DeployInfo, type BackupRelease, type BackupSectionVersion,
} from "../../shared/api.ts";
import type { SectionContent } from "../../shared/content.ts";
import { sameContent } from "../../shared/merge.ts";
import { SECTION_KEYS, SHA256_RE, isImagePath, isImageType, isSectionKey, type SectionKey } from "../../shared/sections.ts";
import { checkSection, listErrors, type ErrorItem } from "../../shared/validate.ts";
import { actorOf, recordAudit, requestIpHash } from "../auth/audit.ts";
import { getAuth, requireOwner } from "../auth/middleware.ts";
import { releaseTarget, writeAudit } from "../content/audit.ts";
import { deployRelease } from "../content/deploy.ts";
import { binaryToBuffer, checkImage, imagePathsIn, sha256Hex, typeFromFileName } from "../content/images.ts";
import { missingImages, writeRelease } from "../content/publish.ts";
import { importStartingContentHandler } from "../content/starting.ts";
import { loadAllSections, mongoTransaction, readStore, versionMap, type NewImage } from "../content/store.ts";
import type { ActorRef, ImageDoc, ReleaseDoc, UserDoc } from "../db.ts";
import type { AppDeps } from "../deps.ts";
import { badRequest } from "../http/errors.ts";
import { jsonBody, textField } from "../http/body.ts";
import type { Handler } from "../http/handler.ts";

export function register(router: Router, deps: AppDeps): void {
  // app.ts skips its 2 MB JSON parser for this route, so a whole backup (images as base64) fits
  const backupBody = express.json({ limit: LIMITS.backupBodyBytes, strict: true, type: "application/json" });
  router.get(ROUTES.backup, requireOwner(deps), downloadBackup(deps));
  router.post(ROUTES.backupImport, requireOwner(deps), backupBody, importBackup(deps));
  router.post(ROUTES.importStartingContent, requireOwner(deps), importStartingContentHandler(deps));
}

export const BACKUP_FORMAT = "ieee-cis-admin-backup";

/** Accounts as a backup lists them: no ids, hashes, sessions or links. */
export type BackupAccount = Pick<UserDoc, "username" | "displayName" | "role" | "status"> & { createdAt: string };
/** What GET /api/backup sends: BackupFile plus the account list (an import ignores it). */
export type BackupFileWithAccounts = BackupFile & { accounts: BackupAccount[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isPositiveInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

/* ================= Writing a backup ================= */

const toBackupRelease = (r: ReleaseDoc): BackupRelease => ({
  release: r._id, publishedAt: r.publishedAt.toISOString(), publishedBy: r.publishedBy.name, note: r.note,
  versions: r.versions, changed: r.changed, source: r.source, restoredFrom: r.restoredFrom,
});

type VersionRow = { section: SectionKey; n: number; content: unknown; createdAt: Date; createdBy: ActorRef; release: number };

/** The backup file from the database documents (pure, for tests). */
export function buildBackupFile(now: Date, releases: ReleaseDoc[], versions: VersionRow[], images: ImageDoc[], users: UserDoc[]): BackupFileWithAccounts {
  const sorted = [...releases].sort((a, b) => a._id - b._id);
  return {
    format: BACKUP_FORMAT,
    version: 1,
    createdAt: now.toISOString(),
    release: sorted.at(-1)?._id ?? 0,
    releases: sorted.map(toBackupRelease),
    sectionVersions: versions.map((v): BackupSectionVersion => ({
      section: v.section, n: v.n, content: v.content, createdAt: v.createdAt.toISOString(), createdBy: v.createdBy.name, release: v.release,
    })),
    images: images.map((i): BackupImage => ({
      path: i._id, sha256: i.sha256, contentType: i.contentType, width: i.width, height: i.height, size: i.size,
      data: binaryToBuffer(i.data).toString("base64"),
    })),
    accounts: users.map(u => ({ username: u.username, displayName: u.displayName, role: u.role, status: u.status, createdAt: u.createdAt.toISOString() })),
  };
}

/* ================= Reading a backup ================= */

export type ParsedBackup = {
  createdAt: string;
  release: number;
  /** The content of the backup's live release, normalised (not blocked by the rules). */
  sections: SectionContent;
  warnings: ErrorItem[];
  images: NewImage[];
};

const damaged = (why: string) => badRequest(`This backup file can't be used: ${why}`);

/** Checks a BackupFile from a request (pure, for tests). Throws 400 with a plain reason when it's unusable. */
export function parseBackup(raw: unknown): ParsedBackup {
  if (!isRecord(raw) || raw.format !== BACKUP_FORMAT) throw damaged("it isn't an admin backup.");
  if (raw.version !== 1) throw damaged("it was made by a newer version of the admin.");
  if (!isPositiveInt(raw.release)) throw damaged("it has no published content.");
  if (!Array.isArray(raw.releases) || !Array.isArray(raw.sectionVersions) || !Array.isArray(raw.images)) throw damaged("parts of it are missing.");
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt.slice(0, 40) : "";

  const live = raw.releases.find(r => isRecord(r) && r.release === raw.release);
  if (!isRecord(live) || !isRecord(live.versions)) throw damaged(`release ${raw.release} isn't in it.`);
  const liveVersions = live.versions;
  const versionOf = new Map<string, unknown>();
  for (const v of raw.sectionVersions) if (isRecord(v) && isSectionKey(v.section) && isPositiveInt(v.n)) versionOf.set(`${v.section}:${v.n}`, v.content);

  const sections = {} as Record<SectionKey, unknown>;
  const warnings: ErrorItem[] = [];
  for (const k of SECTION_KEYS) {
    const n = liveVersions[k];
    const key = `${k}:${String(n)}`;
    if (!isPositiveInt(n) || !versionOf.has(key)) throw damaged(`the ${k} content of release ${raw.release} is missing.`);
    const checked = checkSection(k, versionOf.get(key));
    sections[k] = checked.value;
    if (!checked.ok) warnings.push(...listErrors(k, checked.value, checked.errors));
  }

  const images: NewImage[] = [];
  const seen = new Set<string>();
  for (const img of raw.images) {
    if (!isRecord(img) || typeof img.path !== "string" || typeof img.data !== "string") throw damaged("an image entry is damaged.");
    if (seen.has(img.path)) continue;
    seen.add(img.path);
    const name = img.path.slice(0, 200);
    if (!isImagePath(img.path)) throw damaged(`the image ${name} has an address the site can't use.`);
    if (!isImageType(img.contentType) || typeFromFileName(img.path) !== img.contentType) throw damaged(`the image ${name} has the wrong type.`);
    if (typeof img.sha256 !== "string" || !SHA256_RE.test(img.sha256)) throw damaged(`the image ${name} has no checksum.`);
    const bytes = Buffer.from(img.data, "base64");
    if (sha256Hex(bytes) !== img.sha256) throw damaged(`the image ${name} doesn't match its checksum.`);
    const check = checkImage(bytes, img.contentType);
    if (!check.ok) throw damaged(`the image ${name}: ${check.message}`);
    images.push({ path: img.path, sha256: img.sha256, contentType: check.contentType, size: bytes.length, width: check.width, height: check.height, data: bytes });
  }
  return { createdAt, release: raw.release, sections: sections as SectionContent, warnings, images };
}

/* ================= Handlers ================= */

/** GET /api/backup → BackupFile (as a download). */
const downloadBackup = (deps: AppDeps): Handler<BackupFile> => async (req, res) => {
  const auth = getAuth(res);
  const c = await deps.db.collections();
  const [releases, versions, images, users] = await Promise.all([
    c.releases.find({}).sort({ _id: 1 }).toArray(),
    c.sectionVersions.find({}).sort({ section: 1, n: 1 }).toArray(),
    c.images.find({}).sort({ _id: 1 }).toArray(),
    c.users.find({}, { projection: { passphraseHash: 0 } }).toArray(),
  ]);
  const now = deps.now();
  const file = buildBackupFile(now, releases, versions, images, users);
  const actor = actorOf(auth);
  await c.meta.updateOne({ _id: "last-backup" }, { $set: { at: now, by: actor } }, { upsert: true });
  await recordAudit(deps, { action: "backup_download", actor, target: releaseTarget(file.release), detail: `${file.releases.length} releases, ${file.images.length} images.`, ipHash: requestIpHash(deps, req) }, { collections: c });
  res.set("Content-Disposition", `attachment; filename="cis-backup-${now.toISOString().slice(0, 10)}.json"`);
  res.json(file);
};

/** POST /api/backup/import: BackupImportRequest → BackupImportResponse. */
const importBackup = (deps: AppDeps): Handler<BackupImportResponse> => async (req, res) => {
  const auth = getAuth(res);
  const body = jsonBody(req);
  const backup = parseBackup(body.backup);
  // The file's own date goes into the note and the activity log, so only a plain date is used
  const made = /^\d{4}-\d{2}-\d{2}/.test(backup.createdAt) ? backup.createdAt.slice(0, 10) : "an unknown date";
  const note = textField(body, "note", { label: "Note", max: LIMITS.noteMaxLength, required: false }).trim()
    || `Restored release ${backup.release} from the backup of ${made}`;
  const actor = actorOf(auth);
  const now = deps.now();

  // Images first: they are only ever added, so this is harmless if the release below fails
  const store = await readStore(deps);
  let imagesAdded = 0;
  for (const image of backup.images) if ((await store.addImage(image, now, actor)).added) imagesAdded++;
  const needed = imagePathsIn(backup.sections);
  const stored = new Set((await store.imageInfo(needed)).map(i => i.path));
  const missing = needed.filter(p => !stored.has(p));
  if (missing.length) throw missingImages(missing);

  const release = await mongoTransaction(deps)(async s => {
    const live = await s.latestRelease();
    const liveContent = live ? await loadAllSections(s, versionMap(live.versions)) : null;
    const changed = SECTION_KEYS.filter(k => !liveContent || !sameContent(liveContent[k], backup.sections[k]));
    if (!changed.length) throw badRequest("Nothing to restore: the backup's content is already live.");
    return writeRelease(s, {
      live, liveContent, content: backup.sections,
      versions: live ? versionMap(live.versions) : versionMap(Object.fromEntries(SECTION_KEYS.map(k => [k, 0])) as Record<SectionKey, number>),
      newVersions: changed, changed, actor, now, note, source: "backup", restoredFrom: null, merged: [],
    });
  });
  await writeAudit(deps, req, {
    action: "backup_import", actor, target: releaseTarget(release._id),
    detail: `From release ${backup.release} of the backup made ${made}; ${imagesAdded} ${imagesAdded === 1 ? "image" : "images"} added; changed: ${release.changed.join(", ")}.`,
  });
  // The build refuses content that breaks the rules, so a rebuild only helps once there are no warnings
  const deploy = backup.warnings.length ? await skipDeploy(deps, release._id, now) : await deployRelease(deps, req, actor, release._id);
  res.json({ release: release._id, imagesAdded, deploy, warnings: backup.warnings });
};

const SKIPPED_WARNINGS = "The site wasn't rebuilt: fix the problems listed after the import, then publish. That publish rebuilds the site.";

/** Records that no rebuild was requested for this release, so the dashboard shows why. Never throws. */
async function skipDeploy(deps: AppDeps, release: number, at: Date): Promise<DeployInfo> {
  try {
    await (await readStore(deps)).saveDeploy(release, "skipped", SKIPPED_WARNINGS, at);
  } catch (e) {
    deps.log.warn("deploy_record_failed", { release, errorName: (e as Error)?.name });
  }
  return { state: "skipped", at: at.toISOString(), error: SKIPPED_WARNINGS };
}
