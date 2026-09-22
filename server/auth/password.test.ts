import { test } from "node:test";
import assert from "node:assert/strict";
import { SCRYPT_PARAMS, createLimiter, dummyHash, formatHash, hashPassphrase, needsRehash, parseHash, verifyPassphrase, type ScryptParams } from "./password.ts";
import { HttpError } from "../http/errors.ts";

/** Cheap parameters so the tests stay fast (verification reads the parameters from the stored hash). */
const FAST: ScryptParams = { N: 2 ** 10, r: 8, p: 1, saltBytes: 16, keyBytes: 32 };
const PHRASE = "correct horse battery staple";

test("hash format is scrypt$N$r$p$salt$hash and every hash has its own salt", async () => {
  const a = await hashPassphrase(PHRASE, FAST);
  const b = await hashPassphrase(PHRASE, FAST);
  assert.match(a, /^scrypt\$1024\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  const parsed = parseHash(a);
  assert.ok(parsed);
  assert.equal(parsed.salt.length, 16);
  assert.equal(parsed.hash.length, 32);
  assert.equal(formatHash(parsed.params, parsed.salt, parsed.hash), a);
});

test("verify accepts the right passphrase only, and compares the NFC form", async () => {
  const stored = await hashPassphrase("Café au lait on a rainy morning", FAST);
  assert.equal(await verifyPassphrase("Café au lait on a rainy morning", stored), true);
  // The same text typed with a combining accent (NFD) still matches
  assert.equal(await verifyPassphrase("Café au lait on a rainy morning", stored), true);
  assert.equal(await verifyPassphrase("cafe au lait on a rainy morning", stored), false);
  assert.equal(await verifyPassphrase("", stored), false);
});

test("no usable hash (unknown user, invited account, damaged value) never matches", async () => {
  for (const stored of [null, undefined, "", "plain", "scrypt$1024$8$1$abc$def", "bcrypt$2b$10$abc"]) {
    assert.equal(await verifyPassphrase(PHRASE, stored), false, String(stored));
  }
});

test("parseHash refuses unsafe or damaged parameters", () => {
  const salt = "A".repeat(22), hash = "B".repeat(43);
  assert.ok(parseHash(`scrypt$131072$8$1$${salt}$${hash}`));
  assert.equal(parseHash(`scrypt$1000$8$1$${salt}$${hash}`), null, "N must be a power of two");
  assert.equal(parseHash(`scrypt$512$8$1$${salt}$${hash}`), null, "N too small");
  assert.equal(parseHash(`scrypt$2097152$8$1$${salt}$${hash}`), null, "N too large for the memory limit");
  assert.equal(parseHash(`scrypt$1024$8$1$${salt}$B`), null, "key too short");
  assert.equal(parseHash(`scrypt$1024$8$1$A$${hash}`), null, "salt too short");
  assert.equal(parseHash(`scrypt$1024$8$1$${salt}$${hash}$x`), null);
  assert.equal(parseHash(`scrypt$01024$8$1$${salt}$${hash}`), null);
});

test("needsRehash spots older parameters", async () => {
  const old = await hashPassphrase(PHRASE, FAST);
  assert.equal(needsRehash(old), true);
  assert.equal(needsRehash(old, FAST), false);
  assert.equal(needsRehash(dummyHash()), false);
  assert.equal(needsRehash(null), false);
});

test("the real parameters work within the memory limit (N = 2^17, r = 8, p = 1)", async () => {
  assert.deepEqual(SCRYPT_PARAMS, { N: 131072, r: 8, p: 1, saltBytes: 16, keyBytes: 32 });
  const stored = await hashPassphrase(PHRASE);
  assert.match(stored, /^scrypt\$131072\$8\$1\$/);
  assert.equal(await verifyPassphrase(PHRASE, stored), true);
});

test("passphrases longer than the limit never match and aren't hashed as typed", async () => {
  const long = "a quiet river ".repeat(20); // 280 characters
  const stored = await hashPassphrase(long, FAST);
  assert.equal(await verifyPassphrase(long, stored), false);
});

test("the limiter runs one task at a time and refuses when the queue is full", async () => {
  const run = createLimiter(1, 2);
  let active = 0, most = 0;
  const gates: (() => void)[] = [];
  const task = () => run(async () => {
    active++; most = Math.max(most, active);
    await new Promise<void>(resolve => gates.push(resolve));
    active--;
    return "done";
  });
  const first = task(), second = task(), third = task();
  await assert.rejects(task(), (e: unknown) => e instanceof HttpError && e.status === 429 && e.code === "too_many_attempts");
  // Let each task finish in turn
  for (let i = 0; i < 3; i++) {
    while (gates.length === 0) await new Promise(resolve => setImmediate(resolve));
    gates.shift()!();
  }
  assert.deepEqual(await Promise.all([first, second, third]), ["done", "done", "done"]);
  assert.equal(most, 1);
  // A failing task frees its place
  await assert.rejects(run(async () => { throw new Error("x"); }));
  assert.equal(await run(async () => 1), 1);
});
