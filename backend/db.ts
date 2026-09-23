/**
 * MongoDB Atlas (free M0 cluster, a replica set, so transactions work). One MongoClient with a small pool.
 *
 * The connection is lazy: the server starts and answers /healthz and /api/health without a database, and any
 * route that needs one gets 503 { code: "db_unavailable" } (DbUnavailableError) until it's reachable. Indexes are
 * created after the first successful connection. Nothing here deletes history: releases, section versions and
 * images are only ever added.
 */
import { Binary, MongoClient, type ClientSession, type Collection, type Db, type ObjectId } from "mongodb";
import { LIMITS, type AccountStatus, type AuditAction, type DeployState, type ReleaseSource, type Role } from "../shared/api.ts";
import type { SectionContent } from "../shared/content.ts";
import type { ImageFolder, ImageType, SectionKey } from "../shared/sections.ts";
import type { Config } from "./config.ts";
import { DbUnavailableError, isDbConnectionError } from "./http/errors.ts";
import type { Logger } from "./log.ts";

export { Binary };

/* ================= Documents ================= */

/** Who did something. `id` is null for the system (for example the one-time owner setup before the owner exists). */
export type ActorRef = { id: ObjectId | null; name: string };

export type UserDoc = {
  _id: ObjectId;
  /** Lowercase (normaliseUsername); unique. */
  username: string;
  displayName: string;
  /** Exactly one account has role "owner" (a unique partial index enforces it). */
  role: Role;
  status: AccountStatus;
  /** "scrypt$N$r$p$saltB64url$hashB64url"; null until the invite link is used. */
  passphraseHash: string | null;
  passphraseChangedAt: Date | null;
  createdAt: Date;
  createdBy: ActorRef;
  lastLoginAt: Date | null;
  deactivatedAt: Date | null;
};

export type SessionDoc = {
  /** SHA-256 (hex) of the cookie token; the token itself is never stored. */
  _id: string;
  userId: ObjectId;
  createdAt: Date;
  lastSeenAt: Date;
  /** lastSeenAt + sessionIdleMinutes */
  idleExpiresAt: Date;
  /** createdAt + sessionAbsoluteHours */
  absoluteExpiresAt: Date;
  /** The earlier of the two; TTL index (MongoDB removes it within about a minute; code must also check). */
  expiresAt: Date;
  ipHash: string;
  userAgent: string;
};

export type InviteDoc = {
  /** SHA-256 (hex) of the link token. */
  _id: string;
  kind: "invite" | "reset";
  userId: ObjectId;
  createdAt: Date;
  createdBy: ActorRef;
  /** TTL index. */
  expiresAt: Date;
};

export type LoginAttemptDoc = {
  /**
   * "u:<username, at most 64 characters>" | "ip:<ipHash>:<start of the 15-minute window, base 36>" |
   * "setup:<ipHash>:<UTC hour>" | "g:<UTC hour, e.g. 2026-09-22T14>" (time buckets keep each counter update atomic)
   */
  _id: string;
  failures: number;
  firstAt: Date;
  lastAt: Date;
  /** Attempts are refused until then (username delay or IP block). */
  lockedUntil: Date | null;
  /** TTL index. */
  expiresAt: Date;
};

export type SectionVersionDoc<K extends SectionKey = SectionKey> = {
  /** `${section}:${n}` (sectionVersionId), unique by construction. */
  _id: string;
  section: K;
  /** 1, 2, 3… per section. */
  n: number;
  /** Normalised, validated content (validate.ts). */
  content: SectionContent[K];
  createdAt: Date;
  createdBy: ActorRef;
  /** The release that first used this version. */
  release: number;
};

export type ReleaseDoc = {
  /** The release number: 1, 2, 3… The highest is live. */
  _id: number;
  publishedAt: Date;
  publishedBy: ActorRef;
  note: string;
  /** Which version of every section this release uses. */
  versions: Record<SectionKey, number>;
  /** Sections whose content changed compared to the previous release. */
  changed: SectionKey[];
  /** Plain summaries per changed section (diff.ts). */
  summaries: Partial<Record<SectionKey, string>>;
  source: ReleaseSource;
  restoredFrom: { release: number; section: SectionKey | null } | null;
  /** Sections combined with someone else's newer changes (publish only). */
  merged: SectionKey[];
  /** Every image path the release's content uses (all sections). */
  images: string[];
};

export type ImageDoc = {
  /** The public path, e.g. /images/team/priya-s-3fa9c2d1e0.webp (IMAGE_PATH_RE). Never changes. */
  _id: string;
  /** SHA-256 hex of the bytes: the image id in the API. Indexed, not unique (starting images may share bytes). */
  sha256: string;
  folder: ImageFolder;
  contentType: ImageType;
  size: number;
  width: number;
  height: number;
  data: Binary;
  createdAt: Date;
  createdBy: ActorRef;
};

export type DeployDoc = {
  /** The release number the rebuild was requested for. */
  _id: number;
  state: DeployState;
  attempts: number;
  requestedAt: Date;
  updatedAt: Date;
  /** Short plain reason when state is "failed" (never the hook URL). */
  error: string | null;
};

export type PresenceDoc = {
  /** The user's id as hex. */
  _id: string;
  userId: ObjectId;
  name: string;
  section: SectionKey | null;
  at: Date;
  /** TTL index: at + presenceWindowSeconds. */
  expiresAt: Date;
};

export type AuditDoc = {
  _id: ObjectId;
  /** TTL index: kept auditRetentionDays. */
  at: Date;
  actor: ActorRef | null;
  action: AuditAction;
  target: string | null;
  detail: string | null;
  ipHash: string | null;
};

/** Small single documents: "setup-token" (the SHA-256 of each SETUP_TOKEN value already used) and "last-backup". */
export type MetaDoc =
  | { _id: "setup-token"; usedHashes: string[]; updatedAt: Date }
  | { _id: "last-backup"; at: Date; by: ActorRef };

export type Collections = {
  users: Collection<UserDoc>;
  sessions: Collection<SessionDoc>;
  invites: Collection<InviteDoc>;
  loginAttempts: Collection<LoginAttemptDoc>;
  sectionVersions: Collection<SectionVersionDoc>;
  releases: Collection<ReleaseDoc>;
  images: Collection<ImageDoc>;
  deploys: Collection<DeployDoc>;
  presence: Collection<PresenceDoc>;
  audit: Collection<AuditDoc>;
  meta: Collection<MetaDoc>;
};

export const COLLECTION_NAMES: Record<keyof Collections, string> = {
  users: "users",
  sessions: "sessions",
  invites: "invites",
  loginAttempts: "login_attempts",
  sectionVersions: "section_versions",
  releases: "releases",
  images: "images",
  deploys: "deploys",
  presence: "presence",
  audit: "audit",
  meta: "meta",
};

/** The _id of a section version document. */
export const sectionVersionId = (section: SectionKey, n: number) => `${section}:${n}`;

export function collectionsOf(db: Db): Collections {
  return {
    users: db.collection<UserDoc>(COLLECTION_NAMES.users),
    sessions: db.collection<SessionDoc>(COLLECTION_NAMES.sessions),
    invites: db.collection<InviteDoc>(COLLECTION_NAMES.invites),
    loginAttempts: db.collection<LoginAttemptDoc>(COLLECTION_NAMES.loginAttempts),
    sectionVersions: db.collection<SectionVersionDoc>(COLLECTION_NAMES.sectionVersions),
    releases: db.collection<ReleaseDoc>(COLLECTION_NAMES.releases),
    images: db.collection<ImageDoc>(COLLECTION_NAMES.images),
    deploys: db.collection<DeployDoc>(COLLECTION_NAMES.deploys),
    presence: db.collection<PresenceDoc>(COLLECTION_NAMES.presence),
    audit: db.collection<AuditDoc>(COLLECTION_NAMES.audit),
    meta: db.collection<MetaDoc>(COLLECTION_NAMES.meta),
  };
}

const DAY_SECONDS = 24 * 60 * 60;

/** Unique and expiry (TTL) indexes. Safe to run again: MongoDB ignores an identical existing index. */
export async function ensureIndexes(c: Collections): Promise<void> {
  await Promise.all([
    c.users.createIndex({ username: 1 }, { unique: true, name: "username_unique" }),
    c.users.createIndex({ role: 1 }, { unique: true, partialFilterExpression: { role: "owner" }, name: "one_owner" }),
    c.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl" }),
    c.sessions.createIndex({ userId: 1 }, { name: "user" }),
    c.invites.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl" }),
    c.invites.createIndex({ userId: 1 }, { name: "user" }),
    c.loginAttempts.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl" }),
    c.sectionVersions.createIndex({ section: 1, n: -1 }, { unique: true, name: "section_n_unique" }),
    c.images.createIndex({ sha256: 1 }, { name: "sha256" }),
    c.presence.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl" }),
    c.audit.createIndex({ at: 1 }, { expireAfterSeconds: LIMITS.auditRetentionDays * DAY_SECONDS, name: "ttl_retention" }),
  ]);
}

/* ================= Connection ================= */

export type Database = {
  /** False when MONGODB_URI isn't set (every call below then throws DbUnavailableError). */
  readonly configured: boolean;
  /** The typed collections; connects on first use. Throws DbUnavailableError when the database can't be reached. */
  collections(): Promise<Collections>;
  /** The raw database handle (for anything not covered above). */
  db(): Promise<Db>;
  /**
   * Runs `fn` in a multi-document transaction (retried by the driver on transient errors, so `fn` may run more
   * than once and must not have side effects outside the database). Pass `session` to every operation inside.
   */
  transaction<T>(fn: (session: ClientSession, c: Collections) => Promise<T>): Promise<T>;
  /** "up", "down" or "not_configured", within about `timeoutMs`. Never throws. */
  ping(timeoutMs?: number): Promise<"up" | "down" | "not_configured">;
  close(): Promise<void>;
};

/** For tests: a MongoClient factory (defaults to the real driver). */
export type ClientFactory = (uri: string) => MongoClient;

export function createDatabase(config: Config, log: Logger, clientFactory?: ClientFactory): Database {
  const uri = config.mongodbUri;
  const factory: ClientFactory = clientFactory ?? (u => new MongoClient(u, {
    appName: "cis-admin",
    maxPoolSize: 5,
    minPoolSize: 0,
    maxIdleTimeMS: 60_000,
    serverSelectionTimeoutMS: 8_000,
    connectTimeoutMS: 10_000,
  }));
  let client: MongoClient | null = null;
  let connecting: Promise<MongoClient> | null = null;
  let indexesReady = false;

  const connect = async (): Promise<MongoClient> => {
    if (!uri) throw new DbUnavailableError("The database isn't set up (MONGODB_URI is empty)");
    if (client) return client;
    if (!connecting) {
      connecting = (async () => {
        const c = factory(uri);
        try {
          await c.connect();
          client = c;
          log.info("db_connected", { database: config.mongodbDb });
          if (!indexesReady) {
            ensureIndexes(collectionsOf(c.db(config.mongodbDb)))
              .then(() => { indexesReady = true; log.info("db_indexes_ready"); })
              .catch((e: unknown) => log.warn("db_indexes_failed", { errorName: (e as Error)?.name }));
          }
          return c;
        } catch (e) {
          await c.close().catch(() => undefined);
          throw e;
        } finally {
          connecting = null;
        }
      })();
    }
    try {
      return await connecting;
    } catch (e) {
      log.warn("db_connect_failed", { errorName: (e as Error)?.name });
      throw new DbUnavailableError();
    }
  };

  const db = async () => (await connect()).db(config.mongodbDb);

  return {
    configured: !!uri,
    db,
    collections: async () => collectionsOf(await db()),
    async transaction<T>(fn: (session: ClientSession, c: Collections) => Promise<T>): Promise<T> {
      const c = await connect();
      const cols = collectionsOf(c.db(config.mongodbDb));
      const session = c.startSession();
      try {
        return await session.withTransaction(s => fn(s, cols));
      } catch (e) {
        if (isDbConnectionError(e)) throw new DbUnavailableError();
        throw e;
      } finally {
        await session.endSession().catch(() => undefined);
      }
    },
    async ping(timeoutMs = 3_000) {
      if (!uri) return "not_configured";
      const attempt = (async () => {
        const d = await db();
        await d.command({ ping: 1 });
        return "up" as const;
      })().catch(() => "down" as const);
      const timeout = new Promise<"down">(resolve => { const t = setTimeout(() => resolve("down"), timeoutMs); t.unref(); });
      return Promise.race([attempt, timeout]);
    },
    async close() {
      const c = client;
      client = null;
      if (c) await c.close().catch(() => undefined);
    },
  };
}
