/**
 * Sign-in, setup, accounts and backup routes through the whole app on a real port, WITHOUT a database
 * (MONGODB_URI is unset, so nothing connects): input checks, cookies and the answers that come before any
 * database work. Everything that needs stored data is checked later against Atlas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createApp } from "../app.ts";
import { loadConfig } from "../config.ts";
import { createDatabase } from "../db.ts";
import type { AppDeps } from "../deps.ts";
import { silentLogger } from "../log.ts";

const json = { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" };

async function withServer(env: Record<string, string>, fn: (base: string) => Promise<void>) {
  const config = loadConfig(env);
  const deps: AppDeps = {
    config, db: createDatabase(config, silentLogger), log: silentLogger, now: () => new Date("2026-09-22T10:00:00.000Z"),
    fetch: () => Promise.reject(new Error("no network in tests")), repoRoot: process.cwd(),
  };
  const server = createApp(deps).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

const code = async (r: Response) => ((await r.json()) as { code?: string }).code;
const TOKEN = "a".repeat(43);

test("login checks its input, then needs the database", async () => {
  await withServer({}, async base => {
    const login = (body: unknown) => fetch(`${base}/api/auth/login`, { method: "POST", headers: json, body: JSON.stringify(body) });
    let r = await login({});
    assert.equal(r.status, 400);
    assert.equal(await code(r), "bad_request");
    r = await login({ username: "priya", passphrase: 42 });
    assert.equal(r.status, 400);
    r = await login({ username: "priya", passphrase: "maple lanterns drift over quiet harbours" });
    assert.equal(r.status, 503);
    assert.equal(await code(r), "db_unavailable");
  });
});

test("signed-in routes refuse a missing cookie before any database work", async () => {
  await withServer({}, async base => {
    const cases: [string, string][] = [
      ["GET", "/api/auth/session"], ["POST", "/api/auth/password"], ["GET", "/api/accounts"], ["POST", "/api/accounts/invite"],
      ["POST", `/api/accounts/${"a".repeat(24)}/deactivate`], ["GET", "/api/audit"], ["GET", "/api/backup"],
      ["POST", "/api/backup/import"], ["POST", "/api/import-starting-content"],
    ];
    for (const [method, p] of cases) {
      const r = await fetch(`${base}${p}`, { method, headers: json, body: method === "POST" ? "{}" : undefined });
      assert.equal(r.status, 401, `${method} ${p}`);
      assert.equal(await code(r), "unauthorized");
      assert.match(r.headers.get("set-cookie") ?? "", /Max-Age=0/);
    }
    // With a cookie the session has to be looked up, which needs the database
    const r = await fetch(`${base}/api/auth/session`, { headers: { Cookie: `cis_session=${TOKEN}` } });
    assert.equal(r.status, 503);
  });
});

test("logout always succeeds and clears the cookie, even without the database", async () => {
  await withServer({}, async base => {
    for (const cookie of [undefined, `cis_session=${TOKEN}`]) {
      const r = await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { ...json, ...(cookie ? { Cookie: cookie } : {}) }, body: "{}" });
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), { ok: true });
      assert.equal(r.headers.get("set-cookie"), "cis_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict");
    }
  });
});

test("setup links: unknown kinds, missing tokens and an unset SETUP_TOKEN are all the same 404", async () => {
  await withServer({}, async base => {
    const expect404 = async (r: Response) => {
      assert.equal(r.status, 404);
      assert.deepEqual(await r.json(), { error: "This link isn't valid any more. Ask the web lead for a new one.", code: "invalid_token" });
    };
    await expect404(await fetch(`${base}/api/setup/admin`, { headers: { Authorization: `Bearer ${TOKEN}` } }));
    await expect404(await fetch(`${base}/api/setup/invite`));
    await expect404(await fetch(`${base}/api/setup/owner`, { headers: { Authorization: `Bearer ${TOKEN}` } }));
    await expect404(await fetch(`${base}/api/setup/owner`, { method: "POST", headers: json, body: JSON.stringify({ token: TOKEN, passphrase: "maple lanterns drift over quiet harbours" }) }));
    const r = await fetch(`${base}/api/setup/invite`, { method: "POST", headers: json, body: JSON.stringify({ passphrase: "x" }) });
    assert.equal(r.status, 400, "a missing token is a bad request");
  });
  await withServer({ SETUP_TOKEN: "s".repeat(40) }, async base => {
    const r = await fetch(`${base}/api/setup/owner`, { headers: { Authorization: `Bearer ${"s".repeat(40)}` } });
    assert.equal(r.status, 503, "with SETUP_TOKEN set, checking it needs the database (used values live there)");
  });
});
