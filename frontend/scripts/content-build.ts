/**
 * The build-time content pull. `npm run build` runs scripts/fetch-content.ts first (the "prebuild" script), which
 * calls run() here. Types and paths come from shared/api.ts.
 *
 * With CONTENT_EXPORT_URL set (Vercel):
 * 1. GET the published content from the admin server (Render) with `Authorization: Bearer CONTENT_EXPORT_TOKEN`,
 *    retrying for about 3 minutes, because a sleeping Render service takes up to a minute to wake.
 * 2. Check and normalise every section with shared/validate.ts. Content that breaks a rule stops the build with a
 *    list of the problems: Vercel then keeps the current site online instead of publishing broken content.
 * 3. Download the images the content uses that are missing from public/images or differ from the published ones
 *    (compared by SHA-256), and check every download against its SHA-256.
 * 4. Write src/data/<section>.json, the images, public/content-snapshot.json (the content baked into this build)
 *    and public/content-version.json (the release number the admin waits for after Publish).
 *
 * If the admin server can't be reached (or nothing is published there), the build copies the content that is live
 * right now from https://$VERCEL_PROJECT_PRODUCTION_URL/content-snapshot.json and its images, so content never
 * goes back to the old repository files. Only when the live site has no snapshot at all (the very first deploy)
 * does the build keep the repository's src/data, and it writes content-version.json with release 0.
 *
 * Without CONTENT_EXPORT_URL (your computer) it does nothing, so the build uses src/data as it is.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CONTENT_SNAPSHOT_PATH, CONTENT_VERSION_PATH, ROUTES,
  type ContentSnapshot, type ContentSource, type ContentVersion, type ExportImage,
} from "../../shared/api.ts";
import type { SectionContent } from "../../shared/content.ts";
import {
  IMAGE_EXTENSION, SECTION_FILES, SECTION_KEYS, SECTION_LABELS, SHA256_RE, isImagePath, isImageType, type SectionKey,
} from "../../shared/sections.ts";
import { checkSection, listErrors } from "../../shared/validate.ts";

/* ---------- Settings and dependencies ---------- */

export type Env = Record<string, string | undefined>;

export type Deps = {
  fetch: typeof globalThis.fetch;
  sleep: (ms: number) => Promise<void>;
  /** Milliseconds, like Date.now(). */
  now: () => number;
  log: (message: string) => void;
  warn: (message: string) => void;
  /** The repository root (src/data and public/ are written under it). */
  root: string;
};

export type Timing = {
  /** How long to keep trying the admin server (Render wakes in about a minute). */
  exportRetryMs: number;
  /** How long to keep trying the live site's snapshot. */
  snapshotRetryMs: number;
  /** Longest wait for one request (a waking Render service holds the request until it is up). */
  requestTimeoutMs: number;
  firstDelayMs: number;
  maxDelayMs: number;
  /** Tries per image download. */
  imageAttempts: number;
};

export const DEFAULT_TIMING: Timing = {
  exportRetryMs: 180_000,
  snapshotRetryMs: 30_000,
  requestTimeoutMs: 90_000,
  firstDelayMs: 2_000,
  maxDelayMs: 20_000,
  imageAttempts: 3,
};

/* ---------- Errors ---------- */

/** Stops the build: wrong settings or content that breaks the rules. Never retried and never hidden by the fallback. */
export class FatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FatalError";
  }
}
/** Worth trying again: the server is waking, the network failed, or a 5xx answer. */
class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableError";
  }
}
/** The admin server answered 409 not_initialised: nothing is published there yet. */
class NothingPublishedError extends Error {
  constructor() {
    super("Nothing is published in the admin yet.");
    this.name = "NothingPublishedError";
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ---------- Addresses ---------- */

export type ExportEndpoints = { published: string; image: (sha256: string) => string };

const isLocalHost = (host: string) => host === "localhost" || host === "127.0.0.1" || host === "[::1]";

/**
 * CONTENT_EXPORT_URL is the Render service's export address, e.g. https://cis-admin.onrender.com/api/export/published.
 * Just the service address (https://cis-admin.onrender.com) works too. Plain http is allowed only for localhost.
 */
export function exportEndpoints(raw: string): ExportEndpoints {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new FatalError(`CONTENT_EXPORT_URL isn't a valid address: "${raw}".`); }
  if (url.username || url.password) throw new FatalError("CONTENT_EXPORT_URL must not contain a user name or password (the token goes in CONTENT_EXPORT_TOKEN).");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalHost(url.hostname)))
    throw new FatalError("CONTENT_EXPORT_URL must start with https:// (for example https://cis-admin.onrender.com/api/export/published).");
  let prefix = url.pathname.replace(/\/+$/, "");
  if (prefix.endsWith(ROUTES.exportPublished)) prefix = prefix.slice(0, -ROUTES.exportPublished.length);
  const base = url.origin + prefix;
  return {
    published: base + ROUTES.exportPublished,
    image: sha256 => base + ROUTES.exportImage.replace(":sha", encodeURIComponent(sha256)),
  };
}

/** VERCEL_PROJECT_PRODUCTION_URL is a host name such as ieee-cis-rec.vercel.app (Vercel sets it during builds). */
export function liveSiteOrigin(raw: string | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  try {
    const url = new URL(v.includes("://") ? v : `https://${v}`);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalHost(url.hostname))) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/* ---------- Checking what the server (or the snapshot) sent ---------- */

export type PublishedContent = { release: number; publishedAt: string; sections: SectionContent; images: ExportImage[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Every image path used anywhere in the content (posters, photos, achievement images). */
export function imagePathsIn(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === "string") { if (isImagePath(value)) into.add(value); }
  else if (Array.isArray(value)) value.forEach(v => imagePathsIn(v, into));
  else if (isRecord(value)) Object.values(value).forEach(v => imagePathsIn(v, into));
  return into;
}

/**
 * Checks an ExportPublished (or ContentSnapshot) body and returns it with every section normalised.
 * Throws a FatalError listing every problem, in plain words, so the build log says exactly what to fix.
 */
export function parsePublished(body: unknown, from: string): PublishedContent {
  const problems: string[] = [];
  if (!isRecord(body)) throw new FatalError(`${from} didn't send published content (expected a JSON object).`);

  const release = body.release;
  if (typeof release !== "number" || !Number.isInteger(release) || release < 1) problems.push("release must be a whole number from 1 up.");
  const publishedAt = body.publishedAt;
  if (typeof publishedAt !== "string" || Number.isNaN(Date.parse(publishedAt))) problems.push("publishedAt must be a date.");

  const sections: Partial<Record<SectionKey, unknown>> = {};
  if (!isRecord(body.sections)) problems.push("sections is missing.");
  else {
    for (const key of SECTION_KEYS) {
      if (!(key in body.sections)) { problems.push(`The ${SECTION_LABELS[key]} section is missing.`); continue; }
      const result = checkSection(key, body.sections[key]);
      sections[key] = result.value;
      for (const item of listErrors(key, result.value, result.errors)) problems.push(`${SECTION_LABELS[key]}: ${item.label}: ${item.message}`);
    }
  }

  const images: ExportImage[] = [];
  const paths = new Set<string>();
  if (!Array.isArray(body.images)) problems.push("images must be a list.");
  else {
    body.images.forEach((raw: unknown, i) => {
      const img = isRecord(raw) ? raw : {};
      const { path: p, sha256, contentType, size } = img;
      if (!isImagePath(p)) { problems.push(`Image ${i + 1} has an address that isn't an image address: ${JSON.stringify(p)}.`); return; }
      if (typeof sha256 !== "string" || !SHA256_RE.test(sha256)) { problems.push(`${p}: the SHA-256 isn't valid.`); return; }
      if (!isImageType(contentType)) { problems.push(`${p}: the type must be image/webp or image/jpeg.`); return; }
      if (!p.endsWith(`.${IMAGE_EXTENSION[contentType]}`)) { problems.push(`${p}: the file ending doesn't match its type (${contentType}).`); return; }
      if (typeof size !== "number" || !Number.isInteger(size) || size < 1) { problems.push(`${p}: the size isn't valid.`); return; }
      if (paths.has(p)) { problems.push(`${p} is listed twice.`); return; }
      paths.add(p);
      images.push({ path: p, sha256, contentType, size });
    });
  }

  if (!problems.length) {
    for (const used of imagePathsIn(sections)) {
      if (!paths.has(used)) problems.push(`The content uses ${used}, but that image isn't in the list of published images.`);
    }
  }

  if (problems.length) {
    throw new FatalError(
      `The content from ${from} can't be built. Fix these in the admin and publish again:\n${problems.map(p => `  - ${p}`).join("\n")}`,
    );
  }
  return { release: release as number, publishedAt: publishedAt as string, sections: sections as SectionContent, images };
}

/* ---------- Images ---------- */

export const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Where an image path lives on disk (public/images/...). Refuses anything outside public/images. */
export function imageFile(root: string, imagePath: string): string {
  if (!isImagePath(imagePath)) throw new FatalError(`Not an image address: ${imagePath}`);
  const dir = path.resolve(root, "public", "images");
  const file = path.resolve(root, "public", ...imagePath.split("/").filter(Boolean));
  if (!file.startsWith(dir + path.sep)) throw new FatalError(`Not an image address: ${imagePath}`);
  return file;
}

/** The images that are missing from public/images or whose bytes differ from the published ones. */
export async function imagesToDownload(root: string, images: ExportImage[]): Promise<ExportImage[]> {
  const needed: ExportImage[] = [];
  for (const img of images) {
    let current: Buffer | null = null;
    try { current = await readFile(imageFile(root, img.path)); } catch (e) { if (e instanceof FatalError) throw e; }
    if (!current || sha256Hex(current) !== img.sha256) needed.push(img);
  }
  return needed;
}

/* ---------- Fetching ---------- */

type Attempt<T> = (timeoutMs: number) => Promise<T>;
type Redirect = RequestInit["redirect"];

/** Tries until `attempt` succeeds, fails with something other than a RetryableError, or `budgetMs` runs out. */
async function withRetries<T>(what: string, budgetMs: number, deps: Deps, timing: Timing, attempt: Attempt<T>): Promise<T> {
  const deadline = deps.now() + budgetMs;
  for (let n = 1; ; n++) {
    const left = deadline - deps.now();
    try {
      return await attempt(Math.max(1_000, Math.min(timing.requestTimeoutMs, left)));
    } catch (e) {
      if (!(e instanceof RetryableError)) throw e;
      const wait = Math.min(timing.maxDelayMs, timing.firstDelayMs * 2 ** (n - 1));
      if (deps.now() + wait >= deadline) throw new RetryableError(`${e.message} (gave up after ${n} ${n === 1 ? "try" : "tries"})`);
      deps.log(`fetch-content: ${what}: ${e.message}. Trying again in ${Math.round(wait / 1000)} s.`);
      await deps.sleep(wait);
    }
  }
}

async function request(deps: Deps, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  try {
    return await deps.fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new RetryableError(`no answer (${e instanceof Error && e.name === "TimeoutError" ? "timed out" : message(e)})`);
  }
}

/** Reads a JSON body, or returns undefined when the answer isn't JSON (for example Render's page while it wakes). */
async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return undefined; }
}

const errorCode = (body: unknown) => (isRecord(body) && typeof body.code === "string" ? body.code : null);
const retryableStatus = (status: number) => status === 408 || status === 425 || status === 429 || status >= 500;

/** GET the published content from the admin server. */
async function fetchPublished(deps: Deps, endpoints: ExportEndpoints, token: string, timeoutMs: number): Promise<unknown> {
  const res = await request(deps, endpoints.published, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    redirect: "error",
  }, timeoutMs);
  const body = await readJson(res).catch(() => undefined);
  const code = errorCode(body);
  if (res.ok) {
    if (body === undefined) throw new RetryableError("the admin server answered with a page instead of content (it may still be waking)");
    return body;
  }
  if (res.status === 401 || res.status === 403)
    throw new FatalError(`The admin server refused the export token (${res.status}). Vercel's CONTENT_EXPORT_TOKEN must be exactly Render's EXPORT_TOKEN.`);
  if (res.status === 409 && code === "not_initialised") throw new NothingPublishedError();
  if (code === "not_configured") throw new FatalError("The admin server has no EXPORT_TOKEN set. Add it in Render's Environment settings.");
  if (res.status === 404) throw new FatalError(`${endpoints.published} doesn't exist (404). Check CONTENT_EXPORT_URL in Vercel.`);
  if (retryableStatus(res.status)) throw new RetryableError(`the admin server answered ${res.status}${code ? ` (${code})` : ""}`);
  throw new FatalError(`The admin server answered ${res.status}${code ? ` (${code})` : ""} to the export request.`);
}

/** GET one image and check it is exactly the published file. */
async function fetchImage(deps: Deps, timing: Timing, img: ExportImage, url: string, headers: Record<string, string>, redirect: Redirect) {
  let lastError = "";
  for (let n = 1; n <= timing.imageAttempts; n++) {
    try {
      const res = await request(deps, url, { headers, redirect }, timing.requestTimeoutMs);
      if (!res.ok) throw retryableStatus(res.status) ? new RetryableError(`answered ${res.status}`) : new FatalError(`${img.path}: the download answered ${res.status}.`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (sha256Hex(bytes) !== img.sha256) throw new FatalError(`${img.path}: the downloaded file doesn't match its SHA-256, so it was not used.`);
      return bytes;
    } catch (e) {
      if (!(e instanceof RetryableError)) throw e;
      lastError = e.message;
      if (n < timing.imageAttempts) await deps.sleep(timing.firstDelayMs * n);
    }
  }
  throw new RetryableError(`${img.path}: ${lastError}`);
}

/* ---------- The two sources ---------- */

type Pulled = { source: Exclude<ContentSource, "repo">; content: PublishedContent; files: Map<string, Uint8Array> };

async function downloadImages(deps: Deps, timing: Timing, images: ExportImage[], urlFor: (img: ExportImage) => string,
  headers: Record<string, string>, redirect: Redirect): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  for (const img of await imagesToDownload(deps.root, images)) files.set(img.path, await fetchImage(deps, timing, img, urlFor(img), headers, redirect));
  return files;
}

async function pullFromExport(deps: Deps, timing: Timing, endpoints: ExportEndpoints, token: string): Promise<Pulled> {
  const body = await withRetries("admin server", timing.exportRetryMs, deps, timing, t => fetchPublished(deps, endpoints, token, t));
  const content = parsePublished(body, "the admin server");
  const files = await downloadImages(deps, timing, content.images, img => endpoints.image(img.sha256), { Authorization: `Bearer ${token}` }, "error");
  return { source: "export", content, files };
}

/** The live site's snapshot, or null when the live site has none (the very first deploy). */
async function pullFromSnapshot(deps: Deps, timing: Timing, origin: string): Promise<Pulled | null> {
  const url = origin + CONTENT_SNAPSHOT_PATH;
  let body: unknown;
  try {
    body = await withRetries("live site", timing.snapshotRetryMs, deps, timing, async t => {
      const res = await request(deps, url, { headers: { Accept: "application/json" }, redirect: "follow" }, t);
      if (res.status === 404) return null;
      if (retryableStatus(res.status)) throw new RetryableError(`the live site answered ${res.status}`);
      if (!res.ok) throw new FatalError(`${url} answered ${res.status}.`);
      // A site without the file answers with the page itself (the single-page-app fallback), so anything that
      // isn't JSON means there is no snapshot yet.
      return (await readJson(res)) ?? null;
    });
  } catch (e) {
    if (e instanceof RetryableError) throw new FatalError(`Couldn't reach the live site's snapshot at ${url} either (${e.message}).`);
    throw e;
  }
  if (body === null) return null;
  const content = parsePublished(body, url);
  const files = await downloadImages(deps, timing, content.images, img => origin + img.path, {}, "follow").catch(e => {
    throw e instanceof RetryableError ? new FatalError(`Couldn't copy an image from the live site: ${e.message}.`) : e;
  });
  return { source: "snapshot", content, files };
}

/* ---------- Writing ---------- */

/** Writes via a temporary file, so a failed write never leaves half a file behind. */
async function writeFileSafely(file: string, data: string | Uint8Array) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

const publicFile = (root: string, sitePath: string) => path.join(root, "public", ...sitePath.split("/").filter(Boolean));

export const sectionJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

async function writeVersion(root: string, version: ContentVersion) {
  await writeFileSafely(publicFile(root, CONTENT_VERSION_PATH), `${JSON.stringify(version)}\n`);
}

async function writePulled(root: string, pulled: Pulled, builtAt: string) {
  const { content } = pulled;
  for (const [imagePath, bytes] of pulled.files) await writeFileSafely(imageFile(root, imagePath), bytes);
  for (const key of SECTION_KEYS) await writeFileSafely(path.join(root, ...SECTION_FILES[key].split("/")), sectionJson(content.sections[key]));
  const snapshot: ContentSnapshot = { release: content.release, publishedAt: content.publishedAt, sections: content.sections, images: content.images, builtAt };
  await writeFileSafely(publicFile(root, CONTENT_SNAPSHOT_PATH), `${JSON.stringify(snapshot)}\n`);
  await writeVersion(root, { release: content.release, builtAt, source: pulled.source });
}

/* ---------- The whole step ---------- */

export type RunResult =
  | { source: null }
  | { source: ContentSource; release: number; imagesWritten: number };

export async function run(env: Env, deps: Deps, timing: Timing = DEFAULT_TIMING): Promise<RunResult> {
  const exportUrl = env.CONTENT_EXPORT_URL?.trim();
  if (!exportUrl) {
    deps.log("fetch-content: CONTENT_EXPORT_URL isn't set, so the build uses the content in src/data.");
    return { source: null };
  }
  const token = env.CONTENT_EXPORT_TOKEN?.trim();
  if (!token) throw new FatalError("CONTENT_EXPORT_URL is set but CONTENT_EXPORT_TOKEN isn't. Add Render's EXPORT_TOKEN to Vercel as CONTENT_EXPORT_TOKEN.");
  const endpoints = exportEndpoints(exportUrl);
  const builtAt = new Date(deps.now()).toISOString();

  let pulled: Pulled | null;
  try {
    deps.log("fetch-content: getting the published content from the admin server.");
    pulled = await pullFromExport(deps, timing, endpoints, token);
  } catch (e) {
    if (e instanceof FatalError) throw e;
    deps.warn(e instanceof NothingPublishedError
      ? "fetch-content: WARNING: nothing is published in the admin yet."
      : `fetch-content: WARNING: couldn't get the published content from the admin server: ${message(e)}.`);
    const origin = liveSiteOrigin(env.VERCEL_PROJECT_PRODUCTION_URL);
    if (!origin) throw new FatalError("VERCEL_PROJECT_PRODUCTION_URL isn't set, so there is no live site to copy the content from. Stopping, so the site doesn't go back to old content.");
    deps.warn(`fetch-content: WARNING: using the content that is live now, from ${origin}${CONTENT_SNAPSHOT_PATH}.`);
    pulled = await pullFromSnapshot(deps, timing, origin);
    if (!pulled) {
      deps.warn("fetch-content: WARNING: the live site has no content snapshot yet (first deploy), so this build uses the content in src/data.");
      await writeVersion(deps.root, { release: 0, builtAt, source: "repo" });
      return { source: "repo", release: 0, imagesWritten: 0 };
    }
  }

  await writePulled(deps.root, pulled, builtAt);
  const n = pulled.files.size;
  deps.log(`fetch-content: built release #${pulled.content.release} from ${pulled.source === "export" ? "the admin server" : "the live site's snapshot"}`
    + ` (${SECTION_KEYS.length} sections, ${n} new or changed ${n === 1 ? "image" : "images"}).`);
  return { source: pulled.source, release: pulled.content.release, imagesWritten: n };
}
