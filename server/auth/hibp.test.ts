import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../config.ts";
import { createDatabase } from "../db.ts";
import type { AppDeps } from "../deps.ts";
import { HttpError } from "../http/errors.ts";
import { createLogger, silentLogger } from "../log.ts";
import { BREACHED_MESSAGE, breachCount, newPassphraseProblems, pwnedCount, requireStrongPassphrase, sha1Parts } from "./hibp.ts";

const GOOD = "maple lanterns drift over quiet harbours";

type Call = { url: string; headers: Record<string, string> };

/** A fetch stub that records calls and answers with `body` (or fails). */
function fakeFetch(answer: { status?: number; body?: string; fail?: boolean }) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), headers: Object.fromEntries(new Headers(init?.headers).entries()) });
    if (answer.fail) throw new TypeError("fetch failed");
    return new Response(answer.body ?? "", { status: answer.status ?? 200 });
  }) as typeof fetch;
  return { fn, calls };
}

function deps(fetchFn: typeof fetch, lines: string[] = []): AppDeps {
  const config = loadConfig({});
  return {
    config,
    db: createDatabase(config, silentLogger),
    log: createLogger(line => lines.push(line)),
    now: () => new Date("2026-09-22T10:00:00.000Z"),
    fetch: fetchFn,
    repoRoot: process.cwd(),
  };
}

test("only the first 5 SHA-1 characters are sent", async () => {
  // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
  assert.deepEqual(sha1Parts("password"), { prefix: "5BAA6", suffix: "1E4C9B93F3F0682250B6CF8331B7EE68FD8" });
  const { fn, calls } = fakeFetch({ body: "1E4C9B93F3F0682250B6CF8331B7EE68FD8:9545824\r\n0000000000000000000000000000000000A:0" });
  assert.equal(await pwnedCount(fn, "password"), 9545824);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.pwnedpasswords.com/range/5BAA6");
  assert.equal(calls[0].headers["add-padding"], "true");
  assert.equal(new URL(calls[0].url).pathname, "/range/5BAA6", "nothing but the 5-character prefix leaves the server");
});

test("range responses: matches are case-insensitive, padding lines count as zero", () => {
  const body = "003D68EB55068C33ACE09247EE4C639306B:3\r\n1e4c9b93f3f0682250b6cf8331b7ee68fd8:12\r\nFFFF:0";
  assert.equal(breachCount(body, "1E4C9B93F3F0682250B6CF8331B7EE68FD8"), 12);
  assert.equal(breachCount(body, "FFFF"), 0);
  assert.equal(breachCount(body, "ABC"), 0);
  assert.equal(breachCount("", "ABC"), 0);
});

test("when the API can't be reached the answer is unknown (null)", async () => {
  assert.equal(await pwnedCount(fakeFetch({ fail: true }).fn, GOOD), null);
  assert.equal(await pwnedCount(fakeFetch({ status: 503 }).fn, GOOD), null);
});

test("new passphrases: local rules first, then the breach check; fails open with a warning", async () => {
  // Local problems: the API isn't asked at all
  const quiet = fakeFetch({ body: "" });
  assert.deepEqual(await newPassphraseProblems(deps(quiet.fn), "too short", {}), ["Use at least 15 characters. A short sentence works well."]);
  assert.ok((await newPassphraseProblems(deps(quiet.fn), "IEEE CIS REC admin 2026", {})).length > 0);
  assert.ok((await newPassphraseProblems(deps(quiet.fn), "priyasharma2026!!", { username: "priya", displayName: "Priya Sharma" })).length > 0);
  assert.equal(quiet.calls.length, 0);

  // Breached
  const { suffix } = sha1Parts(GOOD);
  const breached = fakeFetch({ body: `${suffix}:4` });
  assert.deepEqual(await newPassphraseProblems(deps(breached.fn), GOOD, {}), [BREACHED_MESSAGE]);

  // Clean
  assert.deepEqual(await newPassphraseProblems(deps(fakeFetch({ body: `${"0".repeat(35)}:0` }).fn), GOOD, {}), []);

  // Unreachable: allowed, and logged without the passphrase
  const lines: string[] = [];
  assert.deepEqual(await newPassphraseProblems(deps(fakeFetch({ fail: true }).fn, lines), GOOD, {}), []);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /"level":"warn","event":"hibp_unreachable"/);
  assert.ok(!lines[0].includes("maple"));
});

test("requireStrongPassphrase answers 422 weak_passphrase with every reason", async () => {
  const d = deps(fakeFetch({ body: "" }).fn);
  await assert.rejects(requireStrongPassphrase(d, "short", {}), (e: unknown) =>
    e instanceof HttpError && e.status === 422 && e.code === "weak_passphrase" && Array.isArray(e.extra.reasons) && e.extra.reasons.length === 1);
  await requireStrongPassphrase(d, GOOD, {});
});
