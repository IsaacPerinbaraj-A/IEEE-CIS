import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITS } from "../../shared/api.ts";
import { attemptKeys, evaluateLogin, evaluateSetup, hourLabel, ipWindowStart, lockedUntilAfter, throttledError, usernameDelaySeconds } from "./ratelimit.ts";

const NOW = new Date("2026-09-22T10:07:30.000Z");
const at = (secondsFromNow: number) => new Date(NOW.getTime() + secondsFromNow * 1000);

test("per-username delay: 5 free failures, then 30 s doubling, capped at 15 minutes, never a lock", () => {
  const table = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 50, 1000].map(n => [n, usernameDelaySeconds(n)]);
  assert.deepEqual(table, [
    [0, 0], [1, 0], [2, 0], [3, 0], [4, 0],
    [5, 30], [6, 60], [7, 120], [8, 240], [9, 480], [10, 900], [11, 900], [50, 900], [1000, 900],
  ]);
  assert.equal(LIMITS.loginMaxDelaySeconds, 15 * 60);
  assert.equal(lockedUntilAfter(4, NOW), null);
  assert.deepEqual(lockedUntilAfter(5, NOW), at(30));
  assert.deepEqual(lockedUntilAfter(99, NOW), at(900));
});

test("a username waits until lockedUntil; the IP waits for its window to end", () => {
  assert.deepEqual(evaluateLogin(null, null, NOW), { blocked: false });
  assert.deepEqual(evaluateLogin({ lockedUntil: null }, { failures: 49 }, NOW), { blocked: false });
  assert.deepEqual(evaluateLogin({ lockedUntil: at(-1) }, null, NOW), { blocked: false }, "the delay has passed");
  assert.deepEqual(evaluateLogin({ lockedUntil: at(59.2) }, null, NOW), { blocked: true, retryAfterSeconds: 60, reason: "user" });
  // 10:07:30 is in the 10:00–10:15 window: 7.5 minutes left
  assert.deepEqual(evaluateLogin(null, { failures: 50 }, NOW), { blocked: true, retryAfterSeconds: 450, reason: "ip" });
  assert.equal(evaluateLogin({ lockedUntil: at(20) }, { failures: 80 }, NOW).blocked, true);
});

test("setup links: 10 wrong tokens per IP per hour", () => {
  assert.deepEqual(evaluateSetup({ failures: 9 }, NOW), { blocked: false });
  assert.deepEqual(evaluateSetup({ failures: 10 }, NOW), { blocked: true, retryAfterSeconds: 3150, reason: "setup" });
});

test("counter ids: fixed windows and hours, short usernames", () => {
  assert.equal(ipWindowStart(NOW).toISOString(), "2026-09-22T10:00:00.000Z");
  assert.equal(ipWindowStart(new Date("2026-09-22T10:15:00.000Z")).toISOString(), "2026-09-22T10:15:00.000Z");
  assert.equal(hourLabel(NOW), "2026-09-22T10");
  assert.equal(attemptKeys.user("priya"), "u:priya");
  assert.equal(attemptKeys.user("x".repeat(500)), `u:${"x".repeat(64)}`);
  assert.equal(attemptKeys.global(NOW), "g:2026-09-22T10");
  assert.equal(attemptKeys.setup("abc", NOW), "setup:abc:2026-09-22T10");
  assert.notEqual(attemptKeys.ip("abc", NOW), attemptKeys.ip("abc", new Date("2026-09-22T10:16:00.000Z")));
  assert.equal(attemptKeys.ip("abc", NOW), attemptKeys.ip("abc", new Date("2026-09-22T10:14:59.000Z")));
});

test("429 answers say when to try again", () => {
  const headers: Record<string, string> = {};
  const res = { set(k: string, v: string) { headers[k] = v; } } as unknown as import("express").Response;
  const e = throttledError({ retryAfterSeconds: 30 }, res);
  assert.equal(e.status, 429);
  assert.equal(e.code, "too_many_attempts");
  assert.deepEqual(e.extra, { retryAfterSeconds: 30 });
  assert.equal(e.message, "Too many attempts. Try again in 30 seconds.");
  assert.equal(headers["Retry-After"], "30");
  assert.equal(throttledError({ retryAfterSeconds: 60 }).message, "Too many attempts. Try again in a minute.");
  assert.equal(throttledError({ retryAfterSeconds: 900 }).message, "Too many attempts. Try again in 15 minutes.");
});
