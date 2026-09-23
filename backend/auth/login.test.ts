/**
 * The sign-in route against a small in-memory stand-in for the collections it uses (nothing connects anywhere):
 * what failed sign-ins write to the activity log, and that parallel attempts for one username can't all slip
 * past the delay check before their failures are counted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { ObjectId } from "mongodb";
import { createApp } from "../app.ts";
import { loadConfig } from "../config.ts";
import type { AuditDoc, Collections, Database, LoginAttemptDoc, UserDoc } from "../db.ts";
import type { AppDeps } from "../deps.ts";
import { silentLogger } from "../log.ts";
import { UNKNOWN_USERNAME } from "../routes/auth.ts";
import { join } from "node:path";

/** The project that holds the starting copy (src/data and public/images). */
const contentRoot = () => join(process.cwd(), "frontend");


type Store = { users: UserDoc[]; attempts: Map<string, LoginAttemptDoc>; audit: AuditDoc[] };

function fakeDb(store: Store): Database {
  const loginAttempts = {
    find: (f: { _id: { $in: string[] } }) => ({ toArray: async () => f._id.$in.flatMap(id => store.attempts.get(id) ?? []) }),
    findOne: async (f: { _id: string }) => store.attempts.get(f._id) ?? null,
    findOneAndUpdate: async (f: { _id: string }, u: { $inc: { failures: number }; $set: Pick<LoginAttemptDoc, "lastAt" | "expiresAt">; $setOnInsert: Pick<LoginAttemptDoc, "firstAt" | "lockedUntil"> }) => {
      const current = store.attempts.get(f._id) ?? { _id: f._id, failures: 0, ...u.$setOnInsert, ...u.$set };
      const next: LoginAttemptDoc = { ...current, ...u.$set, failures: current.failures + u.$inc.failures };
      store.attempts.set(f._id, next);
      return next;
    },
    updateOne: async (f: { _id: string }, u: { $max: { lockedUntil: Date } }) => {
      const doc = store.attempts.get(f._id);
      if (doc && (!doc.lockedUntil || doc.lockedUntil < u.$max.lockedUntil)) doc.lockedUntil = u.$max.lockedUntil;
      return { modifiedCount: 1 };
    },
    deleteOne: async (f: { _id: string }) => ({ deletedCount: store.attempts.delete(f._id) ? 1 : 0 }),
  };
  const users = { findOne: async (f: { username: string }) => store.users.find(u => u.username === f.username) ?? null };
  const audit = { insertOne: async (d: AuditDoc) => { store.audit.push(d); return { insertedId: d._id }; } };
  const c = { loginAttempts, users, audit } as unknown as Collections;
  return {
    configured: true,
    collections: async () => c,
    db: async () => { throw new Error("not used"); },
    transaction: async () => { throw new Error("not used"); },
    ping: async () => "up",
    close: async () => undefined,
  };
}

const editor = (username: string): UserDoc => ({
  _id: new ObjectId(), username, displayName: "Priya", role: "editor", status: "active",
  passphraseHash: null, passphraseChangedAt: null, createdAt: new Date("2026-09-01T00:00:00Z"),
  createdBy: { id: null, name: "System" }, lastLoginAt: null, deactivatedAt: null,
});

async function withApp(store: Store, fn: (login: (username: string, passphrase: string) => Promise<Response>) => Promise<void>) {
  const config = loadConfig({});
  const deps: AppDeps = {
    config, db: fakeDb(store), log: silentLogger, now: () => new Date("2026-09-22T10:00:00.000Z"),
    fetch: () => Promise.reject(new Error("no network in tests")), repoRoot: contentRoot(),
  };
  const server = createApp(deps).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await fn((username, passphrase) => fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ username, passphrase }),
    }));
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

test("a failed sign-in's activity entry names real accounts only, never the text that was typed", async () => {
  const store: Store = { users: [editor("priya")], attempts: new Map(), audit: [] };
  await withApp(store, async login => {
    let r = await login("Priya", "wrong but long enough passphrase");
    assert.equal(r.status, 401);
    // Someone pastes their passphrase into the username box
    r = await login("maple-lanterns-drift-harbours", "maple-lanterns-drift-harbours");
    assert.equal(r.status, 401);
  });
  assert.deepEqual(store.audit.map(a => [a.action, a.target]), [["login_failed", "priya"], ["login_failed", UNKNOWN_USERNAME]]);
  assert.ok(!JSON.stringify(store.audit).includes("maple"), "the typed text is not stored");
});

test("parallel sign-ins for one username: one is checked, the others are told to wait", async () => {
  const store: Store = { users: [editor("priya")], attempts: new Map(), audit: [] };
  await withApp(store, async login => {
    const answers = await Promise.all([1, 2, 3].map(i => login("priya", `wrong passphrase number ${i} here`)));
    const statuses = answers.map(r => r.status).sort();
    assert.equal(statuses.filter(s => s === 401).length, 1, statuses.join());
    assert.equal(statuses.filter(s => s === 429).length, 2, statuses.join());
    for (const r of answers.filter(a => a.status === 429)) {
      const body = (await r.json()) as { code: string; retryAfterSeconds: number };
      assert.equal(body.code, "too_many_attempts");
      assert.ok(body.retryAfterSeconds > 0);
    }
    // Once the first attempt is done, the username can be tried again
    assert.equal((await login("priya", "another wrong passphrase here")).status, 401);
  });
  assert.equal(store.attempts.get("u:priya")?.failures, 2, "only the attempts that were checked count");
});
