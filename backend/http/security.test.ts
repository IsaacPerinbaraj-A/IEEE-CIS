import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { allowedTypes, contentTypeCheck, isSameOriginRequest, mediaType, originCheck, securityHeaders } from "./security.ts";
import { errorHandler } from "./errors.ts";
import { silentLogger } from "../log.ts";

const SITE = "https://ieee-cis-rec.vercel.app";

test("same-origin rule: Sec-Fetch-Site first, then Origin, and neither means no", () => {
  assert.ok(isSameOriginRequest({ "sec-fetch-site": "same-origin" }, SITE));
  assert.ok(isSameOriginRequest({ "sec-fetch-site": "Same-Origin", origin: "https://evil.example" }, SITE), "Sec-Fetch-Site decides when present");
  assert.ok(!isSameOriginRequest({ "sec-fetch-site": "same-site", origin: SITE }, SITE));
  assert.ok(!isSameOriginRequest({ "sec-fetch-site": "cross-site", origin: SITE }, SITE));
  assert.ok(!isSameOriginRequest({ "sec-fetch-site": "none" }, SITE));
  assert.ok(isSameOriginRequest({ origin: SITE }, SITE));
  assert.ok(!isSameOriginRequest({ origin: `${SITE}.evil.example` }, SITE));
  assert.ok(!isSameOriginRequest({ origin: "null" }, SITE));
  assert.ok(!isSameOriginRequest({}, SITE));
});

test("content types: JSON everywhere, WebP or JPEG only for the image upload", () => {
  assert.equal(mediaType("Application/JSON; charset=utf-8"), "application/json");
  assert.equal(mediaType(undefined), "");
  assert.deepEqual([...allowedTypes("POST", "/api/publish")], ["application/json"]);
  assert.deepEqual([...allowedTypes("POST", "/api/images")], ["image/webp", "image/jpeg"]);
});

/** A tiny app with only the two checks and one route, on a real port. */
async function withCheckedApp(fn: (base: string) => Promise<void>) {
  const app = express();
  app.use(originCheck(SITE));
  app.use(contentTypeCheck);
  app.post("/api/thing", (_req, res) => { res.json({ ok: true }); });
  app.get("/api/thing", (_req, res) => { res.json({ ok: true }); });
  app.use(errorHandler(silentLogger));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

test("the origin and content-type checks guard changing requests only", async () => {
  await withCheckedApp(async base => {
    const post = (headers: Record<string, string>, body = "{}") => fetch(`${base}/api/thing`, { method: "POST", headers, body });
    const json = { "Content-Type": "application/json" };

    let r = await post({ ...json, "Sec-Fetch-Site": "same-origin" });
    assert.equal(r.status, 200);
    r = await post({ ...json, Origin: SITE });
    assert.equal(r.status, 200);

    const refused: Record<string, string>[] = [{ "Sec-Fetch-Site": "cross-site" }, { "Sec-Fetch-Site": "same-site" }, { Origin: "https://evil.example" }, {}];
    for (const headers of refused) {
      r = await post({ ...json, ...headers });
      assert.equal(r.status, 403, JSON.stringify(headers));
      assert.deepEqual(await r.json(), { error: "This request didn't come from the admin page.", code: "bad_origin" });
    }

    r = await post({ "Content-Type": "text/plain", "Sec-Fetch-Site": "same-origin" });
    assert.equal(r.status, 415);
    assert.equal(((await r.json()) as { code: string }).code, "unsupported_media_type");
    r = await post({ "Content-Type": "application/x-www-form-urlencoded", Origin: SITE }, "a=1");
    assert.equal(r.status, 415);

    r = await fetch(`${base}/api/thing`, { headers: { "Sec-Fetch-Site": "cross-site" } });
    assert.equal(r.status, 200, "GET requests change nothing, so they aren't blocked");
  });
});

test("every answer is uncacheable data that can't run or be framed", async () => {
  const app = express();
  app.use(securityHeaders);
  app.get("/api/thing", (_req, res) => { res.json({ ok: true }); });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/thing`);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(r.headers.get("content-security-policy"), "default-src 'none'; frame-ancestors 'none'");
    assert.equal(r.headers.get("access-control-allow-origin"), null);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
