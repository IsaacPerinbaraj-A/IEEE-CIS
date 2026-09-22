/**
 * The admin API contract, shared by the admin (src/admin), the admin server (server/) and the build (scripts/).
 *
 * Conventions
 * - The browser calls /api/* on the site's own origin (Vercel forwards /api to Render; `npm run dev` proxies it to
 *   http://localhost:8787). Cookies are first-party; the browser holds no secrets.
 * - Requests that change something are POST with `Content-Type: application/json` (send "{}" when there is nothing
 *   to send). The one exception is POST /api/images, whose body is the image itself (image/webp or image/jpeg).
 *   The server rejects other content types (415) and cross-site requests (403 "bad_origin").
 * - Every error response is JSON: ApiError, sometimes with extra fields (see the *Error types below).
 * - Dates are ISO 8601 strings. Ids are strings.
 * - Every /api response has Cache-Control: no-store.
 */
import type { PartialContent, SectionContent } from "./content.ts";
import type { SectionDiff } from "./diff.ts";
import type { Conflict } from "./merge.ts";
import type { ImageFolder, ImageType, SectionKey } from "./sections.ts";
import type { ErrorItem, Errors } from "./validate.ts";

/* ================= Basics ================= */

/** Owner: the web lead, exactly one account (everything, including Accounts). Editor: edit, publish, history, own passphrase. */
export type Role = "owner" | "editor";
export const ROLES = ["owner", "editor"] as const;
/** invited: has an unused invite link and no passphrase yet. */
export type AccountStatus = "invited" | "active" | "deactivated";

/** The version number of each section in a release (sections are versioned separately; a release points at one version of each). */
export type VersionMap = Record<SectionKey, number>;
/** Who did something, as shown in the admin. */
export type ActorName = string;

export type ErrorCode =
  | "bad_request"            // 400: malformed or missing fields
  | "bad_json"               // 400: the body isn't valid JSON
  | "bad_credentials"        // 401: login or passphrase check failed (always the same message)
  | "unauthorized"           // 401: not signed in, or the session ended
  | "forbidden"              // 403: signed in, but the owner is needed
  | "bad_origin"             // 403: cross-site or missing Origin / Sec-Fetch-Site
  | "not_found"              // 404
  | "method_not_allowed"     // 405
  | "invalid_token"          // 404: setup link unknown, used or expired
  | "conflict"               // 409: someone else changed the same items (PublishConflictError)
  | "username_taken"         // 409
  | "not_empty"              // 409: import-starting-content when the database already has content
  | "not_initialised"        // 409: nothing has been published yet (import the starting content first)
  | "payload_too_large"      // 413
  | "unsupported_media_type" // 415
  | "invalid"                // 422: content breaks the rules (ValidationError)
  | "missing_images"         // 422: content points at images the database doesn't have (MissingImagesError)
  | "bad_image"              // 422: not a real WebP/JPEG, or wrong size
  | "weak_passphrase"        // 422: passphrase too short, breached or built from obvious words (WeakPassphraseError)
  | "cannot_change_owner"    // 422: the owner can't be deactivated or reset from Accounts
  | "too_many_attempts"      // 429 (ThrottledError)
  | "server_error"           // 500
  | "not_implemented"        // 501
  | "db_unavailable"         // 503: the database is paused or unreachable
  | "not_configured";        // 503: a server setting is missing (for example EXPORT_TOKEN)

export type ApiError = { error: string; code?: ErrorCode };
export type ValidationError = ApiError & { code: "invalid"; errors: Partial<Record<SectionKey, Errors>>; items: ErrorItem[] };
export type MissingImagesError = ApiError & { code: "missing_images"; paths: string[] };
export type ThrottledError = ApiError & { code: "too_many_attempts"; retryAfterSeconds: number };
export type WeakPassphraseError = ApiError & { code: "weak_passphrase"; reasons: string[] };
export type PublishConflictError = ApiError & {
  code: "conflict";
  /** Same-item clashes, per section. Sections that merged cleanly aren't listed. */
  conflicts: Partial<Record<SectionKey, Conflict[]>>;
  /** What is live now, for the sections the editor sent, so the client can merge ("Load theirs") and retry. */
  theirs: { release: number; publishedAt: string; publishedBy: ActorName; sections: PartialContent; versions: VersionMap };
};
export type OkResponse = { ok: true };

/** Plain messages the server uses (the admin may show its own). */
export const MESSAGES = {
  badCredentials: "That username and passphrase don't match.",
  unauthorized: "Your session has ended. Sign in again.",
  forbidden: "Only the web lead can do that.",
  badOrigin: "This request didn't come from the admin page.",
  dbUnavailable: "The database is not reachable",
  dbPaused: "The database is paused. Ask the web lead to click Resume in MongoDB Atlas.",
  waking: "Waking the server (up to a minute)",
  serverError: "Something went wrong on the server. Try again in a minute.",
  notImplemented: "This part of the admin server isn't built yet.",
} as const;

/* ================= Limits ================= */

export const LIMITS = {
  /** JSON request bodies (content is about 30 KB today). */
  jsonBodyBytes: 2 * 1024 * 1024,
  /** POST /api/backup/import only: a whole backup with images as base64. */
  backupBodyBytes: 25 * 1024 * 1024,
  /** One image upload (the admin produces 30 to 150 KB WebP). */
  imageBytes: 1024 * 1024,
  imageMinSide: 16,
  imageMaxSide: 2000,
  /** Invite and reset links. */
  linkHours: 72,
  sessionIdleMinutes: 60,
  sessionAbsoluteHours: 12,
  /** A session's last-seen time is written at most this often (the idle timer is accurate to this). */
  sessionTouchMinutes: 5,
  passphraseMinLength: 15,
  passphraseMaxLength: 256,
  usernameMinLength: 3,
  usernameMaxLength: 32,
  displayNameMaxLength: 60,
  /** Publish notes. */
  noteMaxLength: 200,
  /** Login throttling (counters live in MongoDB). Per username: after `loginFreeFailures` failures each attempt
   *  must wait loginBaseDelaySeconds × 2^(failures − loginFreeFailures), at most loginMaxDelaySeconds; never a
   *  permanent lock; a success clears it; the counter expires loginCounterHours after the last failure. */
  loginFreeFailures: 5,
  loginBaseDelaySeconds: 30,
  loginMaxDelaySeconds: 15 * 60,
  loginCounterHours: 24,
  /** Per IP: this many failures within the window blocks that IP until the window ends. */
  ipFailureLimit: 50,
  ipWindowMinutes: 15,
  /** A burst of failures across all users only writes an audit entry ("login_spike"); it never blocks. */
  globalSpikeFailuresPerHour: 100,
  /** Setup links: wrong or expired tokens allowed per IP per hour. */
  setupAttemptsPerHour: 10,
  presenceWindowSeconds: 60,
  presenceHeartbeatSeconds: 20,
  historyPageSize: 20,
  historyMaxPageSize: 100,
  auditPageSize: 50,
  auditMaxPageSize: 200,
  auditRetentionDays: 365,
  deployHookTimeoutMs: 10_000,
  /** After a publish the admin polls /content-version.json this often, for up to liveCheckMinutes. */
  liveCheckIntervalSeconds: 5,
  liveCheckMinutes: 5,
  /** The admin retries GET /api/health for up to this long while Render wakes. */
  wakeTimeoutSeconds: 90,
  /** The owner is reminded to download a backup when the last one is older than this. */
  backupReminderDays: 30,
} as const;

/** Usernames: 3 to 32 lowercase letters, numbers, dots, dashes or underscores, starting and ending with a letter or number. */
export const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{1,30})[a-z0-9]$/;
export const normaliseUsername = (s: string) => s.normalize("NFC").trim().toLowerCase();
export const isValidUsername = (s: string) => USERNAME_RE.test(s);

/* ================= Paths ================= */

/** Express route patterns (server). Use `api` below to build URLs in the client. */
export const ROUTES = {
  health: "/api/health",
  login: "/api/auth/login",
  logout: "/api/auth/logout",
  session: "/api/auth/session",
  password: "/api/auth/password",
  setup: "/api/setup/:kind",
  content: "/api/content",
  publish: "/api/publish",
  retryDeploy: "/api/publish/retry-deploy",
  publishStatus: "/api/publish/status",
  history: "/api/history",
  historyRelease: "/api/history/:release",
  restore: "/api/history/restore",
  images: "/api/images",
  image: "/api/images/:id",
  presence: "/api/presence",
  accounts: "/api/accounts",
  invite: "/api/accounts/invite",
  accountReset: "/api/accounts/:id/reset",
  accountDeactivate: "/api/accounts/:id/deactivate",
  accountReactivate: "/api/accounts/:id/reactivate",
  audit: "/api/audit",
  backup: "/api/backup",
  backupImport: "/api/backup/import",
  importStartingContent: "/api/import-starting-content",
  exportPublished: "/api/export/published",
  exportImage: "/api/export/image/:sha",
} as const;

const enc = encodeURIComponent;
const query = (params: Record<string, string | number | undefined | null>) => {
  const q = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${enc(k)}=${enc(String(v))}`);
  return q.length ? `?${q.join("&")}` : "";
};

/** URLs for the client (same origin, relative). */
export const api = {
  health: (checkDb = false) => `${ROUTES.health}${checkDb ? "?db=1" : ""}`,
  login: ROUTES.login,
  logout: ROUTES.logout,
  session: ROUTES.session,
  password: ROUTES.password,
  setup: (kind: SetupKind) => `/api/setup/${enc(kind)}`,
  content: ROUTES.content,
  publish: ROUTES.publish,
  retryDeploy: ROUTES.retryDeploy,
  publishStatus: ROUTES.publishStatus,
  history: (before?: number, limit?: number) => `${ROUTES.history}${query({ before, limit })}`,
  historyRelease: (release: number) => `/api/history/${enc(String(release))}`,
  restore: ROUTES.restore,
  uploadImage: (folder: ImageFolder, name: string) => `${ROUTES.images}${query({ folder, name })}`,
  image: (id: string) => `/api/images/${enc(id)}`,
  presence: ROUTES.presence,
  accounts: ROUTES.accounts,
  invite: ROUTES.invite,
  accountReset: (id: string) => `/api/accounts/${enc(id)}/reset`,
  accountDeactivate: (id: string) => `/api/accounts/${enc(id)}/deactivate`,
  accountReactivate: (id: string) => `/api/accounts/${enc(id)}/reactivate`,
  audit: (before?: string, limit?: number) => `${ROUTES.audit}${query({ before, limit })}`,
  backup: ROUTES.backup,
  backupImport: ROUTES.backupImport,
  importStartingContent: ROUTES.importStartingContent,
} as const;

/* ================= Health ================= */

/** "down" covers a paused Atlas cluster (it can't be told apart from an outage); "not_configured" means no MONGODB_URI. */
export type DbStatus = "up" | "down" | "not_configured";
/**
 * GET /api/health[?db=1] (no sign-in). The admin retries it until JSON with ok: true arrives (Render shows an HTML
 * page while it wakes). With ?db=1 the server also pings the database (about 3 s at most).
 * Render's own health check uses GET /healthz (plain "ok", never touches the database).
 */
export type HealthResponse = { ok: true; time: string; db?: DbStatus };

/* ================= Sign-in and sessions ================= */

export type SessionUser = { id: string; username: string; displayName: string; role: Role };
/**
 * The signed-in user. Sessions end after `sessionIdleMinutes` without requests or `sessionAbsoluteHours` in total.
 * `owner` is present only for the owner.
 */
export type SessionResponse = {
  user: SessionUser;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  owner?: {
    /** SETUP_TOKEN is still set on the server: the admin asks the owner to remove it from Render. */
    setupTokenActive: boolean;
    lastBackupAt: string | null;
  };
};

/** POST /api/auth/login → 200 SessionResponse (sets the session cookie) | 401 bad_credentials | 429 ThrottledError | 503. */
export type LoginRequest = { username: string; passphrase: string };
export type LoginResponse = SessionResponse;
/** POST /api/auth/logout ({}) → 200 OkResponse (ends this session, clears the cookie). Works when already signed out. */
export type LogoutResponse = OkResponse;
/** GET /api/auth/session → 200 SessionResponse (also counts as activity) | 401 unauthorized. */
/**
 * POST /api/auth/password → 200 OkResponse (your other sessions end) | 401 bad_credentials (current passphrase wrong)
 * | 422 WeakPassphraseError | 429 ThrottledError.
 */
export type ChangePassphraseRequest = { current: string; next: string };

/* ================= Setup links (first owner, invites, resets) ================= */

/**
 * owner: the SETUP_TOKEN from Render's settings. Creates the owner when there is none, otherwise resets the owner's
 * passphrase (emergency recovery). Each SETUP_TOKEN value works once.
 * invite: from Accounts, for a new editor. reset: from Accounts, for an editor who forgot their passphrase.
 * The link is `${SITE_ORIGIN}/admin/setup/<kind>#<token>`: the token stays in the fragment, so it never reaches
 * server logs. Tokens are stored only as SHA-256 hashes and expire after `linkHours` (SETUP_TOKEN doesn't expire).
 */
export type SetupKind = "owner" | "invite" | "reset";
export const SETUP_KINDS = ["owner", "invite", "reset"] as const;
export const SETUP_PAGE = "/admin/setup";
export const setupLink = (origin: string, kind: SetupKind, token: string) => `${origin.replace(/\/+$/, "")}${SETUP_PAGE}/${kind}#${token}`;

/**
 * GET /api/setup/:kind with header `Authorization: Bearer <token>` → 200 SetupInfo | 404 invalid_token | 429.
 * mode "create": choose a passphrase for a new account (for kind owner also a username and display name).
 * mode "reset": choose a new passphrase for an existing account.
 */
export type SetupInfo = { kind: SetupKind; mode: "create" | "reset"; username: string | null; displayName: string | null; expiresAt: string | null };
/**
 * POST /api/setup/:kind → 200 SessionResponse (signed in; the link is used up; for resets the account's other
 * sessions end) | 404 invalid_token | 409 username_taken | 422 WeakPassphraseError / bad_request | 429.
 * `username` and `displayName` are needed only for kind owner in mode create.
 */
export type SetupRequest = { token: string; passphrase: string; username?: string; displayName?: string };

/* ================= Content ================= */

/**
 * GET /api/content (signed in) → the live content the editor starts from.
 * release 0 means nothing is published yet (sections and versions are null; the owner can import the starting content).
 * `images` maps every image path the content uses to its image id, for previews of images the site doesn't have yet.
 */
export type ContentResponse = {
  release: number;
  publishedAt: string | null;
  publishedBy: ActorName | null;
  sections: SectionContent | null;
  versions: VersionMap | null;
  images: Record<string, string>;
};

/* ================= Publish ================= */

/** requested: Vercel's deploy hook accepted the rebuild. failed: it didn't (Try again). skipped: no DEPLOY_HOOK_URL (local). */
export type DeployState = "requested" | "failed" | "skipped";
/** `error`: why the rebuild failed, or (for "skipped") why it wasn't requested, in plain words. */
export type DeployInfo = { state: DeployState; at: string; error?: string };

/**
 * POST /api/publish (signed in). Send only the sections you changed, each with its full new content, plus the
 * release you started from. The server merges item by item with anything published since (merge.ts):
 * - no clashes → 200 PublishResponse (a new release; the site rebuild is requested);
 * - same-item clashes → 409 PublishConflictError, unless `force` ("Publish mine anyway": clashing items take
 *   your version; other people's changes to other items are kept);
 * - rule breaks → 422 ValidationError; unknown image paths → 422 MissingImagesError;
 * - nothing published yet → 409 not_initialised; nothing actually changed → 400 bad_request.
 * Images are found from the content's paths (upload them first with POST /api/images).
 */
export type PublishRequest = { baseRelease: number; sections: PartialContent; note?: string; force?: boolean };
export type PublishResponse = {
  release: number;
  publishedAt: string;
  /** The sections as published (after merging). The client replaces its copies and uses `release` as its new base. */
  sections: PartialContent;
  versions: VersionMap;
  /** Sections that were combined with someone else's newer changes. */
  merged: SectionKey[];
  /** Plain summary per published section ("1 event added (ANALYTICA)"). */
  summaries: Partial<Record<SectionKey, string>>;
  deploy: DeployInfo;
};
/** POST /api/publish/retry-deploy ({}) → 200: asks Vercel to rebuild the latest release again. */
export type RetryDeployResponse = { release: number; deploy: DeployInfo };
/** GET /api/publish/status → the latest release and its rebuild request. "Live" is confirmed by /content-version.json. */
export type PublishStatus = { release: number; publishedAt: string | null; publishedBy: ActorName | null; deploy: DeployInfo | null };

/* ================= History and undo ================= */

/** How a release was made. */
export type ReleaseSource = "publish" | "restore" | "import" | "backup";
export type ReleaseSummary = {
  release: number;
  publishedAt: string;
  publishedBy: ActorName;
  note: string;
  /** Sections whose content changed in this release. */
  changed: SectionKey[];
  summaries: Partial<Record<SectionKey, string>>;
  source: ReleaseSource;
  /** For source "restore": which release (and section, or all of it) was made live again. */
  restoredFrom: { release: number; section: SectionKey | null } | null;
  deploy: DeployInfo | null;
};
/** GET /api/history?before=<release>&limit=<n> → newest first. `nextBefore` is null on the last page. */
export type HistoryPage = { releases: ReleaseSummary[]; nextBefore: number | null };
/** GET /api/history/:release → the full content of that release, with what changed compared to the release before it. */
export type ReleaseDetail = { summary: ReleaseSummary; sections: SectionContent; versions: VersionMap; diffs: Partial<Record<SectionKey, SectionDiff>> };
/**
 * POST /api/history/restore → 200 RestoreResponse. Makes an old release live again, or just one section of it,
 * by creating a new release (nothing is erased). No merging: the chosen content replaces what is live.
 */
export type RestoreRequest = { release: number; section?: SectionKey; note?: string };
export type RestoreResponse = PublishResponse;

/* ================= Images ================= */

/**
 * POST /api/images?folder=<team|events|achievements>&name=<what it shows, e.g. "priya s"> (signed in).
 * Body: the image bytes, Content-Type image/webp or image/jpeg, at most `imageBytes`, sides `imageMinSide` to
 * `imageMaxSide` px. → 200 ImageUploadResponse | 413 | 415 | 422 bad_image.
 * `path` is what the content stores (for example /images/team/priya-s-3fa9c2d1e0.webp). Paths never change, so an
 * old release keeps its exact photos; uploading the same bytes again returns the same image.
 * GET /api/images/:id (signed in) → the image bytes, for previews of images the live site doesn't have yet.
 */
export type ImageUploadResponse = { id: string; path: string; contentType: ImageType; width: number; height: number; size: number };

/* ================= Who is editing ================= */

/**
 * POST /api/presence { section } every `presenceHeartbeatSeconds` while an editor has a section open (null when
 * they're elsewhere in the admin) → PresenceResponse. GET /api/presence → PresenceResponse.
 * Lists everyone seen in the last `presenceWindowSeconds`, including the caller (filter by user id).
 */
export type PresenceRequest = { section: SectionKey | null };
export type PresenceEntry = { userId: string; name: ActorName; section: SectionKey | null; at: string };
export type PresenceResponse = { editors: PresenceEntry[] };

/* ================= Accounts (owner only) ================= */

export type Account = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  status: AccountStatus;
  createdAt: string;
  lastLoginAt: string | null;
  /** An unused invite or reset link. */
  pendingLink: { kind: "invite" | "reset"; expiresAt: string } | null;
};
/** GET /api/accounts → everyone, the owner first. */
export type AccountsResponse = { accounts: Account[] };
/** POST /api/accounts/invite → 200 LinkResponse | 409 username_taken | 422 bad_request. New accounts are always editors. */
export type InviteRequest = { username: string; displayName: string };
/**
 * The one-time link to send privately (shown once; only its hash is stored). Creating a new link replaces any
 * unused one for that account.
 */
export type LinkResponse = { account: Account; link: string; expiresAt: string };
/**
 * POST /api/accounts/:id/reset ({}) → 200 LinkResponse. The current passphrase keeps working until the link is used.
 * POST /api/accounts/:id/deactivate ({}) → 200 AccountResponse: signs them out everywhere and cancels their links.
 * POST /api/accounts/:id/reactivate ({}) → 200 AccountResponse.
 * The owner's own account can't be reset or deactivated here (422 cannot_change_owner).
 */
export type AccountResponse = { account: Account };

export type AuditAction =
  | "login" | "login_failed" | "login_throttled" | "login_spike" | "logout"
  | "passphrase_changed" | "setup_owner" | "setup_invite" | "setup_reset"
  | "invite_created" | "reset_created" | "account_deactivated" | "account_reactivated"
  | "publish" | "restore" | "deploy_failed" | "deploy_retry"
  | "image_upload" | "backup_download" | "backup_import" | "import_starting_content";
export type AuditEntry = { id: string; at: string; actor: ActorName | null; action: AuditAction; target: string | null; detail: string | null };
/** GET /api/audit?before=<id>&limit=<n> → newest first, kept for `auditRetentionDays`. */
export type AuditPage = { entries: AuditEntry[]; nextBefore: string | null };

/* ================= Backups and starting content (owner only) ================= */

export type BackupRelease = {
  release: number; publishedAt: string; publishedBy: ActorName; note: string; versions: VersionMap; changed: SectionKey[];
  source: ReleaseSource; restoredFrom: { release: number; section: SectionKey | null } | null;
};
export type BackupSectionVersion = { section: SectionKey; n: number; content: unknown; createdAt: string; createdBy: ActorName; release: number };
export type BackupImage = { path: string; sha256: string; contentType: ImageType; width: number; height: number; size: number; data: string /* base64 */ };
/**
 * GET /api/backup → this JSON as a file download (Content-Disposition: attachment; filename="cis-backup-YYYY-MM-DD.json").
 * Every release, every section version and every image, plus the account list without passphrases (`accounts`, so
 * people can be invited again after a disaster). Passphrase hashes, sessions and links are never included.
 */
export type BackupFile = {
  format: "ieee-cis-admin-backup";
  version: 1;
  createdAt: string;
  /** The live release when the backup was made. */
  release: number;
  releases: BackupRelease[];
  sectionVersions: BackupSectionVersion[];
  images: BackupImage[];
  /** Ignored by an import. */
  accounts?: { username: string; displayName: string; role: Role; status: AccountStatus; createdAt: string }[];
};
/**
 * POST /api/backup/import (body up to `backupBodyBytes`) → 200 BackupImportResponse. Adds the backup's images that
 * the database doesn't have, then makes the backup's live release content live again as a new release
 * (source "backup"). Nothing already in the database is removed.
 */
export type BackupImportRequest = { backup: BackupFile; note?: string };
/** `warnings`: rules the imported content breaks (it is imported anyway, like the starting content); fix them and publish. */
export type BackupImportResponse = { release: number; imagesAdded: number; deploy: DeployInfo; warnings: ErrorItem[] };
/**
 * POST /api/import-starting-content (StartingContentRequest) → 200 StartingContentResponse | 409 not_empty. Only while
 * no release exists: reads src/data/*.json and public/images/{team,events,achievements} from the server's copy of the
 * repository and makes release 1 (source "import"). The files are normalised but not blocked by the rules;
 * problems come back as `warnings` and must be fixed in the admin before those sections can be published again.
 * The site rebuild is requested only with `deploy: true` and no warnings (the build refuses rule breaks); otherwise
 * deploy.state is "skipped" with the reason in deploy.error.
 */
export type StartingContentRequest = { deploy?: boolean };
export type StartingContentResponse = { release: number; imagesAdded: number; warnings: ErrorItem[]; deploy: DeployInfo };

/* ================= Build export (Vercel build only) ================= */

/**
 * GET /api/export/published with `Authorization: Bearer <EXPORT_TOKEN>` (called directly on the Render URL by
 * scripts/fetch-content.ts) → the live release: every section and the images it uses. 401 without the token;
 * 409 not_initialised when nothing is published; 503 not_configured when EXPORT_TOKEN isn't set.
 * GET /api/export/image/:sha (same token) → the image bytes.
 */
export type ExportImage = { path: string; sha256: string; contentType: ImageType; size: number };
export type ExportPublished = { release: number; publishedAt: string; sections: SectionContent; images: ExportImage[] };

/** Files every Vercel build writes into public/ (and so into the site). */
export const CONTENT_VERSION_PATH = "/content-version.json";
export const CONTENT_SNAPSHOT_PATH = "/content-snapshot.json";
/** Where the build got the content: the Render export, the live site's snapshot (fallback), or the repository files. */
export type ContentSource = "export" | "snapshot" | "repo";
/** /content-version.json: the admin polls it after publishing until `release` reaches the new release. */
export type ContentVersion = { release: number | null; builtAt: string; source: ContentSource };
/** /content-snapshot.json: the published content baked into this build; the next build falls back to it. */
export type ContentSnapshot = ExportPublished & { builtAt: string };
