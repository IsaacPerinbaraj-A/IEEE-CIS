/**
 * Passphrase hashing with scrypt from node:crypto (no extra packages).
 *
 * Stored as "scrypt$N$r$p$saltB64url$hashB64url", so the cost can be raised later: verification always uses the
 * parameters written in the stored hash, and needsRehash() tells the login route to store a fresh hash with the
 * current parameters after a successful sign-in.
 *
 * Current cost: N = 2^17, r = 8, p = 1 (128 MiB of memory per hash), 16-byte salt, 32-byte key. Render's free
 * instance has 512 MB, so at most one hash runs at a time and a few more wait; when the queue is full the request
 * gets 429 "busy" instead of risking the memory limit.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { LIMITS } from "../../shared/api.ts";
import { normalisePassphrase } from "../../shared/passphrase.ts";
import { HttpError } from "../http/errors.ts";

export type ScryptParams = { N: number; r: number; p: number; saltBytes: number; keyBytes: number };

/** The parameters for new hashes. */
export const SCRYPT_PARAMS: ScryptParams = { N: 2 ** 17, r: 8, p: 1, saltBytes: 16, keyBytes: 32 };
/** Node's default (32 MiB) is too small for N = 2^17, r = 8. */
export const SCRYPT_MAXMEM = 256 * 1024 * 1024;

/** What verification accepts from a stored hash (anything outside is treated as unusable). */
const BOUNDS = { minLogN: 10, maxLogN: 20, maxR: 32, maxP: 16, minSalt: 16, maxSalt: 64, minKey: 16, maxKey: 64 };

type Parsed = { params: ScryptParams; salt: Buffer; hash: Buffer };

const b64 = (b: Buffer) => b.toString("base64url");
const B64URL_RE = /^[A-Za-z0-9_-]+$/;

/* ---------- One hash at a time ---------- */

export type Limiter = <T>(fn: () => Promise<T>) => Promise<T>;

/**
 * Runs at most `concurrency` tasks at once; up to `maxQueue` more wait their turn. Beyond that it throws 429
 * (the server is busy), which also blunts floods of login attempts.
 */
export function createLimiter(concurrency: number, maxQueue: number): Limiter {
  let running = 0;
  const waiting: (() => void)[] = [];
  const release = () => {
    running--;
    const next = waiting.shift();
    if (next) { running++; next(); }
  };
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (running >= concurrency) {
      if (waiting.length >= maxQueue) throw busy();
      await new Promise<void>(resolve => waiting.push(resolve));
    } else {
      running++;
    }
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

export const busy = () => new HttpError(429, "too_many_attempts", "The server is busy. Try again in a few seconds.", { retryAfterSeconds: 5 });

const hashLimiter = createLimiter(1, 8);

function scrypt(passphrase: string, salt: Buffer, params: ScryptParams, keyBytes: number): Promise<Buffer> {
  const input = Buffer.from(normalisePassphrase(passphrase), "utf8");
  return hashLimiter(() => new Promise<Buffer>((resolve, reject) => {
    scryptCallback(input, salt, keyBytes, { N: params.N, r: params.r, p: params.p, maxmem: SCRYPT_MAXMEM }, (err, key) => {
      if (err) reject(err); else resolve(key);
    });
  }));
}

/* ---------- Format ---------- */

export function formatHash(params: ScryptParams, salt: Buffer, hash: Buffer): string {
  return ["scrypt", params.N, params.r, params.p, b64(salt), b64(hash)].join("$");
}

/** The parts of a stored hash, or null when it isn't a hash this code can check. */
export function parseHash(stored: string | null | undefined): Parsed | null {
  if (typeof stored !== "string") return null;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [, nText, rText, pText, saltText, hashText] = parts;
  if (![nText, rText, pText].every(t => /^[1-9]\d{0,7}$/.test(t))) return null;
  if (!B64URL_RE.test(saltText) || !B64URL_RE.test(hashText)) return null;
  const N = Number(nText), r = Number(rText), p = Number(pText);
  const logN = Math.log2(N);
  if (!Number.isInteger(logN) || logN < BOUNDS.minLogN || logN > BOUNDS.maxLogN) return null;
  if (r > BOUNDS.maxR || p > BOUNDS.maxP || 128 * N * r > SCRYPT_MAXMEM / 2) return null;
  const salt = Buffer.from(saltText, "base64url");
  const hash = Buffer.from(hashText, "base64url");
  if (salt.length < BOUNDS.minSalt || salt.length > BOUNDS.maxSalt || hash.length < BOUNDS.minKey || hash.length > BOUNDS.maxKey) return null;
  return { params: { N, r, p, saltBytes: salt.length, keyBytes: hash.length }, salt, hash };
}

/* ---------- Hash and verify ---------- */

/** A new stored hash for `passphrase` (normalised to NFC first). */
export async function hashPassphrase(passphrase: string, params: ScryptParams = SCRYPT_PARAMS): Promise<string> {
  const salt = randomBytes(params.saltBytes);
  const key = await scrypt(passphrase, salt, params, params.keyBytes);
  return formatHash(params, salt, key);
}

/** A hash that matches nothing, with the current cost, so unknown usernames take as long as real ones. */
let dummy: string | null = null;
export function dummyHash(params: ScryptParams = SCRYPT_PARAMS): string {
  if (params === SCRYPT_PARAMS && dummy) return dummy;
  const value = formatHash(params, randomBytes(params.saltBytes), randomBytes(params.keyBytes));
  if (params === SCRYPT_PARAMS) dummy = value;
  return value;
}

/**
 * True when `passphrase` matches `stored`. With no usable stored hash (unknown user, invited account, damaged
 * value) it still does the same work against a dummy hash and returns false, so timing reveals nothing.
 * Passphrases longer than LIMITS.passphraseMaxLength never match (and are checked against the dummy).
 */
export async function verifyPassphrase(passphrase: string, stored: string | null | undefined): Promise<boolean> {
  const tooLong = Array.from(normalisePassphrase(passphrase)).length > LIMITS.passphraseMaxLength;
  const parsed = tooLong ? null : parseHash(stored);
  const target = parsed ?? (parseHash(dummyHash()) as Parsed);
  const key = await scrypt(tooLong ? "" : passphrase, target.salt, target.params, target.hash.length);
  const same = key.length === target.hash.length && timingSafeEqual(key, target.hash);
  return !!parsed && same;
}

/** True when a stored hash uses other parameters than SCRYPT_PARAMS (store a new one after the next sign-in). */
export function needsRehash(stored: string | null | undefined, params: ScryptParams = SCRYPT_PARAMS): boolean {
  const parsed = parseHash(stored);
  if (!parsed) return false;
  const p = parsed.params;
  return p.N !== params.N || p.r !== params.r || p.p !== params.p || p.saltBytes !== params.saltBytes || p.keyBytes !== params.keyBytes;
}
