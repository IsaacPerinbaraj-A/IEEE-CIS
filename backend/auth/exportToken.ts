/**
 * The Vercel build's access to /api/export/*: `Authorization: Bearer <EXPORT_TOKEN>` (Vercel's CONTENT_EXPORT_TOKEN).
 * Compared in constant time. Without EXPORT_TOKEN on the server the export is switched off (503 not_configured).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import type { AppDeps } from "../deps.ts";
import { HttpError } from "../http/errors.ts";

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

/** True when `header` is exactly "Bearer <token>". */
export function bearerMatches(header: string | undefined, token: string): boolean {
  const m = /^Bearer ([^\s]+)$/.exec(header?.trim() ?? "");
  return !!m && timingSafeEqual(digest(m[1]), digest(token));
}

export function requireExportToken(deps: AppDeps): RequestHandler {
  return (req, _res, next) => {
    const token = deps.config.exportToken;
    if (!token) { next(new HttpError(503, "not_configured", "The content export isn't set up on the server (EXPORT_TOKEN).")); return; }
    if (!bearerMatches(req.get("authorization"), token)) { next(new HttpError(401, "unauthorized", "Missing or wrong export token.")); return; }
    next();
  };
}
