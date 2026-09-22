/**
 * The build export over HTTP, without a database (MONGODB_URI unset): the token check, and the answers that don't
 * need stored content. Publishing and the export's content are covered in server/content/publish.test.ts.
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

const TOKEN = "t".repeat(40);

function deps(env: Record<string, string>): AppDeps {
  const config = loadConfig({ SITE_ORIGIN: "http://localhost:5175", ...env });
  return {
    config, db: createDatabase(config, silentLogger), log: silentLogger, now: () => new Date("2026-09-22T10:00:00.000Z"),
    fetch: () => Promise.reject(new Error("no network in tests")), repoRoot: process.cwd(),
  };
}

async function serve(d: AppDeps, fn: (base: string) => Promise<void>) {
  const server = createApp(d).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

const code = async (r: Response) => ((await r.json()) as { code?: string }).code;
const sha = "a".repeat(64);

test("the export needs the bearer token, and is off without EXPORT_TOKEN", async () => {
  await serve(deps({}), async base => {
    const r = await fetch(`${base}/api/export/published`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    assert.equal(r.status, 503);
    assert.equal(await code(r), "not_configured");
  });
  await serve(deps({ EXPORT_TOKEN: TOKEN }), async base => {
    for (const auth of [undefined, "Bearer wrong-token", `Basic ${TOKEN}`, `Bearer ${TOKEN}x`]) {
      const r = await fetch(`${base}/api/export/published`, { headers: auth ? { Authorization: auth } : {} });
      assert.equal(r.status, 401, String(auth));
      assert.equal(await code(r), "unauthorized");
    }
    const img = await fetch(`${base}/api/export/image/${sha}`);
    assert.equal(img.status, 401);
  });
});

test("with the token, the export reaches the database (503 here) and checks image ids first", async () => {
  await serve(deps({ EXPORT_TOKEN: TOKEN }), async base => {
    const headers = { Authorization: `Bearer ${TOKEN}` };
    let r = await fetch(`${base}/api/export/published`, { headers });
    assert.equal(r.status, 503);
    assert.equal(await code(r), "db_unavailable");
    assert.equal(r.headers.get("cache-control"), "no-store");

    r = await fetch(`${base}/api/export/image/not-a-sha`, { headers });
    assert.equal(r.status, 404);
    r = await fetch(`${base}/api/export/image/${sha.toUpperCase()}`, { headers });
    assert.equal(r.status, 404);
    r = await fetch(`${base}/api/export/image/${sha}`, { headers });
    assert.equal(r.status, 503);
  });
});
