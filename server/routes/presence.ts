/**
 * "Who's editing" notes, such as "Priya is editing Events" (types in shared/api.ts). POST upserts the caller's
 * `presence` row (section, at, expiresAt = at + LIMITS.presenceWindowSeconds, removed by a TTL index) and returns
 * everyone seen within the window, the caller included (the client filters by user id); GET only lists them.
 */
import type { Router } from "express";
import { LIMITS, ROUTES, type PresenceResponse } from "../../shared/api.ts";
import { getAuth, requireSession } from "../auth/middleware.ts";
import { presenceEntries, presenceSince, readPresenceSection } from "../content/views.ts";
import type { AppDeps } from "../deps.ts";
import { jsonBody } from "../http/body.ts";
import type { Handler } from "../http/handler.ts";

/** More than enough for a student club; keeps the answer small. */
const MAX_ENTRIES = 50;

export function register(router: Router, deps: AppDeps): void {
  router.get(ROUTES.presence, requireSession(deps), listPresence(deps));
  router.post(ROUTES.presence, requireSession(deps), heartbeat(deps));
}

async function everyone(deps: AppDeps, now: Date): Promise<PresenceResponse> {
  const c = await deps.db.collections();
  const docs = await c.presence.find({ at: { $gte: presenceSince(now) } }, { sort: { at: -1 }, limit: MAX_ENTRIES }).toArray();
  return { editors: presenceEntries(docs, now) };
}

/** GET /api/presence → PresenceResponse. */
const listPresence = (deps: AppDeps): Handler<PresenceResponse> => async (_req, res) => {
  res.json(await everyone(deps, deps.now()));
};

/** POST /api/presence: PresenceRequest → PresenceResponse. */
const heartbeat = (deps: AppDeps): Handler<PresenceResponse> => async (req, res) => {
  const auth = getAuth(res);
  const section = readPresenceSection(jsonBody(req));
  const now = deps.now();
  const c = await deps.db.collections();
  await c.presence.updateOne(
    { _id: auth.userId.toHexString() },
    { $set: { userId: auth.userId, name: auth.user.displayName, section, at: now, expiresAt: new Date(now.getTime() + LIMITS.presenceWindowSeconds * 1000) } },
    { upsert: true },
  );
  res.json(await everyone(deps, now));
};
