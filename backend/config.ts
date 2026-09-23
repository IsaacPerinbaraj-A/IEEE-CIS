/**
 * Settings from environment variables (Render's Environment tab in production, .env.local on your computer).
 * None of them may ever reach the browser, and none use a VITE_ prefix.
 *
 * Render (production): MONGODB_URI, MONGODB_DB (default "cis"), SITE_ORIGIN, EXPORT_TOKEN, DEPLOY_HOOK_URL,
 * SETUP_TOKEN (only until the first owner exists), IP_HASH_KEY, NODE_VERSION (read by Render, not by this code),
 * PORT (set by Render). Production is NODE_ENV=production or Render's own RENDER=true.
 */

export type Config = {
  production: boolean;
  port: number;
  /** null when not set (local development without a database: routes that need it answer 503). */
  mongodbUri: string | null;
  mongodbDb: string;
  /** The website's origin, e.g. https://ieee-cis-rec.vercel.app (no trailing slash). */
  siteOrigin: string;
  /** Bearer token the Vercel build sends to /api/export/* (Vercel's CONTENT_EXPORT_TOKEN). null: export disabled. */
  exportToken: string | null;
  /** Vercel Deploy Hook. null: publishes are saved but no rebuild is requested (deploy state "skipped"). */
  deployHookUrl: string | null;
  /** One-time token for creating the first owner (or recovering the owner). null when not set. */
  setupToken: string | null;
  /** HMAC key for storing IP addresses only as pseudonyms. */
  ipHashKey: string;
  /** "__Host-cis_session" in production (needs HTTPS); "cis_session" locally, where the site is plain http. */
  cookieName: string;
  cookieSecure: boolean;
};

export class ConfigError extends Error {
  problems: string[];
  constructor(problems: string[]) {
    super(`The admin server's settings need attention:\n${problems.map(p => `  - ${p}`).join("\n")}`);
    this.name = "ConfigError";
    this.problems = problems;
  }
}

/** Local defaults (npm run server). The Vite dev server runs on 5175 in this project's launch settings. */
export const DEV_DEFAULTS = {
  port: 8787,
  siteOrigin: "http://localhost:5175",
  mongodbDb: "cis",
  ipHashKey: "local-development-only-ip-hash-key",
} as const;

const MIN_SECRET_LENGTH = 32;

type Env = Record<string, string | undefined>;

/** Reads and checks the settings. Throws a ConfigError listing every problem (production needs the required ones). */
export function loadConfig(env: Env): Config {
  const get = (k: string) => {
    const v = env[k]?.trim();
    return v ? v : null;
  };
  const production = env.NODE_ENV === "production" || env.RENDER === "true";
  const problems: string[] = [];
  const required = (k: string, what: string) => {
    const v = get(k);
    if (!v && production) problems.push(`${k} is missing (${what}).`);
    return v;
  };

  // PORT
  const portText = get("PORT");
  let port: number = DEV_DEFAULTS.port;
  if (portText) {
    port = Number(portText);
    if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push("PORT must be a whole number from 1 to 65535.");
  }

  // Database
  const mongodbUri = required("MONGODB_URI", "the MongoDB Atlas connection string");
  if (mongodbUri && !/^mongodb(\+srv)?:\/\//.test(mongodbUri)) problems.push("MONGODB_URI must start with mongodb+srv:// or mongodb://.");
  const mongodbDb = get("MONGODB_DB") ?? DEV_DEFAULTS.mongodbDb;
  if (!/^[A-Za-z0-9_-]{1,63}$/.test(mongodbDb)) problems.push("MONGODB_DB may only use letters, numbers, dashes and underscores.");

  // Site origin (checked against the Origin header of changing requests)
  const originText = required("SITE_ORIGIN", "the website address, e.g. https://ieee-cis-rec.vercel.app");
  let siteOrigin: string = DEV_DEFAULTS.siteOrigin;
  if (originText) {
    let parsed: URL | null = null;
    try { parsed = new URL(originText); } catch { /* reported below */ }
    const bare = originText.replace(/\/+$/, "");
    if (!parsed || (parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.origin !== bare)
      problems.push("SITE_ORIGIN must be just the site's address, like https://ieee-cis-rec.vercel.app (no path).");
    else if (production && parsed.protocol !== "https:") problems.push("SITE_ORIGIN must start with https:// in production.");
    else siteOrigin = parsed.origin;
  }

  // Secrets
  const exportToken = required("EXPORT_TOKEN", "the token the Vercel build uses to fetch published content");
  if (exportToken && exportToken.length < MIN_SECRET_LENGTH) problems.push(`EXPORT_TOKEN must be at least ${MIN_SECRET_LENGTH} characters (use Render's Generate button).`);
  const ipKey = required("IP_HASH_KEY", "a random key for storing IP addresses as pseudonyms");
  if (ipKey && ipKey.length < MIN_SECRET_LENGTH) problems.push(`IP_HASH_KEY must be at least ${MIN_SECRET_LENGTH} characters (use Render's Generate button).`);
  const setupToken = get("SETUP_TOKEN");
  if (setupToken && setupToken.length < MIN_SECRET_LENGTH) problems.push(`SETUP_TOKEN must be at least ${MIN_SECRET_LENGTH} characters (use Render's Generate button).`);

  // Deploy hook (optional: without it, publishing still saves releases)
  const deployHookUrl = get("DEPLOY_HOOK_URL");
  if (deployHookUrl) {
    let ok = false;
    try { ok = new URL(deployHookUrl).protocol === "https:"; } catch { ok = false; }
    if (!ok) problems.push("DEPLOY_HOOK_URL must be the https:// link from Vercel's Deploy Hooks settings.");
  }

  if (problems.length) throw new ConfigError(problems);
  return {
    production,
    port,
    mongodbUri,
    mongodbDb,
    siteOrigin,
    exportToken,
    deployHookUrl,
    setupToken,
    ipHashKey: ipKey ?? DEV_DEFAULTS.ipHashKey,
    cookieName: production ? "__Host-cis_session" : "cis_session",
    cookieSecure: production,
  };
}

/** A log-safe summary of the settings (which ones are set, never their values). */
export function describeConfig(c: Config) {
  return {
    mode: c.production ? "production" : "development",
    port: c.port,
    database: c.mongodbUri ? `set (${c.mongodbDb})` : "not set",
    siteOrigin: c.siteOrigin,
    exportToken: c.exportToken ? "set" : "not set",
    deployHook: c.deployHookUrl ? "set" : "not set",
    setupToken: c.setupToken ? "set" : "not set",
  };
}
