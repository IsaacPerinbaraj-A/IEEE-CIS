import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../config.ts";
import { clearSessionCookie, parseCookies, serializeCookie, sessionCookie, sessionToken } from "./cookies.ts";
import { bearerMatches } from "../auth/exportToken.ts";
import { ipHash } from "./ip.ts";
import { createLogger, scrub } from "../log.ts";

const prod = loadConfig({
  RENDER: "true", MONGODB_URI: "mongodb+srv://u:p@x.example.net", SITE_ORIGIN: "https://site.example",
  EXPORT_TOKEN: "e".repeat(40), IP_HASH_KEY: "k".repeat(40),
});

test("parseCookies reads pairs, skips junk and keeps the first of duplicates", () => {
  assert.deepEqual({ ...parseCookies("a=1; b=two%20words; bad; =x; a=3; c=\"q\"") }, { a: "1", b: "two words", c: "q" });
  assert.deepEqual({ ...parseCookies(undefined) }, {});
  assert.deepEqual({ ...parseCookies("x=%E0%A4%A") }, { x: "%E0%A4%A" }, "bad escapes are kept as they are");
});

test("the production session cookie is __Host-, Secure, HttpOnly, SameSite=Strict, Path=/ and has no Domain", () => {
  const c = sessionCookie(prod, "tok", 43200);
  assert.equal(c, "__Host-cis_session=tok; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict");
  assert.ok(!/domain/i.test(c));
  assert.equal(clearSessionCookie(prod), "__Host-cis_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict");
  assert.equal(sessionToken(prod, "other=1; __Host-cis_session=abc"), "abc");
  assert.equal(sessionToken(prod, "cis_session=abc"), null);
});

test("locally the cookie works over http", () => {
  const dev = loadConfig({});
  assert.equal(sessionCookie(dev, "t", 60), "cis_session=t; Path=/; Max-Age=60; HttpOnly; SameSite=Strict");
  assert.throws(() => serializeCookie("bad name", "x"));
});

test("export token: exact Bearer match only", () => {
  const token = "t".repeat(40);
  assert.ok(bearerMatches(`Bearer ${token}`, token));
  assert.ok(!bearerMatches(`Bearer ${token}x`, token));
  assert.ok(!bearerMatches(`bearer ${token}`, token));
  assert.ok(!bearerMatches(token, token));
  assert.ok(!bearerMatches(undefined, token));
});

test("IP pseudonyms depend on the key", () => {
  assert.equal(ipHash("k1", "1.2.3.4"), ipHash("k1", "1.2.3.4"));
  assert.notEqual(ipHash("k1", "1.2.3.4"), ipHash("k2", "1.2.3.4"));
  assert.match(ipHash("k1", "1.2.3.4"), /^[0-9a-f]{32}$/);
});

test("logs never show secrets", () => {
  const lines: string[] = [];
  const log = createLogger(line => lines.push(line));
  log.error("x", { passphrase: "hunter2hunter2hunter2", token: "abc", uri: "mongodb+srv://u:p@h.example/db", note: "failed at mongodb+srv://u:secret@h.example", nested: { cookie: "c=1" } });
  const out = lines.join("\n");
  for (const s of ["hunter2", "abc", "u:p@", "secret", "c=1"]) assert.ok(!out.includes(s), s);
  assert.equal(scrub("Authorization: Bearer abc.def"), "Authorization: Bearer [redacted]");
  assert.equal(scrub("https://api.vercel.com/v1/integrations/deploy/prj_1/xyz"), "[deploy hook]");
});
