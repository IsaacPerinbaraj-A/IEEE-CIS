/**
 * The admin server's Express app. createApp(deps) builds it without listening, so tests can run it on a random
 * port. Route modules (server/routes/*.ts) each export register(router, deps); add routes there, not here.
 *
 * Order of checks for every request: security headers → /healthz → no CORS preflights → cross-site check for
 * changing requests → content type → JSON body (2 MB) → routes → JSON 404 → JSON errors (no stack traces).
 */
import express, { type Express, type RequestHandler, type Router } from "express";
import { LIMITS, ROUTES, type HealthResponse } from "../shared/api.ts";
import type { AppDeps } from "./deps.ts";
import { queryValue } from "./http/body.ts";
import { errorHandler, notFoundHandler } from "./http/errors.ts";
import { contentTypeCheck, originCheck, rejectPreflight, securityHeaders } from "./http/security.ts";
import * as accounts from "./routes/accounts.ts";
import * as auth from "./routes/auth.ts";
import * as backup from "./routes/backup.ts";
import * as content from "./routes/content.ts";
import * as exportRoutes from "./routes/export.ts";
import * as history from "./routes/history.ts";
import * as images from "./routes/images.ts";
import * as presence from "./routes/presence.ts";
import * as publish from "./routes/publish.ts";
import * as setup from "./routes/setup.ts";

type RouteModule = { register(router: Router, deps: AppDeps): void };
const ROUTE_MODULES: RouteModule[] = [auth, setup, accounts, content, publish, history, images, presence, exportRoutes, backup];

/** GET /api/health: the admin's wake-up check. With ?db=1 it also pings the database (never throws). */
const health = (deps: AppDeps): RequestHandler => async (req, res) => {
  const body: HealthResponse = { ok: true, time: deps.now().toISOString() };
  if (queryValue(req, "db") === "1") body.db = await deps.db.ping();
  res.json(body);
};

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("etag", false);
  // Render (and Vercel in front of it) are proxies: req.ip is the address that reached Render's edge.
  // The visitor's address comes from clientIp() in http/ip.ts.
  app.set("trust proxy", 1);

  app.use(securityHeaders);
  // Render's health check: no database, no JSON parsing
  app.get("/healthz", (_req, res) => { res.type("text/plain").send("ok"); });

  app.use(rejectPreflight);
  app.use(originCheck(deps.config.siteOrigin));
  app.use(contentTypeCheck);
  const json = express.json({ limit: LIMITS.jsonBodyBytes, strict: true, type: "application/json" });
  // The backup import route has its own, larger limit (routes/backup.ts)
  app.use((req, res, next) => {
    if (req.method === "POST" && req.path === ROUTES.backupImport) { next(); return; }
    json(req, res, next);
  });

  app.get(ROUTES.health, health(deps));
  const router = express.Router();
  for (const m of ROUTE_MODULES) m.register(router, deps);
  app.use(router);

  app.use(notFoundHandler);
  app.use(errorHandler(deps.log));
  return app;
}
