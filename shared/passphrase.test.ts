import { test } from "node:test";
import assert from "node:assert/strict";
import { passphraseProblems } from "./passphrase.ts";
import { isValidUsername, normaliseUsername, setupLink } from "./api.ts";

test("at least 15 characters, counted as people count them", () => {
  assert.deepEqual(passphraseProblems("short one"), ["Use at least 15 characters. A short sentence works well."]);
  assert.deepEqual(passphraseProblems("correct horse battery staple"), []);
  assert.equal(passphraseProblems("🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂").length, 1, "14 emoji are 14 characters");
  assert.equal(passphraseProblems("x".repeat(257))[0], "Use at most 256 characters.");
});

test("no composition rules, but not built from the club's name, the person or the year", () => {
  const ctx = { username: "priya", displayName: "Priya Sharma", year: 2026 };
  assert.deepEqual(passphraseProblems("all lowercase words are fine", ctx), []);
  assert.ok(passphraseProblems("IEEE CIS REC admin 2026", ctx).length > 0);
  assert.ok(passphraseProblems("Rajalakshmi password 2025!!", ctx).length > 0);
  assert.ok(passphraseProblems("priya sharma 2027 ieee", ctx).length > 0);
  assert.deepEqual(passphraseProblems("record the recipe correctly", ctx), [], "words that merely contain 'rec' are fine");
  assert.ok(passphraseProblems("aaaaaaaaaaaaaaaaaaaa").includes("Use more different letters or words."));
});

test("usernames and setup links", () => {
  assert.equal(normaliseUsername("  Priya.S "), "priya.s");
  assert.ok(isValidUsername("priya.s"));
  assert.ok(isValidUsername("web-lead_2026"));
  assert.ok(!isValidUsername("pr"));
  assert.ok(!isValidUsername("-priya"));
  assert.ok(!isValidUsername("Priya"));
  assert.ok(!isValidUsername("a".repeat(33)));
  assert.equal(setupLink("https://site.vercel.app/", "invite", "abc"), "https://site.vercel.app/admin/setup/invite#abc");
});
