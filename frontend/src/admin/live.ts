/**
 * "Is it live yet?": every site build writes /content-version.json with the release it contains. After a publish the
 * admin reads it every few seconds until it reaches the new release (the rebuild takes 1 to 3 minutes).
 */
import { useEffect, useState } from "react";
import { CONTENT_VERSION_PATH, LIMITS, type ContentVersion } from "../../../shared/api.ts";

export async function fetchContentVersion(): Promise<ContentVersion | null> {
  try {
    const res = await fetch(CONTENT_VERSION_PATH, { cache: "no-store" });
    if (!res.ok || !(res.headers.get("content-type") || "").includes("json")) return null;
    const v: unknown = await res.json();
    if (typeof v !== "object" || v === null) return null;
    const r = (v as { release?: unknown }).release;
    return typeof r === "number" || r === null ? (v as ContentVersion) : null;
  } catch {
    return null;
  }
}

export type LivePhase = "idle" | "checking" | "live" | "slow";

/**
 * Watches the live site until it contains `release` (phase "live"), for up to LIMITS.liveCheckMinutes (then
 * "slow"). `enabled` false (or release null) stops watching. `checkAgain` starts another round.
 */
export function useLiveCheck(release: number | null, enabled = true) {
  const [state, setState] = useState<{ phase: LivePhase; built: ContentVersion | null; for: number | null }>({ phase: "idle", built: null, for: null });
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (release === null || !enabled) return;
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
    const start = Date.now();
    const tick = async () => {
      const built = await fetchContentVersion();
      if (stopped) return;
      if (built && built.release !== null && built.release >= release) { setState({ phase: "live", built, for: release }); return; }
      if (Date.now() - start > LIMITS.liveCheckMinutes * 60_000) { setState({ phase: "slow", built, for: release }); return; }
      setState({ phase: "checking", built, for: release });
      timer = setTimeout(tick, LIMITS.liveCheckIntervalSeconds * 1000);
    };
    timer = setTimeout(tick, 0);
    return () => { stopped = true; clearTimeout(timer); };
  }, [release, enabled, round]);
  // A result for an older release doesn't count
  const phase: LivePhase = state.for === release ? state.phase : release === null || !enabled ? "idle" : "checking";
  return { phase, built: state.built, checkAgain: () => setRound(r => r + 1) };
}
