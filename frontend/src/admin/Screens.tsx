import type { ReactNode } from "react";
import { Database, ServerCrash } from "lucide-react";
import { MESSAGES } from "../../../shared/api.ts";
import { RecMark } from "../components/Brand";
import { Spinner } from "./ui";

/** The centred page used before signing in (sign-in, setup links, waking the server). */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-ink px-4 py-10">
      <div className="w-full max-w-[520px]">
        <div className="mb-8 flex items-center gap-3"><RecMark className="h-10 w-10" /><div><p className="font-display font-semibold">IEEE CIS REC</p><p className="text-[14px] text-mute">Website admin</p></div></div>
        {children}
      </div>
    </div>
  );
}

export type BootState =
  | { kind: "loading"; text: string }
  | { kind: "waking" }
  | { kind: "db_down" }
  | { kind: "db_missing" }
  | { kind: "error"; text: string };

/** Full-screen states while the admin gets ready: loading, waking the server, database paused, errors. */
export function StatusScreen({ state, onRetry }: { state: BootState; onRetry?: () => void }) {
  if (state.kind === "loading" || state.kind === "waking") return (
    <div className="grid min-h-screen place-items-center bg-ink px-6 text-center">
      <div className="flex flex-col items-center gap-4" role="status">
        <Spinner size={26} className="text-violet-soft" />
        <p className="text-mute">{state.kind === "waking" ? `${MESSAGES.waking}…` : state.text}</p>
        {state.kind === "waking" && <p className="max-w-[40ch] text-[14px] text-mute/80">The admin server sleeps when nobody has used it for a while. The website itself is not affected.</p>}
      </div>
    </div>
  );
  const [Icon, title, text] =
    state.kind === "db_down" ? [Database, "The database is paused", MESSAGES.dbPaused] as const
      : state.kind === "db_missing" ? [Database, "No database connected", "The admin server has no database set up yet (MONGODB_URI in its settings). Ask the web lead."] as const
        : [ServerCrash, "The admin isn't available right now", state.text] as const;
  return (
    <Shell>
      <div className="adm-card" role="alert">
        <Icon className="text-gold" />
        <h1 className="mt-4 font-display text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-[15px] text-mute">{text}</p>
        {state.kind === "db_down" && <p className="mt-2 text-[15px] text-mute">The live website is not affected. Unsaved changes stay on this device.</p>}
        {onRetry && <button className="btn-gold mt-5" onClick={onRetry}>Try again</button>}
      </div>
    </Shell>
  );
}
