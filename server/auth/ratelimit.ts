/**
 * Brute-force limits, counted in MongoDB (`login_attempts`, TTL index), never in memory: Render's free instance
 * sleeps and restarts, and counters in memory would reset.
 *
 * - Per username ("u:<username>", also for usernames that don't exist): the first LIMITS.loginFreeFailures failures
 *   are free; after that each attempt waits loginBaseDelaySeconds × 2^(failures − loginFreeFailures), at most
 *   loginMaxDelaySeconds. Never a permanent lock. A success clears it; it expires loginCounterHours after the last
 *   failure.
 * - Per IP ("ip:<ipHash>:<window start>"): LIMITS.ipFailureLimit failures in a fixed LIMITS.ipWindowMinutes window
 *   block that IP until the window ends. IPs can be faked by calling Render directly, so this is a second line.
 * - Everyone ("g:<UTC hour>"): LIMITS.globalSpikeFailuresPerHour failures in an hour only write one audit entry.
 * - Setup links ("setup:<ipHash>:<UTC hour>"): LIMITS.setupAttemptsPerHour wrong tokens per IP per hour.
 * All checks run before any passphrase hashing. 429 answers are the same for real and unknown usernames.
 */
import type { Response } from "express";
import { LIMITS } from "../../shared/api.ts";
import type { Collections, LoginAttemptDoc } from "../db.ts";
import { HttpError } from "../http/errors.ts";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const IP_WINDOW_MS = LIMITS.ipWindowMinutes * MINUTE;

/* ---------- Pure rules ---------- */

/** Seconds to wait after `failures` failed sign-ins in a row for one username (0 while still free). */
export function usernameDelaySeconds(failures: number): number {
  if (failures < LIMITS.loginFreeFailures) return 0;
  const exponent = failures - LIMITS.loginFreeFailures;
  // 2^exponent grows fast; cap before multiplying so huge counts stay finite
  if (exponent >= 30) return LIMITS.loginMaxDelaySeconds;
  return Math.min(LIMITS.loginMaxDelaySeconds, LIMITS.loginBaseDelaySeconds * 2 ** exponent);
}

/** Start of the fixed per-IP window that contains `now`. */
export const ipWindowStart = (now: Date) => new Date(Math.floor(now.getTime() / IP_WINDOW_MS) * IP_WINDOW_MS);
/** Start of the UTC hour that contains `now`. */
export const hourStart = (now: Date) => new Date(Math.floor(now.getTime() / HOUR) * HOUR);
/** "2026-09-22T14" */
export const hourLabel = (now: Date) => hourStart(now).toISOString().slice(0, 13);

/** Counter ids. Usernames are cut to 64 characters so junk input can't make huge ids. */
export const attemptKeys = {
  user: (username: string) => `u:${Array.from(username).slice(0, 64).join("")}`,
  ip: (ipHash: string, now: Date) => `ip:${ipHash}:${ipWindowStart(now).getTime().toString(36)}`,
  global: (now: Date) => `g:${hourLabel(now)}`,
  setup: (ipHash: string, now: Date) => `setup:${ipHash}:${hourLabel(now)}`,
};

export type Throttle = { blocked: false } | { blocked: true; retryAfterSeconds: number; reason: "user" | "ip" | "setup" };

const waitUntil = (until: Date, now: Date, reason: "user" | "ip" | "setup"): Throttle =>
  ({ blocked: true, retryAfterSeconds: Math.max(1, Math.ceil((until.getTime() - now.getTime()) / SECOND)), reason });

/** Whether a sign-in may go ahead, from the username and IP counters (either may be missing). */
export function evaluateLogin(user: Pick<LoginAttemptDoc, "lockedUntil"> | null | undefined, ip: Pick<LoginAttemptDoc, "failures"> | null | undefined, now: Date): Throttle {
  if (user?.lockedUntil && user.lockedUntil.getTime() > now.getTime()) return waitUntil(user.lockedUntil, now, "user");
  if (ip && ip.failures >= LIMITS.ipFailureLimit) return waitUntil(new Date(ipWindowStart(now).getTime() + IP_WINDOW_MS), now, "ip");
  return { blocked: false };
}

/** Whether another setup-link attempt may go ahead from this IP. */
export function evaluateSetup(counter: Pick<LoginAttemptDoc, "failures"> | null | undefined, now: Date): Throttle {
  if (counter && counter.failures >= LIMITS.setupAttemptsPerHour) return waitUntil(new Date(hourStart(now).getTime() + HOUR), now, "setup");
  return { blocked: false };
}

/** When a username may try again after its `failures`-th failure at `now` (null while still free). */
export function lockedUntilAfter(failures: number, now: Date): Date | null {
  const s = usernameDelaySeconds(failures);
  return s > 0 ? new Date(now.getTime() + s * SECOND) : null;
}

/** 429 too_many_attempts with retryAfterSeconds (and the Retry-After header when `res` is given). */
export function throttledError(t: { retryAfterSeconds: number }, res?: Response): HttpError {
  res?.set("Retry-After", String(t.retryAfterSeconds));
  const minutes = Math.ceil(t.retryAfterSeconds / 60);
  const when = t.retryAfterSeconds < 60 ? `${t.retryAfterSeconds} seconds` : minutes === 1 ? "a minute" : `${minutes} minutes`;
  return new HttpError(429, "too_many_attempts", `Too many attempts. Try again in ${when}.`, { retryAfterSeconds: t.retryAfterSeconds });
}

/* ---------- Database ---------- */

const isDuplicateKey = (e: unknown) => (e as { code?: unknown })?.code === 11000;

/** Adds one failure to a counter (created if needed) and returns it. Retried once if two requests create it at once. */
async function bump(c: Collections, id: string, now: Date, expiresAt: Date): Promise<LoginAttemptDoc> {
  const run = () => c.loginAttempts.findOneAndUpdate(
    { _id: id },
    { $inc: { failures: 1 }, $set: { lastAt: now, expiresAt }, $setOnInsert: { firstAt: now, lockedUntil: null } },
    { upsert: true, returnDocument: "after" },
  );
  let doc: LoginAttemptDoc | null;
  try { doc = await run(); } catch (e) { if (!isDuplicateKey(e)) throw e; doc = await run(); }
  return doc ?? { _id: id, failures: 1, firstAt: now, lastAt: now, lockedUntil: null, expiresAt };
}

/** Reads the username and IP counters and decides (before any hashing). */
export async function checkLogin(c: Collections, username: string, ipHash: string, now: Date): Promise<Throttle> {
  const ids = [attemptKeys.user(username), attemptKeys.ip(ipHash, now)];
  const docs = await c.loginAttempts.find({ _id: { $in: ids } }).toArray();
  const byId = new Map(docs.map(d => [d._id, d]));
  return evaluateLogin(byId.get(ids[0]), byId.get(ids[1]), now);
}

export type FailureResult = {
  /** The username just reached the first delay (write "login_throttled" once, not on every refused attempt). */
  userThrottledNow: boolean;
  /** The IP just reached its limit. */
  ipBlockedNow: boolean;
  /** The hourly total just reached the spike level (write "login_spike" once). */
  spikeNow: boolean;
  /** Above the spike level: skip per-failure audit entries so a flood can't fill the database. */
  quiet: boolean;
};

/** Counts one failed sign-in (or wrong current passphrase) for the username, the IP and the hourly total. */
export async function recordLoginFailure(c: Collections, username: string, ipHash: string, now: Date): Promise<FailureResult> {
  const windowEnd = new Date(ipWindowStart(now).getTime() + IP_WINDOW_MS);
  const hourEnd = new Date(hourStart(now).getTime() + HOUR);
  const [user, ip, global] = await Promise.all([
    bump(c, attemptKeys.user(username), now, new Date(now.getTime() + LIMITS.loginCounterHours * HOUR)),
    bump(c, attemptKeys.ip(ipHash, now), now, windowEnd),
    bump(c, attemptKeys.global(now), now, new Date(hourEnd.getTime() + HOUR)),
  ]);
  const lockedUntil = lockedUntilAfter(user.failures, now);
  // $max: two failures at once can't shorten the delay
  if (lockedUntil) await c.loginAttempts.updateOne({ _id: user._id }, { $max: { lockedUntil } });
  if (ip.failures >= LIMITS.ipFailureLimit) await c.loginAttempts.updateOne({ _id: ip._id }, { $max: { lockedUntil: windowEnd } });
  return {
    userThrottledNow: user.failures === LIMITS.loginFreeFailures,
    ipBlockedNow: ip.failures === LIMITS.ipFailureLimit,
    spikeNow: global.failures === LIMITS.globalSpikeFailuresPerHour,
    quiet: global.failures > LIMITS.globalSpikeFailuresPerHour,
  };
}

/** A successful sign-in clears the username's counter (the IP counter runs out on its own). */
export async function clearLoginFailures(c: Collections, username: string): Promise<void> {
  await c.loginAttempts.deleteOne({ _id: attemptKeys.user(username) });
}

export async function checkSetup(c: Collections, ipHash: string, now: Date): Promise<Throttle> {
  return evaluateSetup(await c.loginAttempts.findOne({ _id: attemptKeys.setup(ipHash, now) }), now);
}

/** Counts one wrong, used or expired setup-link token from this IP. */
export async function recordSetupFailure(c: Collections, ipHash: string, now: Date): Promise<void> {
  await bump(c, attemptKeys.setup(ipHash, now), now, new Date(hourStart(now).getTime() + 2 * HOUR));
}
