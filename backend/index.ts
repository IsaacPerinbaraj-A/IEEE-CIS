/**
 * Starts the admin server: `npm run server` locally (reads .env.local if present), `node server/index.ts` on Render
 * (Node 24; TypeScript runs directly, no build step). Listens on PORT (default 8787). It starts even when the
 * database can't be reached; routes that need it answer 503 until it can.
 */
import path from "node:path";
import { createApp } from "./app.ts";
import { ConfigError, describeConfig, loadConfig, type Config } from "./config.ts";
import { createDatabase } from "./db.ts";
import { createLogger } from "./log.ts";

const log = createLogger();

function readConfig(): Config {
  try {
    return loadConfig(process.env);
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }
}

const config = readConfig();
const db = createDatabase(config, log);
const app = createApp({
  config,
  db,
  log,
  now: () => new Date(),
  fetch: globalThis.fetch,
  // The starting copy (src/data and public/images) lives in the frontend project
  repoRoot: path.resolve(import.meta.dirname, "..", "frontend"),
});

const server = app.listen(config.port, error => {
  if (error) {
    log.error("server_listen_failed", { port: config.port, errorName: error.name, message: error.message });
    process.exit(1);
  }
  log.info("server_started", describeConfig(config));
  if (!config.mongodbUri) log.warn("db_not_configured", { hint: "Set MONGODB_URI to use the admin." });
  if (!config.deployHookUrl) log.warn("deploy_hook_not_configured", { hint: "Publishing saves releases but won't rebuild the site." });
});
server.requestTimeout = 60_000;
server.headersTimeout = 20_000;

// Connect early (this also creates the indexes). Failure is logged and retried on the next request, never fatal.
if (db.configured) db.collections().catch(() => undefined);

let stopping = false;
function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info("server_stopping", { signal });
  server.close(() => { void db.close().finally(() => process.exit(0)); });
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
