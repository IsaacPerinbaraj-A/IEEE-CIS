/**
 * Sign-in checks for routes. Route modules use them like this:
 *   router.get(ROUTES.content, requireSession(deps), handler)      // any signed-in account
 *   router.get(ROUTES.accounts, requireOwner(deps), handler)       // the owner only
 * and read the signed-in account inside the handler with getAuth(res).
 *
 * requireSession:
 * - reads the token from the session cookie (no cookie: 401 without touching the database);
 * - looks up `sessions` by the token's SHA-256; refuses a missing or ended session (idle or absolute limit; the
 *   TTL index can lag by a minute, so the times are checked here too) and deletes an ended one;
 * - loads the account and refuses it unless it is "active" (deactivating someone ends their access at once);
 * - slides the idle timer at most every LIMITS.sessionTouchMinutes;
 * - sets res.locals.auth (AuthContext).
 * Refusals are 401 { code: "unauthorized", error: MESSAGES.unauthorized } with the cookie cleared. Database
 * problems pass through as 503 db_unavailable. requireOwner does the same, then 403 forbidden unless the owner.
 */
import type { Request, RequestHandler, Response } from "express";
import type { ObjectId } from "mongodb";
import type { SessionUser } from "../../shared/api.ts";
import type { AppDeps } from "../deps.ts";
import { clearSessionCookie, sessionToken } from "../http/cookies.ts";
import { forbidden, unauthorized } from "../http/errors.ts";
import { looksLikeToken, sessionState, toSessionUser, tokenHash, touchedTimes } from "./session.ts";

/** The signed-in account for this request (res.locals.auth). */
export type AuthContext = {
  /** As the API shows it (id is the user's ObjectId as hex). */
  user: SessionUser;
  userId: ObjectId;
  /** The sessions collection _id (SHA-256 hex of the cookie token). */
  sessionId: string;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
};

/** Checks the session cookie; resolves with the account or throws 401 (with the cookie cleared). */
export async function authenticate(deps: AppDeps, req: Request, res: Response): Promise<AuthContext> {
  const refuse = () => {
    res.append("Set-Cookie", clearSessionCookie(deps.config));
    return unauthorized();
  };
  const token = sessionToken(deps.config, req.get("cookie"));
  if (!looksLikeToken(token)) throw refuse();

  const c = await deps.db.collections();
  const id = tokenHash(token);
  const s = await c.sessions.findOne({ _id: id });
  if (!s) throw refuse();
  const now = deps.now();
  const state = sessionState(s, now);
  if (state === "ended") {
    await c.sessions.deleteOne({ _id: id });
    throw refuse();
  }
  const user = await c.users.findOne({ _id: s.userId });
  if (!user || user.status !== "active") {
    await c.sessions.deleteOne({ _id: id });
    throw refuse();
  }

  let { idleExpiresAt, absoluteExpiresAt } = s;
  if (state === "touch") {
    const times = touchedTimes(s, now);
    await c.sessions.updateOne({ _id: id }, { $set: { lastSeenAt: now, idleExpiresAt: times.idleExpiresAt, expiresAt: times.expiresAt } });
    idleExpiresAt = times.idleExpiresAt;
    absoluteExpiresAt = times.absoluteExpiresAt;
  }
  return { user: toSessionUser(user), userId: user._id, sessionId: id, idleExpiresAt, absoluteExpiresAt };
}

/** Any signed-in, active account. */
export function requireSession(deps: AppDeps): RequestHandler {
  return (req, res, next) => {
    authenticate(deps, req, res).then(auth => {
      (res.locals as { auth?: AuthContext }).auth = auth;
      next();
    }, next);
  };
}

/** The owner only (403 for editors). */
export function requireOwner(deps: AppDeps): RequestHandler {
  return (req, res, next) => {
    authenticate(deps, req, res).then(auth => {
      if (auth.user.role !== "owner") { next(forbidden()); return; }
      (res.locals as { auth?: AuthContext }).auth = auth;
      next();
    }, next);
  };
}

/** The signed-in account, inside a handler behind requireSession or requireOwner. */
export function getAuth(res: Response): AuthContext {
  const auth = (res.locals as { auth?: AuthContext }).auth;
  if (!auth) throw unauthorized();
  return auth;
}
