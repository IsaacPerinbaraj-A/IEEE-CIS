import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfigError, DEV_DEFAULTS, describeConfig, loadConfig } from "./config.ts";

const secret = (c: string) => c.repeat(40);
const production = {
  RENDER: "true",
  MONGODB_URI: "mongodb+srv://cis-app:pw@cluster0.example.mongodb.net/?retryWrites=true",
  SITE_ORIGIN: "https://ieee-cis-rec.vercel.app",
  EXPORT_TOKEN: secret("e"),
  IP_HASH_KEY: secret("k"),
  DEPLOY_HOOK_URL: "https://api.vercel.com/v1/integrations/deploy/prj_x/abc",
  PORT: "10000",
};

test("local development works with no settings at all", () => {
  const c = loadConfig({});
  assert.equal(c.production, false);
  assert.equal(c.port, DEV_DEFAULTS.port);
  assert.equal(c.mongodbUri, null);
  assert.equal(c.mongodbDb, "cis");
  assert.equal(c.siteOrigin, DEV_DEFAULTS.siteOrigin);
  assert.equal(c.exportToken, null);
  assert.equal(c.deployHookUrl, null);
  assert.equal(c.setupToken, null);
  assert.equal(c.cookieName, "cis_session");
  assert.equal(c.cookieSecure, false);
  assert.ok(c.ipHashKey.length > 0);
});

test("production reads every setting and uses the __Host- cookie", () => {
  const c = loadConfig(production);
  assert.equal(c.production, true);
  assert.equal(c.port, 10000);
  assert.equal(c.siteOrigin, "https://ieee-cis-rec.vercel.app");
  assert.equal(c.cookieName, "__Host-cis_session");
  assert.equal(c.cookieSecure, true);
  assert.equal(c.exportToken, secret("e"));
  assert.equal(loadConfig({ ...production, RENDER: undefined, NODE_ENV: "production" }).production, true);
});

test("production fails fast and lists every missing setting", () => {
  try {
    loadConfig({ RENDER: "true" });
    assert.fail("should throw");
  } catch (e) {
    assert.ok(e instanceof ConfigError);
    const text = e.problems.join(" ");
    for (const name of ["MONGODB_URI", "SITE_ORIGIN", "EXPORT_TOKEN", "IP_HASH_KEY"]) assert.ok(text.includes(name), name);
    assert.ok(!text.includes("DEPLOY_HOOK_URL"), "the deploy hook is optional");
    assert.ok(e.message.includes("MONGODB_URI"));
  }
});

test("bad values are reported with plain messages", () => {
  const bad = (env: Record<string, string>, needle: string) => {
    assert.throws(() => loadConfig(env), (e: unknown) => e instanceof ConfigError && e.problems.some(p => p.includes(needle)));
  };
  bad({ PORT: "eighty" }, "PORT");
  bad({ PORT: "70000" }, "PORT");
  bad({ MONGODB_URI: "postgres://x" }, "MONGODB_URI");
  bad({ MONGODB_DB: "cis db" }, "MONGODB_DB");
  bad({ SITE_ORIGIN: "https://site.example/admin" }, "SITE_ORIGIN");
  bad({ SITE_ORIGIN: "not a url" }, "SITE_ORIGIN");
  bad({ ...production, SITE_ORIGIN: "http://site.example" }, "https://");
  bad({ ...production, EXPORT_TOKEN: "short" }, "EXPORT_TOKEN");
  bad({ SETUP_TOKEN: "short" }, "SETUP_TOKEN");
  bad({ DEPLOY_HOOK_URL: "http://api.vercel.com/hook" }, "DEPLOY_HOOK_URL");
});

test("a trailing slash on SITE_ORIGIN is fine; blank values count as unset", () => {
  assert.equal(loadConfig({ SITE_ORIGIN: "https://site.example/" }).siteOrigin, "https://site.example");
  assert.equal(loadConfig({ MONGODB_URI: "   ", DEPLOY_HOOK_URL: "" }).mongodbUri, null);
});

test("the log summary never contains secret values", () => {
  const text = JSON.stringify(describeConfig(loadConfig({ ...production, SETUP_TOKEN: secret("s") })));
  for (const v of [production.MONGODB_URI, production.EXPORT_TOKEN, production.IP_HASH_KEY, production.DEPLOY_HOOK_URL, secret("s"), "pw@"]) {
    assert.ok(!text.includes(v), v);
  }
});
