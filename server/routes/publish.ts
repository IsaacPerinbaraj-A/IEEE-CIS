/**
 * Publishing: a new numbered release, then the site rebuild (types in shared/api.ts). The logic is in
 * server/content/publish.ts; this file reads the request, runs it in one transaction, writes the activity log
 * and asks Vercel to rebuild (a failed request still answers 200 with deploy.state "failed").
 */
import type { Router } from "express";
import { ROUTES, type PublishResponse, type PublishStatus, type RetryDeployResponse } from "../../shared/api.ts";
import { getAuth, requireSession } from "../auth/middleware.ts";
import { releaseTarget, writeAudit } from "../content/audit.ts";
import { deployRelease } from "../content/deploy.ts";
import { notInitialised, publishInStore, publishResponse, readPublishRequest } from "../content/publish.ts";
import { actorOf, mongoTransaction, readStore } from "../content/store.ts";
import { publishStatus } from "../content/views.ts";
import type { AppDeps } from "../deps.ts";
import { jsonBody } from "../http/body.ts";
import type { Handler } from "../http/handler.ts";

export function register(router: Router, deps: AppDeps): void {
  router.post(ROUTES.publish, requireSession(deps), publish(deps));
  router.post(ROUTES.retryDeploy, requireSession(deps), retryDeploy(deps));
  router.get(ROUTES.publishStatus, requireSession(deps), status(deps));
}

/** POST /api/publish: PublishRequest → PublishResponse | 409 PublishConflictError | 422. */
const publish = (deps: AppDeps): Handler<PublishResponse> => async (req, res) => {
  const actor = actorOf(getAuth(res));
  const input = readPublishRequest(jsonBody(req));
  const now = deps.now();
  const published = await mongoTransaction(deps)(store => publishInStore(store, input, actor, now));
  const r = published.release;
  await writeAudit(deps, req, {
    action: "publish", actor, target: releaseTarget(r._id),
    detail: Object.entries(r.summaries).map(([k, s]) => `${k}: ${s}`).join("; ") || null,
  });
  res.json(publishResponse(published, await deployRelease(deps, req, actor, r._id)));
};

/** POST /api/publish/retry-deploy → RetryDeployResponse (asks Vercel again to rebuild the latest release). */
const retryDeploy = (deps: AppDeps): Handler<RetryDeployResponse> => async (req, res) => {
  const actor = actorOf(getAuth(res));
  const live = await (await readStore(deps)).latestRelease();
  if (!live) throw notInitialised();
  const deploy = await deployRelease(deps, req, actor, live._id);
  await writeAudit(deps, req, { action: "deploy_retry", actor, target: releaseTarget(live._id), detail: deploy.state });
  res.json({ release: live._id, deploy });
};

/** GET /api/publish/status → PublishStatus. */
const status = (deps: AppDeps): Handler<PublishStatus> => async (_req, res) => {
  res.json(await publishStatus(await readStore(deps)));
};
