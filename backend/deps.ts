/** Everything route modules get from the app. Tests pass fakes (a clock, a fetch stub, a silent logger). */
import type { Config } from "./config.ts";
import type { Database } from "./db.ts";
import type { Logger } from "./log.ts";

export type AppDeps = {
  config: Config;
  db: Database;
  log: Logger;
  /** The current time. Use this instead of `new Date()` so tests can control time. */
  now: () => Date;
  /** Outgoing HTTP (the Vercel deploy hook, the Have I Been Pwned range API). Tests replace it. */
  fetch: typeof fetch;
  /** The repository root on disk (import-starting-content reads src/data and public/images from here). */
  repoRoot: string;
};
