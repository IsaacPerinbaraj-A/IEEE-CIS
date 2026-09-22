/**
 * The whole app on a real port (127.0.0.1), without a database: MONGODB_URI is unset, so nothing connects.
 * Route handlers are still stubs here, so these tests only rely on what app.ts itself guarantees.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { MongoNetworkError } from "mongodb";
import { createApp } from "./app.ts";
import { loadConfig, type Config } from "./config.ts";
import { createDatabase } from "./db.ts";
import type { AppDeps } from "./deps.ts";
import { DbUnavailableError, HttpError, errorHandler } from "./http/errors.ts";
import { silentLogger } from "./log.ts";

const SITE = "http://localhost:5175";
const TOKEN = "x".repeat(40);

function deps(env: Record<string, string> = {}): AppDeps {
  const config: Config = loadConfig({ SITE_ORIGIN: SITE, ...env });
  return {
    config,
    db: createDatabase(config, silentLogger),
    log: silentLogger,
    now: () => new Date("2026-09-22T10:00:00.000Z"),
    fetch: () => Promise.reject(new Error("no network in tests")),
    repoRoot: process.cwd(),
  };
}

async function serve(app: express.Express, fn: (base: string) => Promise<void>) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

const json = { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" };
/** A response's JSON body. */
const body = async (r: Response) => (await r.json()) as Record<string, unknown>;

test("health checks work without a database", async () => {
  await serve(createApp(deps()), async base => {
    let r = await fetch(`${base}/healthz`);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), "ok");
    assert.equal(r.headers.get("cache-control"), "no-store");

    r = await fetch(`${base}/api/health`);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, time: "2026-09-22T10:00:00.000Z" });

    r = await fetch(`${base}/api/health?db=1`);
    assert.deepEqual(await r.json(), { ok: true, time: "2026-09-22T10:00:00.000Z", db: "not_configured" });
  });
});

test("every response is JSON with safe headers; unknown paths are a JSON 404", async () => {
  await serve(createApp(deps()), async base => {
    const r = await fetch(`${base}/api/nothing-here`);
    assert.equal(r.status, 404);
    assert.deepEqual(await r.json(), { error: "Not found", code: "not_found" });
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(r.headers.get("x-frame-options"), "DENY");
    assert.equal(r.headers.get("x-powered-by"), null);
    assert.equal(r.headers.get("access-control-allow-origin"), null);
    assert.equal((await fetch(`${base}/`)).status, 404);
  });
});

test("cross-site and header-less changing requests are refused before any route runs", async () => {
  await serve(createApp(deps()), async base => {
    const login = (headers: Record<string, string>) => fetch(`${base}/api/auth/login`, { method: "POST", headers, body: "{}" });
    const variants: Record<string, string>[] = [{ "Sec-Fetch-Site": "cross-site" }, { Origin: "https://evil.example" }, {}];
    for (const h of variants) {
      const r = await login({ "Content-Type": "application/json", ...h });
      assert.equal(r.status, 403, JSON.stringify(h));
      assert.equal((await body(r)).code, "bad_origin");
    }
    assert.notEqual((await login(json)).status, 403);
    assert.notEqual((await login({ "Content-Type": "application/json", Origin: SITE })).status, 403);
    assert.equal((await fetch(`${base}/api/auth/login`, { method: "OPTIONS" })).status, 405);
  });
});

test("content types and body limits", async () => {
  await serve(createApp(deps()), async base => {
    let r = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { ...json, "Content-Type": "text/plain" }, body: "{}" });
    assert.equal(r.status, 415);

    r = await fetch(`${base}/api/images?folder=team&name=x`, { method: "POST", headers: json, body: "{}" });
    assert.equal(r.status, 415);
    assert.equal((await body(r)).error, "Send the image as WebP or JPEG.");
    r = await fetch(`${base}/api/images?folder=team&name=x`, { method: "POST", headers: { ...json, "Content-Type": "image/webp" }, body: new Uint8Array([1, 2, 3]) });
    assert.notEqual(r.status, 415, "images pass the content-type check on the upload route");

    r = await fetch(`${base}/api/auth/login`, { method: "POST", headers: json, body: "{not json" });
    assert.equal(r.status, 400);
    const bad = await r.json();
    assert.deepEqual(bad, { error: "The request wasn't valid JSON.", code: "bad_json" });

    r = await fetch(`${base}/api/auth/login`, { method: "POST", headers: json, body: JSON.stringify({ a: "x".repeat(2 * 1024 * 1024 + 10) }) });
    assert.equal(r.status, 413);
    assert.equal((await body(r)).code, "payload_too_large");
  });
});

test("the build export needs EXPORT_TOKEN on the server and the right Bearer token", async () => {
  await serve(createApp(deps()), async base => {
    const r = await fetch(`${base}/api/export/published`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    assert.equal(r.status, 503);
    assert.equal((await body(r)).code, "not_configured");
  });
  await serve(createApp(deps({ EXPORT_TOKEN: TOKEN })), async base => {
    assert.equal((await fetch(`${base}/api/export/published`)).status, 401);
    assert.equal((await fetch(`${base}/api/export/published`, { headers: { Authorization: "Bearer wrong" } })).status, 401);
    const ok = await fetch(`${base}/api/export/published`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    assert.notEqual(ok.status, 401);
  });
});

test("errors never leak stack traces or connection details; database trouble is a clean 503", async () => {
  const app = express();
  app.get("/boom", () => { throw new Error("boom at mongodb+srv://user:secret@cluster.example"); });
  app.get("/db", () => { throw new DbUnavailableError(); });
  app.get("/driver", async () => { throw new MongoNetworkError("connect ECONNREFUSED 10.0.0.1:27017"); });
  app.get("/http", () => { throw new HttpError(429, "too_many_attempts", "Too many attempts.", { retryAfterSeconds: 30 }); });
  app.use(errorHandler(silentLogger));
  await serve(app, async base => {
    let r = await fetch(`${base}/boom`);
    assert.equal(r.status, 500);
    const text = await r.text();
    assert.deepEqual(JSON.parse(text), { error: "Something went wrong on the server. Try again in a minute.", code: "server_error" });
    assert.ok(!text.includes("secret") && !text.includes("stack") && !text.includes(".ts"));

    for (const path of ["/db", "/driver"]) {
      r = await fetch(`${base}${path}`);
      assert.equal(r.status, 503, path);
      assert.deepEqual(await r.json(), { error: "The database is not reachable", code: "db_unavailable" });
    }

    r = await fetch(`${base}/http`);
    assert.equal(r.status, 429);
    assert.deepEqual(await r.json(), { retryAfterSeconds: 30, error: "Too many attempts.", code: "too_many_attempts" });
  });
});

test("routes that need the database answer 503 when it isn't set up", async () => {
  const d = deps();
  await assert.rejects(d.db.collections(), (e: unknown) => e instanceof DbUnavailableError && e.status === 503);
  await assert.rejects(d.db.transaction(async () => 1), DbUnavailableError);
  assert.equal(await d.db.ping(), "not_configured");
  assert.equal(d.db.configured, false);
});
