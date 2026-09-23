import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ObjectId } from "mongodb";
import { SECTION_KEYS } from "../../shared/sections.ts";
import { readStartingCopy } from "../content/starting.ts";
import { Binary, type ImageDoc, type ReleaseDoc, type UserDoc } from "../db.ts";
import { HttpError } from "../http/errors.ts";
import { BACKUP_FORMAT, buildBackupFile, parseBackup } from "./backup.ts";

const ROOT = path.resolve(import.meta.dirname, "../..", "frontend"); // the starting copy lives in the frontend project
const NOW = new Date("2026-09-22T10:00:00.000Z");
const LEAD = { id: null, name: "Web lead" };

/** A backup of the starting copy as release 1, with a few of its photos and one account. */
async function sampleBackup() {
  const start = await readStartingCopy(ROOT);
  const versions = SECTION_KEYS.map(k => ({ section: k, n: 1, content: start.sections[k], createdAt: NOW, createdBy: LEAD, release: 1 }));
  const release: ReleaseDoc = {
    _id: 1, publishedAt: NOW, publishedBy: LEAD, note: "Starting content", source: "import", restoredFrom: null, merged: [],
    versions: Object.fromEntries(SECTION_KEYS.map(k => [k, 1])) as ReleaseDoc["versions"], changed: [...SECTION_KEYS], summaries: {}, images: [],
  };
  const images: ImageDoc[] = start.images.slice(0, 3).map(i => ({
    _id: i.path, sha256: i.sha256, folder: "team", contentType: i.contentType, size: i.size, width: i.width, height: i.height,
    data: new Binary(i.data), createdAt: NOW, createdBy: LEAD,
  }));
  const owner: UserDoc = {
    _id: new ObjectId(), username: "lead", displayName: "Web lead", role: "owner", status: "active", passphraseHash: "scrypt$131072$8$1$secret$hash",
    passphraseChangedAt: NOW, createdAt: NOW, createdBy: LEAD, lastLoginAt: null, deactivatedAt: null,
  };
  return { start, file: buildBackupFile(NOW, [release], versions, images, [owner]) };
}

test("a backup has every part, lists accounts, and never holds passphrase hashes", async () => {
  const { start, file } = await sampleBackup();
  assert.equal(file.format, BACKUP_FORMAT);
  assert.equal(file.version, 1);
  assert.equal(file.release, 1);
  assert.equal(file.sectionVersions.length, SECTION_KEYS.length);
  const text = JSON.stringify(file);
  assert.ok(!text.includes("scrypt$") && !/passphrase/i.test(text), "no hashes in the backup");
  assert.deepEqual(file.accounts, [{ username: "lead", displayName: "Web lead", role: "owner", status: "active", createdAt: NOW.toISOString() }]);
  assert.ok(Buffer.from(file.images[0].data, "base64").equals(Buffer.from(start.images[0].data)));
});

test("a backup reads back as the same content, images and warnings", async () => {
  const { start, file } = await sampleBackup();
  const parsed = parseBackup(JSON.parse(JSON.stringify(file)));
  assert.equal(parsed.release, 1);
  assert.equal(parsed.createdAt, NOW.toISOString());
  assert.deepEqual(parsed.sections, start.sections);
  assert.equal(parsed.images.length, 3);
  assert.deepEqual(parsed.images.map(i => [i.path, i.sha256, i.size]), start.images.slice(0, 3).map(i => [i.path, i.sha256, i.size]));
  // The starting copy passes every rule, so a backup of it comes back without warnings
  assert.deepEqual(parsed.warnings, []);
});

test("damaged or foreign backup files are refused with a plain reason", async () => {
  const { file } = await sampleBackup();
  const refuse = (raw: unknown, why: RegExp) =>
    assert.throws(() => parseBackup(raw), (e: unknown) => e instanceof HttpError && e.status === 400 && e.code === "bad_request" && why.test(e.message), String(why));
  refuse(null, /isn't an admin backup/);
  refuse({ format: "something-else" }, /isn't an admin backup/);
  refuse({ ...file, version: 2 }, /newer version/);
  refuse({ ...file, release: 0 }, /no published content/);
  refuse({ ...file, release: 7 }, /release 7 isn't in it/);
  refuse({ ...file, images: "x" }, /parts of it are missing/);
  refuse({ ...file, sectionVersions: file.sectionVersions.filter(v => v.section !== "home") }, /home content/);
  const img = file.images[0];
  refuse({ ...file, images: [{ ...img, sha256: "0".repeat(64) }] }, /checksum/);
  refuse({ ...file, images: [{ ...img, path: "/images/team/../x.webp" }] }, /address/);
  refuse({ ...file, images: [{ ...img, contentType: "image/jpeg" }] }, /wrong type/);
  refuse({ ...file, images: [{ ...img, data: Buffer.from("<svg/>").toString("base64"), sha256: "c".repeat(64) }] }, /checksum/);
});
