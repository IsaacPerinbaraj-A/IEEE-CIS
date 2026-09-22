/**
 * Sign-in, sign-out, the current session and changing your own passphrase (types in shared/api.ts).
 *
 * - login: the username and IP limits are checked before any hashing, one attempt per username at a time; unknown
 *   usernames are checked against a dummy hash; every failure (unknown user, wrong passphrase, invited or
 *   deactivated account) is the same 401 MESSAGES.badCredentials, and its audit entry names only real accounts.
 *   Success: a new session and cookie (any session token the browser sent is deleted), audit "login".
 * - logout: ends this session if there is one and clears the cookie; always 200.
 * - session: the signed-in account (also counts as activity).
 * - password: the current passphrase is checked with the same limits as sign-in; the new one must pass the
 *   passphrase rules and the breach check; the account's other sessions end.
 */
import type { Router } from "express";
import {
  LIMITS, MESSAGES, ROUTES, isValidUsername, normaliseUsername,
  type LoginResponse, type LogoutResponse, type OkResponse, type SessionResponse,
} from "../../shared/api.ts";
import { actorOf, recordAudit, requestIpHash } from "../auth/audit.ts";
import { requireStrongPassphrase } from "../auth/hibp.ts";
import { getAuth, requireSession } from "../auth/middleware.ts";
import { busy, hashPassphrase, needsRehash, verifyPassphrase } from "../auth/password.ts";
import { attemptKeys, checkLogin, clearLoginFailures, recordLoginFailure, throttledError, type FailureResult } from "../auth/ratelimit.ts";
import { endUserSessions, looksLikeToken, sessionResponse, startSession, tokenHash } from "../auth/session.ts";
import type { AppDeps } from "../deps.ts";
import { clearSessionCookie, sessionToken } from "../http/cookies.ts";
import { DbUnavailableError, HttpError } from "../http/errors.ts";
import { jsonBody, textField } from "../http/body.ts";
import type { Handler } from "../http/handler.ts";

export function register(router: Router, deps: AppDeps): void {
  router.post(ROUTES.login, login(deps));
  router.post(ROUTES.logout, logout(deps));
  router.get(ROUTES.session, requireSession(deps), session(deps));
  router.post(ROUTES.password, requireSession(deps), changePassphrase(deps));
}

/** Longest input read at all (longer passphrases are refused by the rules without being hashed). */
const INPUT_MAX = 4096;
const badCredentials = () => new HttpError(401, "bad_credentials", MESSAGES.badCredentials);

/**
 * What a failed sign-in's audit entry names: the account's username when the typed name belongs to an account,
 * otherwise only UNKNOWN_USERNAME. Text typed into the username box is never stored as it is, because people
 * sometimes type or paste their passphrase there.
 */
export const UNKNOWN_USERNAME = "(unknown username)";

/**
 * At most one sign-in or passphrase check per username at a time (Render's free plan runs one instance). Without
 * this, attempts sent in parallel would all pass the delay check before any of their failures is counted. The
 * counters themselves stay in MongoDB; this only holds the usernames being checked right now.
 */
const inFlight = new Set<string>();
async function oneAtATime<T>(username: string, fn: () => Promise<T>): Promise<T> {
  const key = attemptKeys.user(username);
  if (inFlight.has(key)) throw busy();
  inFlight.add(key);
  try {
    return await fn();
  } finally {
    inFlight.delete(key);
  }
}

/** Audit entries for a counted failure: one per failure until the hourly spike level, then only the spike note. */
async function auditFailure(deps: AppDeps, r: FailureResult, target: string, ipHash: string, detail: string) {
  if (r.spikeNow) {
    deps.log.warn("login_spike", { failuresThisHour: LIMITS.globalSpikeFailuresPerHour });
    await recordAudit(deps, { action: "login_spike", actor: null, detail: `${LIMITS.globalSpikeFailuresPerHour} failed sign-ins this hour. Entries for single failures pause until the hour ends.` });
  }
  if (r.quiet) return;
  await recordAudit(deps, { action: "login_failed", actor: null, target, detail, ipHash });
  if (r.userThrottledNow) await recordAudit(deps, { action: "login_throttled", actor: null, target, detail: `${LIMITS.loginFreeFailures} failed attempts in a row: sign-in for this username is slowed down.`, ipHash });
  if (r.ipBlockedNow) await recordAudit(deps, { action: "login_throttled", actor: null, target: null, detail: `${LIMITS.ipFailureLimit} failed attempts from one address in ${LIMITS.ipWindowMinutes} minutes: that address is paused.`, ipHash });
}

/** POST /api/auth/login: LoginRequest → LoginResponse. */
const login = (deps: AppDeps): Handler<LoginResponse> => async (req, res) => {
  const body = jsonBody(req);
  const typed = textField(body, "username", { label: "Username", max: 200 });
  const passphrase = textField(body, "passphrase", { label: "Passphrase", max: INPUT_MAX, clean: false });
  const username = normaliseUsername(typed);
  const now = deps.now();
  const ipHash = requestIpHash(deps, req);
  const c = await deps.db.collections();

  const user = await oneAtATime(username, async () => {
    const throttle = await checkLogin(c, username, ipHash, now);
    if (throttle.blocked) throw throttledError(throttle, res);

    const found = isValidUsername(username) ? await c.users.findOne({ username }) : null;
    const usable = found && found.status === "active" ? found.passphraseHash : null;
    const ok = await verifyPassphrase(passphrase, usable);
    if (!ok || !found || found.status !== "active") {
      const r = await recordLoginFailure(c, username, ipHash, now);
      await auditFailure(deps, r, found ? found.username : UNKNOWN_USERNAME, ipHash, "Wrong username or passphrase.");
      throw badCredentials();
    }
    await clearLoginFailures(c, username);
    return found;
  });
  // A session token the browser still had is replaced, never reused
  const old = sessionToken(deps.config, req.get("cookie"));
  if (looksLikeToken(old)) await c.sessions.deleteOne({ _id: tokenHash(old) });
  if (needsRehash(user.passphraseHash)) {
    const passphraseHash = await hashPassphrase(passphrase);
    await c.users.updateOne({ _id: user._id }, { $set: { passphraseHash } });
  }
  const response = await startSession(deps, c, user, req, res);
  await recordAudit(deps, { action: "login", actor: { id: user._id, name: user.displayName }, target: user.username, ipHash });
  res.json(response);
};

/** POST /api/auth/logout → LogoutResponse. */
const logout = (deps: AppDeps): Handler<LogoutResponse> => async (req, res) => {
  const token = sessionToken(deps.config, req.get("cookie"));
  if (looksLikeToken(token)) {
    try {
      const c = await deps.db.collections();
      const ended = await c.sessions.findOneAndDelete({ _id: tokenHash(token) });
      if (ended) {
        const user = await c.users.findOne({ _id: ended.userId }, { projection: { displayName: 1, username: 1 } });
        await recordAudit(deps, { action: "logout", actor: { id: ended.userId, name: user?.displayName ?? "" }, target: user?.username ?? null, ipHash: requestIpHash(deps, req) }, { collections: c });
      }
    } catch (e) {
      // The cookie is cleared anyway; the stored session runs out on its own
      if (!(e instanceof DbUnavailableError)) throw e;
      deps.log.warn("logout_db_unavailable");
    }
  }
  res.append("Set-Cookie", clearSessionCookie(deps.config));
  res.json({ ok: true });
};

/** GET /api/auth/session → SessionResponse. */
const session = (deps: AppDeps): Handler<SessionResponse> => async (_req, res) => {
  const auth = getAuth(res);
  const c = await deps.db.collections();
  res.json(await sessionResponse(deps, c, auth.user, auth));
};

/** POST /api/auth/password: ChangePassphraseRequest → OkResponse. */
const changePassphrase = (deps: AppDeps): Handler<OkResponse> => async (req, res) => {
  const auth = getAuth(res);
  const body = jsonBody(req);
  const current = textField(body, "current", { label: "Current passphrase", max: INPUT_MAX, clean: false });
  const next = textField(body, "next", { label: "New passphrase", max: INPUT_MAX, clean: false });
  const now = deps.now();
  const ipHash = requestIpHash(deps, req);
  const c = await deps.db.collections();

  const user = await oneAtATime(auth.user.username, async () => {
    const throttle = await checkLogin(c, auth.user.username, ipHash, now);
    if (throttle.blocked) throw throttledError(throttle, res);
    const found = await c.users.findOne({ _id: auth.userId });
    const ok = await verifyPassphrase(current, found?.passphraseHash ?? null);
    if (!ok || !found) {
      const r = await recordLoginFailure(c, auth.user.username, ipHash, now);
      await auditFailure(deps, r, auth.user.username, ipHash, "Wrong current passphrase when changing it.");
      throw badCredentials();
    }
    await clearLoginFailures(c, auth.user.username);
    return found;
  });

  await requireStrongPassphrase(deps, next, { username: user.username, displayName: user.displayName });
  const passphraseHash = await hashPassphrase(next);
  await c.users.updateOne({ _id: user._id }, { $set: { passphraseHash, passphraseChangedAt: deps.now() } });
  const ended = await endUserSessions(c, user._id, { keep: auth.sessionId });
  await recordAudit(deps, { action: "passphrase_changed", actor: actorOf(auth), target: user.username, detail: ended ? `${ended} other ${ended === 1 ? "session" : "sessions"} signed out.` : null, ipHash }, { collections: c });
  res.json({ ok: true });
};
