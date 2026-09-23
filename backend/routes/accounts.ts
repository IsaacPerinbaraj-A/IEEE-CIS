/**
 * Accounts and the activity log, for the owner only (types in shared/api.ts).
 *
 * There is exactly one owner; everyone invited here is an editor. Invite and reset links are 32 random bytes,
 * stored only as SHA-256 in `invites` for LIMITS.linkHours and shown once as setupLink(...). A new link replaces
 * any unused one for that account. For an account that never used its invite, "reset" makes a new invite link.
 * Deactivating signs the person out everywhere at once (sessions deleted; every request also re-checks the
 * account) and cancels their links. The owner's own account can't be reset or deactivated here
 * (422 cannot_change_owner): the owner recovers access with SETUP_TOKEN.
 */
import type { Request, Router } from "express";
import { ObjectId, type ClientSession } from "mongodb";
import {
  LIMITS, ROUTES, isValidUsername, normaliseUsername, setupLink,
  type Account, type AccountResponse, type AccountsResponse, type AuditPage, type InviteRequest, type LinkResponse,
} from "../../shared/api.ts";
import { actorOf, recordAudit, requestIpHash, toAuditEntry } from "../auth/audit.ts";
import { getAuth, requireOwner } from "../auth/middleware.ts";
import { endUserSessions, newToken, tokenHash } from "../auth/session.ts";
import type { ActorRef, Collections, InviteDoc, UserDoc } from "../db.ts";
import type { AppDeps } from "../deps.ts";
import { HttpError, badRequest, notFound } from "../http/errors.ts";
import { intValue, jsonBody, queryValue, textField } from "../http/body.ts";
import type { Handler } from "../http/handler.ts";

export function register(router: Router, deps: AppDeps): void {
  router.get(ROUTES.accounts, requireOwner(deps), listAccounts(deps));
  router.post(ROUTES.invite, requireOwner(deps), invite(deps));
  router.post(ROUTES.accountReset, requireOwner(deps), resetLink(deps));
  router.post(ROUTES.accountDeactivate, requireOwner(deps), deactivate(deps));
  router.post(ROUTES.accountReactivate, requireOwner(deps), reactivate(deps));
  router.get(ROUTES.audit, requireOwner(deps), audit(deps));
}

const HOUR = 60 * 60 * 1000;

/* ---------- Helpers ---------- */

type PendingLink = Account["pendingLink"];

/** An account as the API shows it. */
export function toAccount(u: UserDoc, link: Pick<InviteDoc, "kind" | "expiresAt"> | null): Account {
  const pendingLink: PendingLink = link ? { kind: link.kind, expiresAt: link.expiresAt.toISOString() } : null;
  return {
    id: u._id.toHexString(),
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    pendingLink,
  };
}

/** Owner first, then the oldest accounts first. */
export const accountOrder = (a: Pick<UserDoc, "role" | "createdAt">, b: Pick<UserDoc, "role" | "createdAt">) =>
  (a.role === "owner" ? 0 : 1) - (b.role === "owner" ? 0 : 1) || a.createdAt.getTime() - b.createdAt.getTime();

/** A 24-hex-character account id from the URL (404 otherwise). */
export function accountId(v: unknown): ObjectId {
  if (typeof v !== "string" || !/^[0-9a-f]{24}$/i.test(v)) throw notFound("That account doesn't exist.");
  return new ObjectId(v);
}

const invalid = (message: string) => new HttpError(422, "bad_request", message);

/** The newest unused, unexpired link of an account. */
async function pendingLinkOf(c: Collections, userId: ObjectId, now: Date) {
  return c.invites.find({ userId, expiresAt: { $gt: now } }).sort({ createdAt: -1 }).limit(1).next();
}

async function loadAccount(c: Collections, id: ObjectId): Promise<UserDoc> {
  const u = await c.users.findOne({ _id: id });
  if (!u) throw notFound("That account doesn't exist.");
  return u;
}

/** Replaces the account's links with a new one and returns its token (shown once). */
async function newLink(c: Collections, kind: "invite" | "reset", userId: ObjectId, createdBy: ActorRef, now: Date, session?: ClientSession) {
  const token = newToken();
  const doc: InviteDoc = { _id: tokenHash(token), kind, userId, createdAt: now, createdBy, expiresAt: new Date(now.getTime() + LIMITS.linkHours * HOUR) };
  await c.invites.deleteMany({ userId }, { session });
  await c.invites.insertOne(doc, { session });
  return { token, doc };
}

const ipOf = (deps: AppDeps, req: Request) => requestIpHash(deps, req);

/* ---------- Handlers ---------- */

/** GET /api/accounts → AccountsResponse. */
const listAccounts = (deps: AppDeps): Handler<AccountsResponse> => async (_req, res) => {
  const c = await deps.db.collections();
  const now = deps.now();
  const [users, links] = await Promise.all([
    c.users.find({}).toArray(),
    c.invites.find({ expiresAt: { $gt: now } }).sort({ createdAt: 1 }).toArray(),
  ]);
  const latest = new Map<string, InviteDoc>();
  for (const l of links) latest.set(l.userId.toHexString(), l);
  res.json({ accounts: users.sort(accountOrder).map(u => toAccount(u, latest.get(u._id.toHexString()) ?? null)) });
};

/** POST /api/accounts/invite: InviteRequest → LinkResponse. */
const invite = (deps: AppDeps): Handler<LinkResponse> => async (req, res) => {
  const auth = getAuth(res);
  const body = jsonBody(req);
  const request: InviteRequest = {
    username: normaliseUsername(textField(body, "username", { label: "Username", max: 100 })),
    displayName: textField(body, "displayName", { label: "Name", max: LIMITS.displayNameMaxLength }).trim(),
  };
  if (!isValidUsername(request.username)) throw invalid(`Use ${LIMITS.usernameMinLength} to ${LIMITS.usernameMaxLength} lowercase letters, numbers, dots, dashes or underscores, starting and ending with a letter or number.`);
  if (!request.displayName) throw invalid("Their name is missing.");

  const now = deps.now();
  const actor = actorOf(auth);
  const user: UserDoc = {
    _id: new ObjectId(),
    username: request.username,
    displayName: request.displayName,
    role: "editor",
    status: "invited",
    passphraseHash: null,
    passphraseChangedAt: null,
    createdAt: now,
    createdBy: actor,
    lastLoginAt: null,
    deactivatedAt: null,
  };
  let link: { token: string; doc: InviteDoc };
  try {
    link = await deps.db.transaction(async (session, tc) => {
      await tc.users.insertOne(user, { session });
      return newLink(tc, "invite", user._id, actor, now, session);
    });
  } catch (e) {
    if ((e as { code?: unknown })?.code === 11000) throw new HttpError(409, "username_taken", "That username is taken. Choose another.");
    throw e;
  }
  await recordAudit(deps, { action: "invite_created", actor, target: user.username, detail: `Invite link for ${user.displayName}, valid ${LIMITS.linkHours} hours.`, ipHash: ipOf(deps, req) });
  res.json({ account: toAccount(user, link.doc), link: setupLink(deps.config.siteOrigin, "invite", link.token), expiresAt: link.doc.expiresAt.toISOString() });
};

/** POST /api/accounts/:id/reset → LinkResponse. */
const resetLink = (deps: AppDeps): Handler<LinkResponse, { id: string }> => async (req, res) => {
  const auth = getAuth(res);
  const id = accountId(req.params.id);
  const c = await deps.db.collections();
  const user = await loadAccount(c, id);
  if (user.role === "owner") throw new HttpError(422, "cannot_change_owner", "The web lead's own account can't be reset here. Use the setup token on Render instead.");
  if (user.status === "deactivated") throw badRequest("This account is deactivated. Reactivate it first.");
  // Someone who never used their invite gets a fresh invite; everyone else a reset link
  const kind = user.status === "invited" ? "invite" : "reset";
  const now = deps.now();
  const actor = actorOf(auth);
  const link = await deps.db.transaction((session, tc) => newLink(tc, kind, user._id, actor, now, session));
  await recordAudit(deps, {
    action: kind === "invite" ? "invite_created" : "reset_created",
    actor,
    target: user.username,
    detail: kind === "invite" ? `New invite link, valid ${LIMITS.linkHours} hours.` : `Passphrase reset link, valid ${LIMITS.linkHours} hours. The current passphrase works until it is used.`,
    ipHash: ipOf(deps, req),
  }, { collections: c });
  res.json({ account: toAccount(user, link.doc), link: setupLink(deps.config.siteOrigin, kind, link.token), expiresAt: link.doc.expiresAt.toISOString() });
};

/** POST /api/accounts/:id/deactivate → AccountResponse. */
const deactivate = (deps: AppDeps): Handler<AccountResponse, { id: string }> => async (req, res) => {
  const auth = getAuth(res);
  const id = accountId(req.params.id);
  const c = await deps.db.collections();
  const user = await loadAccount(c, id);
  if (user.role === "owner" || id.equals(auth.userId)) throw new HttpError(422, "cannot_change_owner", "The web lead's own account can't be deactivated.");
  if (user.status === "deactivated") { res.json({ account: toAccount(user, null) }); return; }

  const now = deps.now();
  // The status change alone ends access (every request re-checks it); then the sessions and links go
  const updated = await c.users.findOneAndUpdate({ _id: id, role: "editor" }, { $set: { status: "deactivated", deactivatedAt: now } }, { returnDocument: "after" });
  if (!updated) throw notFound("That account doesn't exist.");
  const [ended] = await Promise.all([
    endUserSessions(c, id),
    c.invites.deleteMany({ userId: id }),
    c.presence.deleteOne({ _id: id.toHexString() }),
  ]);
  await recordAudit(deps, { action: "account_deactivated", actor: actorOf(auth), target: user.username, detail: ended ? `Signed out of ${ended} ${ended === 1 ? "session" : "sessions"}.` : null, ipHash: ipOf(deps, req) }, { collections: c });
  res.json({ account: toAccount(updated, null) });
};

/** POST /api/accounts/:id/reactivate → AccountResponse. */
const reactivate = (deps: AppDeps): Handler<AccountResponse, { id: string }> => async (req, res) => {
  const auth = getAuth(res);
  const id = accountId(req.params.id);
  const c = await deps.db.collections();
  const user = await loadAccount(c, id);
  if (user.status !== "deactivated") { res.json({ account: toAccount(user, await pendingLinkOf(c, id, deps.now())) }); return; }
  // Someone deactivated before using their invite goes back to "invited" (they need a new link from Reset)
  const status = user.passphraseHash ? "active" : "invited";
  const updated = await c.users.findOneAndUpdate({ _id: id, status: "deactivated" }, { $set: { status, deactivatedAt: null } }, { returnDocument: "after" });
  if (!updated) throw notFound("That account doesn't exist.");
  await recordAudit(deps, { action: "account_reactivated", actor: actorOf(auth), target: user.username, detail: status === "invited" ? "Back to invited: send a new invite link." : null, ipHash: ipOf(deps, req) }, { collections: c });
  res.json({ account: toAccount(updated, null) });
};

/** GET /api/audit?before=<id>&limit=<n> → AuditPage. */
const audit = (deps: AppDeps): Handler<AuditPage> => async (req, res) => {
  const limit = intValue(queryValue(req, "limit"), { label: "limit", min: 1, max: LIMITS.auditMaxPageSize, fallback: LIMITS.auditPageSize });
  const beforeText = queryValue(req, "before");
  if (beforeText && !/^[0-9a-f]{24}$/i.test(beforeText)) throw badRequest("before must be an entry id.");
  const filter = beforeText ? { _id: { $lt: new ObjectId(beforeText) } } : {};
  const c = await deps.db.collections();
  const docs = await c.audit.find(filter).sort({ _id: -1 }).limit(limit + 1).toArray();
  const page = docs.slice(0, limit);
  res.json({ entries: page.map(toAuditEntry), nextBefore: docs.length > limit ? page[page.length - 1]._id.toHexString() : null });
};
