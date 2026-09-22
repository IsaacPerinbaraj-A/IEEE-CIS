/**
 * The live content an editor starts from (types in shared/api.ts): the highest release, its sections, their version
 * numbers (the client's "base") and a path → sha256 map of every image the content uses. Release 0 with nulls when
 * nothing is published yet.
 */
import type { Router } from "express";
import { ROUTES, type ContentResponse } from "../../shared/api.ts";
import { requireSession } from "../auth/middleware.ts";
import { readStore } from "../content/store.ts";
import { contentResponse } from "../content/views.ts";
import type { AppDeps } from "../deps.ts";
import type { Handler } from "../http/handler.ts";

export function register(router: Router, deps: AppDeps): void {
  router.get(ROUTES.content, requireSession(deps), getContent(deps));
}

/** GET /api/content → ContentResponse. */
const getContent = (deps: AppDeps): Handler<ContentResponse> => async (_req, res) => {
  res.json(await contentResponse(await readStore(deps)));
};
