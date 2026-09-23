import { useState, type ReactNode } from "react";
import { CheckCircle2, Circle, ExternalLink, RefreshCw, XCircle } from "lucide-react";
import type { DeployInfo, RetryDeployResponse } from "../../../shared/api.ts";
import { api, errorText, paths } from "./api";
import { useLiveCheck } from "./live";
import { Spinner } from "./ui";

/** Asks Vercel to rebuild the latest release again (the "Try again" button). */
function useRetryDeploy(initial: DeployInfo | null) {
  const [deploy, setDeploy] = useState(initial);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const retry = async (then?: () => void) => {
    setBusy(true); setError("");
    try { setDeploy((await api<RetryDeployResponse>(paths.retryDeploy, { method: "POST", body: {} })).deploy); then?.(); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  return { deploy, busy, error, retry };
}

const Step = ({ state, children }: { state: "done" | "doing" | "todo" | "failed"; children: ReactNode }) => (
  <li className="flex items-start gap-3">
    {state === "done" ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[#4ADE80]" />
      : state === "doing" ? <Spinner size={20} className="mt-0.5 text-gold" />
        : state === "failed" ? <XCircle size={20} className="mt-0.5 shrink-0 text-[#F87171]" />
          : <Circle size={20} className="mt-0.5 shrink-0 text-mute/60" />}
    <div className="min-w-0 flex-1">{children}</div>
  </li>
);

/** "Saved as release #N → Rebuilding the site (1–3 min) → Live", after a publish or an undo. */
export function LiveSteps({ release, deploy: initial }: { release: number; deploy: DeployInfo }) {
  const { deploy, busy, error, retry } = useRetryDeploy(initial);
  const state = deploy?.state ?? "requested";
  const { phase, checkAgain } = useLiveCheck(release, state === "requested");
  const retryButton = (
    <button className="btn-ghost btn-sm mt-3 min-h-[44px] sm:min-h-[38px]" disabled={busy} onClick={() => retry(checkAgain)}>
      <RefreshCw size={15} /> {busy ? "Asking again…" : "Try again"}
    </button>
  );
  return (
    <ol className="adm-card grid gap-4 text-[15px]" aria-live="polite">
      <Step state="done"><p className="font-medium">Saved as release #{release}</p><p className="text-mute">Kept in History. You can make an earlier release live again at any time.</p></Step>
      {state === "failed" ? (
        <Step state="failed">
          <p className="font-medium">Saved as release #{release} but the rebuild didn't start</p>
          <p className="text-mute">The live site still shows the previous release.{deploy?.error ? ` (${deploy.error})` : ""}</p>
          {retryButton}
        </Step>
      ) : state === "skipped" ? (
        <Step state="todo">
          <p className="font-medium">{deploy?.error ? "The site wasn't rebuilt" : "No automatic rebuild here"}</p>
          <p className="text-mute">{deploy?.error || "This admin server has no rebuild link set up (DEPLOY_HOOK_URL), so the live site won't change on its own. That's expected when running it on your own computer."}</p>
        </Step>
      ) : (
        <>
          <Step state={phase === "live" ? "done" : phase === "slow" ? "failed" : "doing"}>
            <p className="font-medium">Rebuilding the site (1–3 min)</p>
            {phase === "slow" && <>
              <p className="text-mute">This is taking longer than usual. The site updates as soon as the rebuild finishes. If it still hasn't in a few minutes, start the rebuild again.</p>
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost btn-sm mt-3 min-h-[44px] sm:min-h-[38px]" onClick={checkAgain}>Check again</button>
                {retryButton}
              </div>
            </>}
          </Step>
          <Step state={phase === "live" ? "done" : "todo"}>
            <p className="font-medium">Live</p>
            {phase === "live" && <a href="/" target="_blank" rel="noopener" className="link mt-1 inline-flex items-center gap-1.5">View site <ExternalLink size={14} /></a>}
          </Step>
        </>
      )}
      {error && <li role="alert" className="text-[14px] text-[#FCA5A5]">{error}</li>}
    </ol>
  );
}

/** One line for the dashboard: is the latest release live? */
export function LiveLine({ release, deploy: initial }: { release: number; deploy: DeployInfo | null }) {
  const { deploy, busy, error, retry } = useRetryDeploy(initial);
  const state = deploy?.state ?? null;
  const { phase, built, checkAgain } = useLiveCheck(release, state !== "skipped" && state !== "failed");
  const recent = !!deploy && Date.now() - new Date(deploy.at).getTime() < 10 * 60_000;
  let text: string, tone: "ok" | "wait" | "bad" = "wait";
  if (state === "failed") { text = "The rebuild didn't start, so the live site shows an older release."; tone = "bad"; }
  else if (state === "skipped") text = deploy?.error || "No automatic rebuild is set up on this admin server.";
  else if (phase === "live") { text = "Live on the site."; tone = "ok"; }
  else if (phase === "slow") { text = `Not live yet${built?.release ? ` (the site shows release #${built.release})` : ""}. The rebuild may have failed.`; tone = "bad"; }
  else text = recent ? "Rebuilding the site (1–3 min)…" : "Checking the live site…";
  return (
    <div className="mt-2 text-[15px]" aria-live="polite">
      <p className={`flex items-center gap-2 ${tone === "ok" ? "text-[#86EFAC]" : tone === "bad" ? "text-[#FCA5A5]" : "text-mute"}`}>
        {tone === "ok" ? <CheckCircle2 size={17} /> : tone === "bad" ? <XCircle size={17} /> : state === "skipped" ? <Circle size={17} /> : <Spinner size={17} />}
        {text}
      </p>
      {(state === "failed" || phase === "slow") && (
        <div className="mt-3 flex flex-wrap gap-2">
          {phase === "slow" && <button className="btn-ghost btn-sm min-h-[44px] sm:min-h-[38px]" onClick={checkAgain}>Check again</button>}
          <button className="btn-ghost btn-sm min-h-[44px] sm:min-h-[38px]" disabled={busy} onClick={() => retry(checkAgain)}><RefreshCw size={15} /> {busy ? "Asking again…" : "Start the rebuild again"}</button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-[14px] text-[#FCA5A5]">{error}</p>}
    </div>
  );
}
