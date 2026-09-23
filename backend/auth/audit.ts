/**
 * The activity log (`audit`, kept LIMITS.auditRetentionDays). Every route that changes something writes one entry
 * with recordAudit(). IP addresses are stored only as HMAC pseudonyms (IP_HASH_KEY); a failed sign-in names only a
 * real account, never the text that was typed (routes/auth.ts); nothing secret is ever written here.
 *
 * Content routes use it like this:
 *   await recordAudit(deps, { action: "publish", actor: actorOf(getAuth(res)), target: `Release ${n}`, detail: note, ipHash: requestIpHash(deps, req) });
 * Inside a transaction pass { collections: c, session } so the entry commits (or not) with the rest; then errors
 * are thrown. Outside a transaction a failed write is only logged, so it never breaks the request.
 */
import type { Request } from "express";
import { ObjectId, type ClientSession } from "mongodb";
import type { AuditAction, AuditEntry } from "../../shared/api.ts";
import { cleanText, truncate } from "../../shared/text.ts";
import type { ActorRef, AuditDoc, Collections } from "../db.ts";
import type { AppDeps } from "../deps.ts";
import { clientIp, ipHash } from "../http/ip.ts";
import type { AuthContext } from "./middleware.ts";

export type AuditInput = {
  action: AuditAction;
  actor: ActorRef | null;
  /** What it was about: a username, "Release 12", a section… (at most 100 characters). */
  target?: string | null;
  /** A short plain note (at most 300 characters). */
  detail?: string | null;
  ipHash?: string | null;
};

const TARGET_MAX = 100;
const DETAIL_MAX = 300;
/** Longest free text kept by typedUsername (typed text may be a mistyped passphrase, so keep it short). */
export const TYPED_USERNAME_MAX = 32;

const short = (s: string | null | undefined, max: number) => {
  if (s === null || s === undefined) return null;
  const t = truncate(cleanText(s).replace(/\s+/g, " "), max);
  return t || null;
};

/** The signed-in account as an audit actor. */
export const actorOf = (auth: Pick<AuthContext, "userId" | "user">): ActorRef => ({ id: auth.userId, name: auth.user.displayName });

/** The system itself (for example the one-time owner setup, before any account exists). */
export const SYSTEM_ACTOR: ActorRef = { id: null, name: "System" };

/** The pseudonym of the request's IP address. */
export const requestIpHash = (deps: AppDeps, req: Request) => ipHash(deps.config.ipHashKey, clientIp(req));

/**
 * Typed text cleaned and cut to TYPED_USERNAME_MAX characters. Failed sign-ins don't use it: a passphrase pasted into
 * the username box would still be stored. They record the matching account's username or UNKNOWN_USERNAME instead.
 */
export const typedUsername = (s: string) => short(s, TYPED_USERNAME_MAX) ?? "(empty)";

export function auditDoc(now: Date, input: AuditInput): AuditDoc {
  return {
    _id: new ObjectId(),
    at: now,
    actor: input.actor ? { id: input.actor.id, name: short(input.actor.name, 80) ?? "" } : null,
    action: input.action,
    target: short(input.target, TARGET_MAX),
    detail: short(input.detail, DETAIL_MAX),
    ipHash: input.ipHash ?? null,
  };
}

/** Writes one entry. With a transaction `session` errors are thrown; otherwise they are logged and ignored. */
export async function recordAudit(deps: AppDeps, input: AuditInput, o: { collections?: Collections; session?: ClientSession } = {}): Promise<void> {
  const doc = auditDoc(deps.now(), input);
  if (o.session) {
    const c = o.collections ?? await deps.db.collections();
    await c.audit.insertOne(doc, { session: o.session });
    return;
  }
  try {
    const c = o.collections ?? await deps.db.collections();
    await c.audit.insertOne(doc);
  } catch (e) {
    deps.log.warn("audit_write_failed", { action: input.action, errorName: (e as Error)?.name });
  }
}

/** An entry as GET /api/audit shows it. */
export const toAuditEntry = (d: AuditDoc): AuditEntry => ({
  id: d._id.toHexString(),
  at: d.at.toISOString(),
  actor: d.actor?.name ?? null,
  action: d.action,
  target: d.target,
  detail: d.detail,
});
