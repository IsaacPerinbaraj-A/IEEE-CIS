import type { RequestHandler } from "express";
import type { ApiError } from "../../shared/api.ts";

/**
 * A route handler whose JSON response is typed with the contract in shared/api.ts. The request body is not typed:
 * read it with the helpers in ./body.ts (or checkSection for content). Errors: throw HttpError.
 */
export type Handler<Res = unknown, Params extends Record<string, string> = Record<string, string>> = RequestHandler<Params, Res | ApiError>;
