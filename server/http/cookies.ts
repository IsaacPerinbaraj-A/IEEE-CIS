/**
 * Cookie reading and writing without extra packages. The session cookie is HttpOnly, SameSite=Strict, Path=/,
 * never has a Domain, and is Secure with the __Host- prefix in production (see config.cookieName).
 */
import type { Config } from "../config.ts";

/** Cookie header → { name: value }. Malformed pairs are skipped; the first of two same-named cookies wins. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = Object.create(null) as Record<string, string>;
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1, -1);
    if (!name || name in out) continue;
    try { out[name] = decodeURIComponent(value); } catch { out[name] = value; }
  }
  return out;
}

export type CookieOptions = { maxAgeSeconds?: number; httpOnly?: boolean; secure?: boolean; sameSite?: "Strict" | "Lax"; path?: string };

const NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** One Set-Cookie header value. */
export function serializeCookie(name: string, value: string, o: CookieOptions = {}): string {
  if (!NAME_RE.test(name)) throw new Error("Invalid cookie name");
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${o.path ?? "/"}`];
  if (o.maxAgeSeconds !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(o.maxAgeSeconds))}`);
  if (o.httpOnly !== false) parts.push("HttpOnly");
  if (o.secure) parts.push("Secure");
  parts.push(`SameSite=${o.sameSite ?? "Strict"}`);
  return parts.join("; ");
}

/** Set-Cookie for a new session token (lives at most `maxAgeSeconds`; the server also enforces the idle limit). */
export const sessionCookie = (config: Config, token: string, maxAgeSeconds: number) =>
  serializeCookie(config.cookieName, token, { maxAgeSeconds, httpOnly: true, secure: config.cookieSecure, sameSite: "Strict", path: "/" });

/** Set-Cookie that removes the session cookie. */
export const clearSessionCookie = (config: Config) =>
  serializeCookie(config.cookieName, "", { maxAgeSeconds: 0, httpOnly: true, secure: config.cookieSecure, sameSite: "Strict", path: "/" });

/** The session token from a request's Cookie header, or null. */
export const sessionToken = (config: Config, cookieHeader: string | undefined) => parseCookies(cookieHeader)[config.cookieName] || null;
