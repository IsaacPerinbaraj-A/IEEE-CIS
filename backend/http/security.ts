/**
 * Request checks that apply to every route:
 * - response headers: no caching anywhere (Vercel's CDN included), no sniffing, no framing, no CORS headers;
 * - cross-site protection for changing requests (POST/PUT/PATCH/DELETE): Sec-Fetch-Site must be "same-origin";
 *   browsers that don't send it must send Origin equal to SITE_ORIGIN; with neither, the request is refused;
 * - changing requests must be JSON (images: image/webp or image/jpeg on POST /api/images), which also forces a
 *   CORS preflight for any cross-site attempt, and preflights are refused (405).
 */
import type { IncomingHttpHeaders } from "node:http";
import type { RequestHandler } from "express";
import { MESSAGES, ROUTES } from "../../shared/api.ts";
import { IMAGE_TYPES } from "../../shared/sections.ts";
import { HttpError } from "./errors.ts";

export const UNSAFE_METHODS: ReadonlySet<string> = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Headers on every response. Routes must not add Access-Control-* headers. */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.set({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Resource-Policy": "same-origin",
    // API answers are data, never pages: nothing in them may run or be framed (routes may tighten this further)
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  });
  next();
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** True when a changing request came from the site itself (see the top of this file). */
export function isSameOriginRequest(headers: IncomingHttpHeaders, siteOrigin: string): boolean {
  const site = first(headers["sec-fetch-site"])?.trim().toLowerCase();
  if (site) return site === "same-origin";
  const origin = first(headers.origin)?.trim();
  if (origin) return origin === siteOrigin;
  return false;
}

export function originCheck(siteOrigin: string): RequestHandler {
  return (req, _res, next) => {
    if (UNSAFE_METHODS.has(req.method) && !isSameOriginRequest(req.headers, siteOrigin)) {
      next(new HttpError(403, "bad_origin", MESSAGES.badOrigin));
      return;
    }
    next();
  };
}

/** The media type of a Content-Type header, lowercase, without parameters. */
export const mediaType = (contentType: string | undefined) => (contentType ?? "").split(";")[0].trim().toLowerCase();

const JSON_TYPES: readonly string[] = ["application/json"];
const isImageUpload = (method: string, path: string) => method === "POST" && path === ROUTES.images;

/** Which content types a changing request may use: images on the upload route, JSON everywhere else. */
export const allowedTypes = (method: string, path: string): readonly string[] => (isImageUpload(method, path) ? IMAGE_TYPES : JSON_TYPES);

export const contentTypeCheck: RequestHandler = (req, _res, next) => {
  if (UNSAFE_METHODS.has(req.method) && !allowedTypes(req.method, req.path).includes(mediaType(req.get("content-type")))) {
    const message = isImageUpload(req.method, req.path) ? "Send the image as WebP or JPEG." : "Send the request as JSON.";
    next(new HttpError(415, "unsupported_media_type", message));
    return;
  }
  next();
};

/** No CORS: preflight requests are refused. */
export const rejectPreflight: RequestHandler = (req, _res, next) => {
  if (req.method === "OPTIONS") { next(new HttpError(405, "method_not_allowed", "Not allowed")); return; }
  next();
};
