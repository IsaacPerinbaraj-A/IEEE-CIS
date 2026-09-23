/**
 * Asking Vercel to rebuild the site after a release (DEPLOY_HOOK_URL, a Vercel Deploy Hook). The request happens
 * after the release is committed, so a failed hook never loses a publish: the release is saved, the deploy record
 * says "failed", and the admin offers Try again (POST /api/publish/retry-deploy).
 *
 * Error messages are short and plain, and never contain the hook URL (it works like a password).
 */
import type { Request } from "express";
import { LIMITS, type DeployInfo } from "../../shared/api.ts";
import type { ActorRef } from "../db.ts";
import type { AppDeps } from "../deps.ts";
import { releaseTarget, writeAudit } from "./audit.ts";
import { readStore, type ContentStore } from "./store.ts";

export type HookResult = { ok: true } | { ok: false; error: string };

/** POSTs to the deploy hook, giving up after `timeoutMs`. Never throws. */
export async function callDeployHook(fetchFn: typeof fetch, url: string, timeoutMs: number = LIMITS.deployHookTimeoutMs): Promise<HookResult> {
  try {
    const res = await fetchFn(url, { method: "POST", signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
    // Free the connection; the answer (Vercel's job id) isn't needed
    await res.body?.cancel().catch(() => undefined);
    if (res.ok) return { ok: true };
    return { ok: false, error: `Vercel answered with status ${res.status}.` };
  } catch (e) {
    const name = (e as { name?: unknown } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError")
      return { ok: false, error: `Vercel didn't answer within ${Math.round(timeoutMs / 1000)} seconds.` };
    return { ok: false, error: "The server couldn't reach Vercel." };
  }
}

/**
 * Requests a rebuild for `release` and records it in `deploys` (when `store` is given). Without DEPLOY_HOOK_URL
 * (local development) the state is "skipped". Never throws: a failure to record is only logged.
 */
export async function requestDeploy(deps: AppDeps, store: ContentStore | null, release: number): Promise<DeployInfo> {
  const at = deps.now();
  const url = deps.config.deployHookUrl;
  const result: HookResult = url ? await callDeployHook(deps.fetch, url) : { ok: true };
  const state = !url ? "skipped" : result.ok ? "requested" : "failed";
  const error = result.ok ? null : result.error;
  if (!result.ok) deps.log.warn("deploy_hook_failed", { release, reason: error });
  else deps.log.info("deploy_requested", { release, state });
  try {
    if (store) await store.saveDeploy(release, state, error, at);
  } catch (e) {
    deps.log.warn("deploy_record_failed", { release, errorName: (e as Error)?.name });
  }
  return { state, at: at.toISOString(), ...(error ? { error } : {}) };
}

/**
 * After a release is committed: request the rebuild, and log a failed request in the activity log. Never throws
 * (the release is already saved; the admin shows "Try again" for a failed rebuild).
 */
export async function deployRelease(deps: AppDeps, req: Request | null, actor: ActorRef, release: number): Promise<DeployInfo> {
  const store = await readStore(deps).catch(() => null);
  const info = await requestDeploy(deps, store, release);
  if (info.state === "failed") await writeAudit(deps, req, { action: "deploy_failed", actor, target: releaseTarget(release), detail: info.error ?? null });
  return info;
}
