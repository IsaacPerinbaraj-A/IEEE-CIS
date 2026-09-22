import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../config.ts";
import { createDatabase } from "../db.ts";
import type { AppDeps } from "../deps.ts";
import { silentLogger } from "../log.ts";
import { callDeployHook, requestDeploy } from "./deploy.ts";
import { createMemoryStore } from "./memoryStore.ts";

const HOOK = "https://api.vercel.com/v1/integrations/deploy/prj_secret/abc123";
const NOW = new Date("2026-09-22T10:00:00.000Z");

function deps(fetchFn: typeof fetch, hook: string | null = HOOK): AppDeps {
  const config = loadConfig({ SITE_ORIGIN: "http://localhost:5175", ...(hook ? { DEPLOY_HOOK_URL: hook } : {}) });
  return { config, db: createDatabase(config, silentLogger), log: silentLogger, now: () => NOW, fetch: fetchFn, repoRoot: process.cwd() };
}

test("a 2xx answer from the hook counts as requested; the request is a POST with a timeout", async () => {
  let seen: RequestInit | undefined;
  const r = await callDeployHook(async (_url, init) => { seen = init; return new Response('{"job":{}}', { status: 201 }); }, HOOK);
  assert.deepEqual(r, { ok: true });
  assert.equal(seen?.method, "POST");
  assert.ok(seen?.signal instanceof AbortSignal);
});

test("hook failures give a plain reason that never includes the hook URL", async () => {
  const bad = await callDeployHook(async () => new Response("nope", { status: 404 }), HOOK);
  assert.deepEqual(bad, { ok: false, error: "Vercel answered with status 404." });

  const offline = await callDeployHook(async () => { throw new TypeError(`fetch failed for ${HOOK}`); }, HOOK);
  assert.equal(offline.ok, false);
  assert.ok(!offline.ok && !offline.error.includes("vercel.com"));

  // AbortSignal.timeout doesn't keep Node running, so a plain timer stands in for the pending request
  const slow = await callDeployHook((_url, init) => new Promise((_resolve, reject) => {
    const pending = setTimeout(() => reject(new Error("the timeout never fired")), 5_000);
    init?.signal?.addEventListener("abort", () => { clearTimeout(pending); reject(init.signal?.reason); });
  }), HOOK, 20);
  assert.deepEqual(slow, { ok: false, error: "Vercel didn't answer within 0 seconds." });
});

test("requestDeploy records each request, and is skipped without a hook", async () => {
  const store = createMemoryStore();
  const ok = await requestDeploy(deps(async () => new Response(null, { status: 201 })), store, 3);
  assert.deepEqual(ok, { state: "requested", at: NOW.toISOString() });

  const failed = await requestDeploy(deps(async () => new Response(null, { status: 500 })), store, 3);
  assert.equal(failed.state, "failed");
  assert.equal(failed.error, "Vercel answered with status 500.");
  const record = store.state.deploys.get(3);
  assert.equal(record?.attempts, 2);
  assert.equal(record?.state, "failed");

  let called = false;
  const skipped = await requestDeploy(deps(async () => { called = true; return new Response(null); }, null), store, 4);
  assert.equal(skipped.state, "skipped");
  assert.equal(called, false);
  assert.equal(store.state.deploys.get(4)?.state, "skipped");

  // Without a store the rebuild is still requested
  assert.equal((await requestDeploy(deps(async () => new Response(null, { status: 201 })), null, 5)).state, "requested");
});
