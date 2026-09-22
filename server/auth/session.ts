/**
 * Server-side sessions in MongoDB (`sessions`). The browser holds only a random token in an HttpOnly cookie
 * (config.cookieName: "__Host-cis_session" with Secure in production; "cis_session" without Secure when NODE_ENV
 * isn't production, because the local site runs on plain http). The database stores only the token's SHA-256.
 *
 * A session ends after LIMITS.sessionIdleMinutes without requests or LIMITS.sessionAbsoluteHours in total,
 * whichever comes first. The idle timer slides at most every LIMITS.sessionTouchMinutes (one write per 5 minutes,
 * not per request). A TTL index removes ended sessions; the code checks the times itself as well.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import type { ClientSession, ObjectId } from "mongodb";
import { LIMITS, type SessionResponse, type SessionUser } from "../../shared/api.ts";
import type { AppDeps } from "../deps.ts";
import type { Collections, MetaDoc, SessionDoc, UserDoc } from "../db.ts";
import { sessionCookie } from "../http/cookies.ts";
import { clientIp, ipHash } from "../http/ip.ts";

const MINUTE = 60_000;
const IDLE_MS = LIMITS.sessionIdleMinutes * MINUTE;
const ABSOLUTE_MS = LIMITS.sessionAbsoluteHours * 60 * MINUTE;
const TOUCH_MS = LIMITS.sessionTouchMinutes * MINUTE;

/* ---------- Tokens (sessions and setup links) ---------- */

/** 32 random bytes as base64url (43 characters). */
export const newToken = () => randomBytes(32).toString("base64url");
/** What the database stores instead of a token: SHA-256 as hex. */
export const tokenHash = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
/** Tokens this server hands out look like this; anything else is refused before any lookup. */
export const looksLikeToken = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(s);

/* ---------- Times ---------- */

export type SessionTimes = { idleExpiresAt: Date; absoluteExpiresAt: Date; expiresAt: Date };

/** When a session created at `createdAt` and last used at `lastSeenAt` ends. */
export function sessionTimes(createdAt: Date, lastSeenAt: Date): SessionTimes {
  const idleExpiresAt = new Date(lastSeenAt.getTime() + IDLE_MS);
  const absoluteExpiresAt = new Date(createdAt.getTime() + ABSOLUTE_MS);
  const expiresAt = idleExpiresAt < absoluteExpiresAt ? idleExpiresAt : absoluteExpiresAt;
  return { idleExpiresAt, absoluteExpiresAt, expiresAt };
}

/** "ended": refuse it. "touch": fine, and it's time to slide the idle timer. "fresh": fine, no write needed. */
export function sessionState(s: Pick<SessionDoc, "lastSeenAt" | "idleExpiresAt" | "absoluteExpiresAt">, now: Date): "ended" | "touch" | "fresh" {
  const t = now.getTime();
  if (t >= s.idleExpiresAt.getTime() || t >= s.absoluteExpiresAt.getTime()) return "ended";
  return t - s.lastSeenAt.getTime() >= TOUCH_MS ? "touch" : "fresh";
}

/** The new idle times after activity at `now` (never past the absolute limit). */
export function touchedTimes(s: Pick<SessionDoc, "createdAt">, now: Date): SessionTimes {
  return sessionTimes(s.createdAt, now);
}

/* ---------- Users as the API shows them ---------- */

export const toSessionUser = (u: Pick<UserDoc, "_id" | "username" | "displayName" | "role">): SessionUser => ({
  id: u._id.toHexString(),
  username: u.username,
  displayName: u.displayName,
  role: u.role,
});

/** SessionResponse, with the owner's extras (SETUP_TOKEN still set on Render, last backup) for the owner only. */
export async function sessionResponse(deps: AppDeps, c: Collections, user: SessionUser, times: Pick<SessionTimes, "idleExpiresAt" | "absoluteExpiresAt">): Promise<SessionResponse> {
  const out: SessionResponse = {
    user,
    idleExpiresAt: times.idleExpiresAt.toISOString(),
    absoluteExpiresAt: times.absoluteExpiresAt.toISOString(),
  };
  if (user.role === "owner") {
    const last = (await c.meta.findOne({ _id: "last-backup" })) as MetaDoc | null;
    out.owner = {
      setupTokenActive: !!deps.config.setupToken,
      lastBackupAt: last && last._id === "last-backup" ? last.at.toISOString() : null,
    };
  }
  return out;
}

/* ---------- Start and end ---------- */

/**
 * Signs `user` in: stores a new session, sets the cookie, records lastLoginAt and returns the SessionResponse.
 * Call only after the passphrase (or setup link) has been checked and the account is active.
 */
export async function startSession(deps: AppDeps, c: Collections, user: UserDoc, req: Request, res: Response): Promise<SessionResponse> {
  const now = deps.now();
  const token = newToken();
  const times = sessionTimes(now, now);
  const doc: SessionDoc = {
    _id: tokenHash(token),
    userId: user._id,
    createdAt: now,
    lastSeenAt: now,
    ...times,
    ipHash: ipHash(deps.config.ipHashKey, clientIp(req)),
    userAgent: (req.get("user-agent") ?? "").slice(0, 120),
  };
  await c.sessions.insertOne(doc);
  await c.users.updateOne({ _id: user._id }, { $set: { lastLoginAt: now } });
  res.append("Set-Cookie", sessionCookie(deps.config, token, ABSOLUTE_MS / 1000));
  return sessionResponse(deps, c, toSessionUser(user), times);
}

/** Ends every session of a user (deactivation, reset), or every other one (`keep`: after changing your passphrase). */
export async function endUserSessions(c: Collections, userId: ObjectId, o: { keep?: string; session?: ClientSession } = {}): Promise<number> {
  const filter = o.keep ? { userId, _id: { $ne: o.keep } } : { userId };
  const r = await c.sessions.deleteMany(filter, { session: o.session });
  return r.deletedCount;
}
