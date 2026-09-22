/**
 * The admin's only way to talk to the admin server: same-origin /api calls (Vercel forwards them to Render; `npm run
 * dev` proxies them to the local server). JSON in and out, images as raw bytes. The browser holds no secrets: the
 * session is an HttpOnly cookie the server sets.
 *
 * - Errors throw ApiError with the server's message and code (plus any extra fields in `data`).
 * - 401 "unauthorized" (the session ended): opens the sign-in dialog (see setReauthHandler) and, once signed in
 *   again, repeats the request, so unsaved work and half-finished actions carry on.
 * - Render's free server sleeps when idle and answers with an HTML page or a gateway error while it wakes: the call
 *   waits for GET /api/health to answer (showing "Waking the server") and is tried once more.
 * - 503 "db_unavailable": the message says the database is paused.
 */
import { LIMITS, MESSAGES, api as paths, type HealthResponse } from "../../shared/api.ts";

export { paths };

export class ApiError extends Error {
  status: number;
  code?: string;
  /** The whole JSON error body, for the extra fields some errors carry (conflicts, items, reasons, retryAfterSeconds…). */
  data: Record<string, unknown>;
  constructor(message: string, status: number, code?: string, data: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export type ApiInit = {
  method?: string;
  body?: unknown;
  raw?: Blob;
  contentType?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Don't open the sign-in dialog on 401 (the sign-in check itself). */
  noReauth?: boolean;
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); reject(signal.reason); }, { once: true });
});

/** "30 seconds", "1 minute", "4 minutes". */
export function waitText(seconds: number) {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 60) return `${s} seconds`;
  const m = Math.ceil(s / 60);
  return `${m} ${m === 1 ? "minute" : "minutes"}`;
}

async function readJson(res: Response): Promise<unknown> {
  if (!(res.headers.get("content-type") || "").includes("application/json")) return undefined;
  try { return await res.json(); } catch { return undefined; }
}

function errorFrom(status: number, data: unknown): ApiError {
  const d = isObject(data) ? data : {};
  const code = typeof d.code === "string" ? d.code : undefined;
  let message = typeof d.error === "string" && d.error ? d.error : `The server answered with error ${status}.`;
  if (code === "db_unavailable") message = MESSAGES.dbPaused;
  if (code === "too_many_attempts" && typeof d.retryAfterSeconds === "number")
    message = `Too many attempts. Wait ${waitText(d.retryAfterSeconds)} and try again.`;
  return new ApiError(message, status, code, d);
}

/* ---------- Signing in again when the session ends ---------- */

type ReauthHandler = () => Promise<void>;
let reauthHandler: ReauthHandler | null = null;
let reauthPending: Promise<void> | null = null;

/** The workspace registers the sign-in dialog here. It resolves once signed in again, and rejects if they sign out. */
export function setReauthHandler(fn: ReauthHandler | null) { reauthHandler = fn; }

function signInAgain(): Promise<void> {
  if (!reauthHandler) return Promise.reject(new Error("No sign-in dialog"));
  reauthPending ??= reauthHandler().finally(() => { reauthPending = null; });
  return reauthPending;
}

/* ---------- Waking the server ---------- */

type WakeListener = (waking: boolean) => void;
const wakeListeners = new Set<WakeListener>();
/** Called with true while a request waits for the sleeping server, then false. */
export function subscribeWaking(fn: WakeListener) { wakeListeners.add(fn); return () => { wakeListeners.delete(fn); }; }

/**
 * Retries GET /api/health until the server answers with JSON (Render shows an HTML page while it wakes), for up to
 * LIMITS.wakeTimeoutSeconds. `onWaking` runs once if that takes more than a moment. With `checkDb` the answer also
 * says whether the database is reachable.
 */
export async function waitForServer(opts: { checkDb?: boolean; signal?: AbortSignal; onWaking?: () => void } = {}): Promise<HealthResponse> {
  const { checkDb = false, signal, onWaking } = opts;
  const start = Date.now();
  let told = false;
  const tell = () => { if (!told) { told = true; onWaking?.(); } };
  const soon = setTimeout(tell, 1500);
  try {
    for (let attempt = 0; ; attempt++) {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 15_000);
      const stop = () => ctrl.abort();
      signal?.addEventListener("abort", stop);
      try {
        const res = await fetch(paths.health(checkDb), { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" }, signal: ctrl.signal });
        const data = await readJson(res);
        if (res.ok && isObject(data) && data.ok === true) return data as HealthResponse;
      } catch {
        if (signal?.aborted) throw signal.reason;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", stop);
      }
      tell();
      if (Date.now() - start > LIMITS.wakeTimeoutSeconds * 1000)
        throw new ApiError("The admin server didn't wake up. Try again in a minute.", 0, "asleep");
      await sleep(Math.min(2000 + attempt * 1000, 5000), signal);
    }
  } finally {
    clearTimeout(soon);
  }
}

let waking: Promise<boolean> | null = null;
function wake(): Promise<boolean> {
  waking ??= waitForServer({ onWaking: () => wakeListeners.forEach(fn => fn(true)) })
    .then(() => true, () => false)
    .finally(() => { wakeListeners.forEach(fn => fn(false)); waking = null; });
  return waking;
}

/* ---------- Requests ---------- */

/** Gateway errors and HTML where JSON was expected: the server is asleep or restarting. */
const looksAsleep = (res: Response) => res.ok || res.status === 502 || res.status === 503 || res.status === 504;

async function request<T>(path: string, init: ApiInit, retry: { wake: boolean; reauth: boolean }): Promise<T> {
  const method = (init.method ?? (init.body !== undefined || init.raw ? "POST" : "GET")).toUpperCase();
  const headers: Record<string, string> = { Accept: "application/json", ...init.headers };
  let body: BodyInit | undefined;
  if (init.raw) {
    body = init.raw;
    headers["Content-Type"] = init.contentType || init.raw.type || "application/octet-stream";
  } else if (method !== "GET" && method !== "HEAD") {
    // Every change is JSON, even when there is nothing to send
    body = JSON.stringify(init.body ?? {});
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(path, { method, headers, body, credentials: "same-origin", cache: "no-store", signal: init.signal });
  } catch (e) {
    if (init.signal?.aborted) throw e;
    throw new ApiError("Couldn't reach the server. Check your internet connection and try again.", 0, "network");
  }

  const data = await readJson(res);
  if (data === undefined) {
    if (retry.wake && looksAsleep(res) && await wake()) return request<T>(path, init, { ...retry, wake: false });
    if (res.status === 404) throw new ApiError("The admin server isn't reachable at this address.", 404, "not_found");
    if (res.status === 413) throw new ApiError("That's too large to send.", 413, "payload_too_large");
    throw new ApiError(res.ok ? "The server sent an unexpected answer. Try again." : `The server isn't answering properly (error ${res.status}). Try again in a minute.`, res.status, "bad_response");
  }
  if (res.ok) return data as T;

  const err = errorFrom(res.status, data);
  if (err.code === "unauthorized" && retry.reauth && !init.noReauth && reauthHandler) {
    try { await signInAgain(); } catch { throw err; }
    return request<T>(path, init, { ...retry, reauth: false });
  }
  throw err;
}

/** Calls the admin server. `path` comes from `paths` (shared/api.ts). */
export function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  return request<T>(path, init, { wake: true, reauth: true });
}

/** A plain message for anything a call can throw. */
export function errorText(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return "Something went wrong. Try again.";
}
