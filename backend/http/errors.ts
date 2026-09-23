/**
 * Errors as JSON ({ error, code, ...extra }) with no stack traces, file paths or secrets. Route handlers throw
 * HttpError (or return early with res.status().json()); Express 5 passes thrown errors and rejected promises here.
 */
import { randomBytes } from "node:crypto";
import type { ErrorRequestHandler, Request, RequestHandler } from "express";
import { MongoNetworkError, MongoNotConnectedError, MongoServerSelectionError, MongoTopologyClosedError } from "mongodb";
import { MESSAGES, type ErrorCode } from "../../shared/api.ts";
import type { Logger } from "../log.ts";

export class HttpError extends Error {
  status: number;
  code: ErrorCode;
  /** Extra JSON fields for the response, e.g. { retryAfterSeconds } or { errors, items }. */
  extra: Record<string, unknown>;
  constructor(status: number, code: ErrorCode, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

/** The database isn't configured, is paused (Atlas free plan after 30 idle days) or can't be reached. */
export class DbUnavailableError extends HttpError {
  constructor(message: string = MESSAGES.dbUnavailable) {
    super(503, "db_unavailable", message);
    this.name = "DbUnavailableError";
  }
}

export const badRequest = (message: string, extra?: Record<string, unknown>) => new HttpError(400, "bad_request", message, extra);
export const notFound = (message = "Not found") => new HttpError(404, "not_found", message);
export const unauthorized = (message: string = MESSAGES.unauthorized) => new HttpError(401, "unauthorized", message);
export const forbidden = (message: string = MESSAGES.forbidden) => new HttpError(403, "forbidden", message);

/** Placeholder for route handlers that aren't built yet: answers 501 not_implemented. */
export function todo(): never {
  throw new HttpError(501, "not_implemented", MESSAGES.notImplemented);
}

/** Driver errors that mean "can't reach the database" (paused cluster, network, not connected). */
export function isDbConnectionError(err: unknown): boolean {
  return err instanceof MongoServerSelectionError || err instanceof MongoNetworkError
    || err instanceof MongoNotConnectedError || err instanceof MongoTopologyClosedError;
}

type ParserError = { type: string; status?: number; statusCode?: number; expose?: boolean };
const isParserError = (err: unknown): err is ParserError =>
  typeof err === "object" && err !== null && typeof (err as { type?: unknown }).type === "string"
  && typeof ((err as ParserError).status ?? (err as ParserError).statusCode) === "number";

/** Any thrown value as the HttpError to send. */
export function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (isDbConnectionError(err)) return new DbUnavailableError();
  if (isParserError(err)) {
    const status = err.status ?? err.statusCode ?? 400;
    switch (err.type) {
      case "entity.too.large": return new HttpError(413, "payload_too_large", "That's more than the server accepts in one request.");
      case "entity.parse.failed": return new HttpError(400, "bad_json", "The request wasn't valid JSON.");
      case "encoding.unsupported":
      case "charset.unsupported": return new HttpError(415, "unsupported_media_type", "The server can't read that encoding.");
      default:
        if (status >= 400 && status < 500) return new HttpError(status, "bad_request", "The request couldn't be read.");
    }
  }
  return new HttpError(500, "server_error", MESSAGES.serverError);
}

/** An id to find a request in the logs: Vercel's or Render's request id when present. */
export function requestId(req: Request): string {
  const h = req.get("x-vercel-id") || req.get("rndr-id") || "";
  return /^[\w:.-]{1,100}$/.test(h) ? h : randomBytes(6).toString("hex");
}

export function errorHandler(log: Logger): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (res.headersSent) { next(err); return; }
    const e = toHttpError(err);
    const fields = { method: req.method, path: req.path, status: e.status, code: e.code, requestId: requestId(req) };
    if (e.status >= 500 && e.code !== "not_implemented") {
      const raw = err as { name?: unknown; code?: unknown; message?: unknown };
      // Driver messages can include host names, so only the name, code and a masked message are logged
      log.error("request_failed", { ...fields, errorName: String(raw?.name ?? typeof err), errorCode: raw?.code === undefined ? undefined : String(raw.code), message: typeof raw?.message === "string" ? raw.message : undefined });
    }
    res.status(e.status).json({ ...e.extra, error: e.message, code: e.code });
  };
}

/** JSON 404 for any path the server doesn't have. */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Not found", code: "not_found" });
};
