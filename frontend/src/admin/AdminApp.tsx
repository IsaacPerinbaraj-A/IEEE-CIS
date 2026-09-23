import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { SessionResponse } from "../../../shared/api.ts";
import { ApiError, api, errorText, paths, waitForServer } from "./api";
import Login from "./Login";
import Setup from "./Setup";
import Workspace from "./Workspace";
import { StatusScreen, type BootState } from "./Screens";

/**
 * /admin: wakes the admin server (Render's free plan sleeps), checks the database, then shows the sign-in page, a
 * setup link (/admin/setup/<kind>#<token>) or the workspace.
 */
export default function AdminApp() {
  const [boot, setBoot] = useState<BootState | null>({ kind: "loading", text: "Starting the admin…" });
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [attempt, setAttempt] = useState(0);
  const location = useLocation(), navigate = useNavigate();
  const setupKind = /^\/admin\/setup\/([^/]+)\/?$/.exec(location.pathname)?.[1];

  // Keep the admin out of search results and away from the landing intro
  useEffect(() => {
    const meta = document.createElement("meta"); meta.name = "robots"; meta.content = "noindex, nofollow"; document.head.appendChild(meta);
    document.title = "Admin | IEEE CIS REC"; document.body.dataset.intro = "done";
    return () => meta.remove();
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const health = await waitForServer({ checkDb: true, signal: ctrl.signal, onWaking: () => setBoot({ kind: "waking" }) });
        if (health.db === "down") { setBoot({ kind: "db_down" }); return; }
        if (health.db === "not_configured") { setBoot({ kind: "db_missing" }); return; }
        setBoot({ kind: "loading", text: "Checking your sign-in…" });
        try {
          setSession(await api<SessionResponse>(paths.session, { signal: ctrl.signal, noReauth: true }));
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 401)) throw e;
          setSession(null);
        }
        setBoot(null);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setBoot(e instanceof ApiError && e.code === "db_unavailable" ? { kind: "db_down" } : { kind: "error", text: errorText(e) });
      }
    })();
    return () => ctrl.abort();
  }, [attempt]);

  const signedIn = useCallback((s: SessionResponse) => {
    setSession(s);
    if (location.pathname.startsWith("/admin/setup")) navigate("/admin", { replace: true });
  }, [location.pathname, navigate]);
  const signedOut = useCallback(() => { setSession(null); navigate("/admin"); }, [navigate]);

  if (boot) return <StatusScreen state={boot} onRetry={() => { setBoot({ kind: "loading", text: "Starting the admin…" }); setAttempt(a => a + 1); }} />;
  if (setupKind) return <Setup kind={setupKind} onSignedIn={signedIn} />;
  if (!session) return <Login onSignedIn={signedIn} />;
  return <Workspace key={session.user.id} session={session} onSession={setSession} onSignedOut={signedOut} />;
}
