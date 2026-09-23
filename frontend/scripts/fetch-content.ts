/**
 * Build step: `npm run build` runs this first (the "prebuild" script). On Vercel it pulls the published content from
 * the admin server into src/data and public/ (see content-build.ts for the details and the fallbacks). On your
 * computer, with no CONTENT_EXPORT_URL, it does nothing and the build uses src/data as it is.
 *
 * Settings (Vercel → Settings → Environment Variables, never with a VITE_ prefix):
 * - CONTENT_EXPORT_URL: https://<render-service>.onrender.com/api/export/published
 * - CONTENT_EXPORT_TOKEN: the same value as EXPORT_TOKEN on Render
 * - VERCEL_PROJECT_PRODUCTION_URL: set by Vercel itself (the fallback copies the live site's content from there)
 */
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { FatalError, run } from "./content-build.ts";

try {
  await run(process.env, {
    fetch: globalThis.fetch,
    sleep: ms => sleep(ms),
    now: () => Date.now(),
    log: m => console.log(m),
    warn: m => console.warn(m),
    root: path.resolve(import.meta.dirname, ".."),
  });
} catch (e) {
  console.error(`\nfetch-content: the build stopped. ${e instanceof FatalError ? e.message : `Unexpected error: ${e instanceof Error ? e.stack ?? e.message : String(e)}`}\n`);
  console.error("fetch-content: Vercel keeps the site that is live now online until a build succeeds.");
  process.exitCode = 1;
}
