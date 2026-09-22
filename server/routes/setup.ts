/**
 * Setup links: the first owner (SETUP_TOKEN), invites and passphrase resets (types in shared/api.ts).
 *
 * GET reads the token from `Authorization: Bearer <token>`; POST takes it in the body. Tokens never appear in URLs
 * the server sees (the link keeps them in the #fragment).
 * - Kind "owner": the SETUP_TOKEN from Render's settings, compared in constant time. Each value works once (the
 *   SHA-256 of used values is kept in meta "setup-token"). With no owner yet it creates the owner (mode "create");
 *   once the owner exists it resets the owner's passphrase (mode "reset", emergency recovery) and signs the owner
 *   out everywhere else.
 * - Kinds "invite" and "reset": one-time links from Accounts, stored only as SHA-256 in `invites`, valid for
 *   LIMITS.linkHours. Using one deletes it.
 * Wrong, used or expired tokens count toward LIMITS.setupAttemptsPerHour per IP and all get the same 404.
 * Success: the passphrase rules and breach check, the new hash, the link used up, signed in (SessionResponse).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, Response, Router } from "express";
import { ObjectId, type ClientSession, type Collection } from "mongodb";
import {
  LIMITS, ROUTES, SETUP_KINDS, isValidUsername, normaliseUsername,
  type SessionResponse, type SetupInfo, type SetupKind,
} from "../../shared/api.ts";
import { SYSTEM_ACTOR, recordAudit, requestIpHash } from "../auth/audit.ts";
import { requireStrongPassphrase } from "../auth/hibp.ts";
import { hashPassphrase } from "../auth/password.ts";
import { checkSetup, recordSetupFailure, throttledError } from "../auth/ratelimit.ts";
import { endUserSessions, looksLikeToken, startSession, tokenHash } from "../auth/session.ts";
import { sessionToken } from "../http/cookies.ts";
import type { Collections, InviteDoc, MetaDoc, UserDoc } from "../db.ts";
import type { AppDeps } from "../deps.ts";
import { HttpError, badRequest } from "../http/errors.ts";
import { jsonBody, textField } from "../http/body.ts";
import type { Handler } from "../http/handler.ts";

export function register(router: Router, deps: AppDeps): void {
  router.get(ROUTES.setup, checkLink(deps));
  router.post(ROUTES.setup, completeSetup(deps));
}

export const INVALID_LINK_MESSAGE = "This link isn't valid any more. Ask the web lead for a new one.";
const invalidLink = () => new HttpError(404, "invalid_token", INVALID_LINK_MESSAGE);

const isSetupKind = (v: unknown): v is SetupKind => typeof v === "string" && (SETUP_KINDS as readonly string[]).includes(v);

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();
/** Constant-time comparison of a presented token with SETUP_TOKEN. */
export const setupTokenMatches = (given: string, expected: string) => timingSafeEqual(digest(given), digest(expected));

const isDuplicateKey = (e: unknown) => (e as { code?: unknown })?.code === 11000;

/* ---------- Resolving a token ---------- */

type Resolved =
  | { kind: "owner"; mode: "create"; tokenId: string }
  | { kind: "owner"; mode: "reset"; tokenId: string; user: UserDoc }
  | { kind: "invite" | "reset"; mode: "create" | "reset"; tokenId: string; user: UserDoc; invite: InviteDoc };

/** Finds what a token is for, or null when it's wrong, used, expired or its account has changed. */
async function resolve(deps: AppDeps, c: Collections, kind: SetupKind, token: string, now: Date): Promise<Resolved | null> {
  if (kind === "owner") {
    const expected = deps.config.setupToken;
    if (!expected || !setupTokenMatches(token, expected)) return null;
    const tokenId = tokenHash(token);
    const meta = (await c.meta.findOne({ _id: "setup-token" })) as MetaDoc | null;
    if (meta && meta._id === "setup-token" && meta.usedHashes.includes(tokenId)) return null;
    const owner = await c.users.findOne({ role: "owner" });
    return owner ? { kind, mode: "reset", tokenId, user: owner } : { kind, mode: "create", tokenId };
  }
  if (!looksLikeToken(token)) return null;
  const tokenId = tokenHash(token);
  const invite = await c.invites.findOne({ _id: tokenId, kind, expiresAt: { $gt: now } });
  if (!invite) return null;
  const user = await c.users.findOne({ _id: invite.userId });
  const expected = kind === "invite" ? "invited" : "active";
  if (!user || user.status !== expected || user.role === "owner") return null;
  return { kind, mode: kind === "invite" ? "create" : "reset", tokenId, user, invite };
}

/** Throttle check, then resolve; a miss counts against the IP and answers 404 invalid_token. */
async function resolveOrRefuse(deps: AppDeps, req: Request, res: Response, kind: SetupKind, token: string): Promise<{ c: Collections; found: Resolved; ipHash: string }> {
  // Without SETUP_TOKEN there is nothing to guess for kind "owner", so no database work
  if (kind === "owner" && !deps.config.setupToken) throw invalidLink();
  const c = await deps.db.collections();
  const now = deps.now();
  const ipHash = requestIpHash(deps, req);
  const throttle = await checkSetup(c, ipHash, now);
  if (throttle.blocked) throw throttledError(throttle, res);
  const found = await resolve(deps, c, kind, token, now);
  if (!found) {
    await recordSetupFailure(c, ipHash, now);
    throw invalidLink();
  }
  return { c, found, ipHash };
}

const kindParam = (req: Request<{ kind: string }>): SetupKind => {
  const kind = req.params.kind;
  if (!isSetupKind(kind)) throw invalidLink();
  return kind;
};

const bearer = (req: Request) => /^Bearer ([^\s]{1,512})$/.exec(req.get("authorization")?.trim() ?? "")?.[1] ?? "";

/* ---------- Handlers ---------- */

/** GET /api/setup/:kind (Authorization: Bearer <token>) → SetupInfo. */
const checkLink = (deps: AppDeps): Handler<SetupInfo, { kind: string }> => async (req, res) => {
  const kind = kindParam(req);
  const token = bearer(req);
  if (!token) throw invalidLink();
  const { found } = await resolveOrRefuse(deps, req, res, kind, token);
  const info: SetupInfo = found.kind === "owner" && found.mode === "create"
    ? { kind, mode: "create", username: null, displayName: null, expiresAt: null }
    : {
      kind,
      mode: found.mode,
      username: found.user.username,
      displayName: found.user.displayName,
      expiresAt: "invite" in found ? found.invite.expiresAt.toISOString() : null,
    };
  res.json(info);
};

/** A new owner's username and display name (kind "owner", mode "create" only). */
function ownerDetails(body: Record<string, unknown>): { username: string; displayName: string } {
  const username = normaliseUsername(textField(body, "username", { label: "Username", max: 100 }));
  if (!isValidUsername(username)) throw badRequest(`Choose a username of ${LIMITS.usernameMinLength} to ${LIMITS.usernameMaxLength} lowercase letters, numbers, dots, dashes or underscores, starting and ending with a letter or number.`);
  const displayName = textField(body, "displayName", { label: "Your name", max: LIMITS.displayNameMaxLength }).trim();
  if (!displayName) throw badRequest("Your name is missing.");
  return { username, displayName };
}

/** Marks a SETUP_TOKEN value as used, atomically: a second use fails with a duplicate key. */
async function claimSetupToken(c: Collections, tokenId: string, now: Date, session: ClientSession) {
  // MetaDoc is a union of differently shaped documents; this update touches only the "setup-token" one
  const meta = c.meta as unknown as Collection<{ _id: string; usedHashes: string[]; updatedAt: Date }>;
  await meta.updateOne(
    { _id: "setup-token", usedHashes: { $ne: tokenId } },
    { $addToSet: { usedHashes: tokenId }, $set: { updatedAt: now } },
    { upsert: true, session },
  );
}

/** POST /api/setup/:kind: SetupRequest → SessionResponse. */
const completeSetup = (deps: AppDeps): Handler<SessionResponse, { kind: string }> => async (req, res) => {
  const kind = kindParam(req);
  const body = jsonBody(req);
  const token = textField(body, "token", { label: "Link", max: 512, clean: false });
  const passphrase = textField(body, "passphrase", { label: "Passphrase", max: 4096, clean: false });

  const { c, found, ipHash } = await resolveOrRefuse(deps, req, res, kind, token);
  const who = found.kind === "owner" && found.mode === "create"
    ? ownerDetails(body)
    : { username: found.user.username, displayName: found.user.displayName };

  await requireStrongPassphrase(deps, passphrase, who);
  // Hash outside the transaction: the driver may run the transaction body more than once
  const passphraseHash = await hashPassphrase(passphrase);
  const now = deps.now();

  let user: UserDoc;
  try {
    user = await deps.db.transaction(async (session, tc) => {
      if (found.kind === "owner") {
        await claimSetupToken(tc, found.tokenId, now, session);
        if (found.mode === "create") {
          if (await tc.users.findOne({ role: "owner" }, { session })) throw invalidLink();
          const doc: UserDoc = {
            _id: new ObjectId(),
            username: who.username,
            displayName: who.displayName,
            role: "owner",
            status: "active",
            passphraseHash,
            passphraseChangedAt: now,
            createdAt: now,
            createdBy: SYSTEM_ACTOR,
            lastLoginAt: null,
            deactivatedAt: null,
          };
          await tc.users.insertOne(doc, { session });
          return doc;
        }
        const updated = await tc.users.findOneAndUpdate(
          { _id: found.user._id, role: "owner" },
          { $set: { passphraseHash, passphraseChangedAt: now, status: "active", deactivatedAt: null } },
          { session, returnDocument: "after" },
        );
        if (!updated) throw invalidLink();
        await endUserSessions(tc, updated._id, { session });
        return updated;
      }
      // Invite or reset: using the link deletes it; only one request can win
      const used = await tc.invites.deleteOne({ _id: found.tokenId, expiresAt: { $gt: now } }, { session });
      if (used.deletedCount !== 1) throw invalidLink();
      const updated = await tc.users.findOneAndUpdate(
        { _id: found.user._id, status: found.kind === "invite" ? "invited" : "active" },
        { $set: { passphraseHash, passphraseChangedAt: now, status: "active" } },
        { session, returnDocument: "after" },
      );
      if (!updated) throw invalidLink();
      if (found.kind === "reset") await endUserSessions(tc, updated._id, { session });
      return updated;
    });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (isDuplicateKey(e)) {
      // A used SETUP_TOKEN (the claim's upsert collides) or, for a new owner, a taken username
      const keys = (e as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
      if ("username" in keys) throw new HttpError(409, "username_taken", "That username is taken. Choose another.");
      throw invalidLink();
    }
    throw e;
  }

  // A session token the browser still had (perhaps someone else's account) is ended, never kept alongside
  const old = sessionToken(deps.config, req.get("cookie"));
  if (looksLikeToken(old)) await c.sessions.deleteOne({ _id: tokenHash(old) });
  const response = await startSession(deps, c, user, req, res);
  const action = found.kind === "owner" ? "setup_owner" : found.kind === "invite" ? "setup_invite" : "setup_reset";
  const detail = found.kind === "owner"
    ? found.mode === "create" ? "Owner account created with the setup token." : "Owner passphrase reset with the setup token; other sessions signed out."
    : found.kind === "invite" ? "Invite accepted; passphrase set." : "Passphrase reset with a link; other sessions signed out.";
  await recordAudit(deps, { action, actor: { id: user._id, name: user.displayName }, target: user.username, detail, ipHash }, { collections: c });
  res.json(response);
};
