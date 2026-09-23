/**
 * History and undo (types in shared/api.ts). Every release is kept forever; undo makes an old release (or one
 * section of it) live again as a NEW release, so nothing is erased. Logic: server/content/publish.ts and views.ts.
 */
import type { Router } from "express";
import { LIMITS, ROUTES, type HistoryPage, type ReleaseDetail, type RestoreResponse } from "../../shared/api.ts";
import { getAuth, requireSession } from "../auth/middleware.ts";
import { releaseTarget, writeAudit } from "../content/audit.ts";
import { deployRelease } from "../content/deploy.ts";
import { publishResponse, readRestoreRequest, restoreInStore } from "../content/publish.ts";
import { actorOf, mongoTransaction, readStore } from "../content/store.ts";
import { historyPage, releaseDetail as detailOf } from "../content/views.ts";
import type { AppDeps } from "../deps.ts";
import { intValue, jsonBody, queryValue } from "../http/body.ts";
import type { Handler } from "../http/handler.ts";

const MAX_RELEASE = 1_000_000_000;

export function register(router: Router, deps: AppDeps): void {
  router.get(ROUTES.history, requireSession(deps), listReleases(deps));
  router.post(ROUTES.restore, requireSession(deps), restore(deps));
  router.get(ROUTES.historyRelease, requireSession(deps), releaseDetail(deps));
}

/** GET /api/history?before=<release>&limit=<n> → HistoryPage. */
const listReleases = (deps: AppDeps): Handler<HistoryPage> => async (req, res) => {
  const beforeText = queryValue(req, "before");
  const before = beforeText === undefined || beforeText === "" ? null : intValue(beforeText, { label: "before", min: 1, max: MAX_RELEASE });
  const limit = intValue(queryValue(req, "limit"), { label: "limit", min: 1, max: LIMITS.historyMaxPageSize, fallback: LIMITS.historyPageSize });
  res.json(await historyPage(await readStore(deps), before, limit));
};

/** GET /api/history/:release → ReleaseDetail. */
const releaseDetail = (deps: AppDeps): Handler<ReleaseDetail, { release: string }> => async (req, res) => {
  const n = intValue(req.params.release, { label: "release", min: 1, max: MAX_RELEASE });
  res.json(await detailOf(await readStore(deps), n));
};

/** POST /api/history/restore: RestoreRequest → RestoreResponse. */
const restore = (deps: AppDeps): Handler<RestoreResponse> => async (req, res) => {
  const actor = actorOf(getAuth(res));
  const input = readRestoreRequest(jsonBody(req));
  const now = deps.now();
  const restored = await mongoTransaction(deps)(store => restoreInStore(store, input, actor, now));
  const r = restored.release;
  await writeAudit(deps, req, { action: "restore", actor, target: releaseTarget(r._id), detail: r.note });
  res.json(publishResponse(restored, await deployRelease(deps, req, actor, r._id)));
};
