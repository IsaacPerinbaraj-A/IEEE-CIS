import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LIMITS, SETUP_KINDS, isValidUsername, normaliseUsername, type SessionResponse, type SetupInfo, type SetupKind, type SetupRequest } from "../../shared/api.ts";
import type { PassphraseContext } from "../../shared/passphrase.ts";
import { ApiError, api, errorText, paths } from "./api";
import { dateTime, newPassphraseError, passphraseErrorText } from "./format";
import { PassphraseHint, PassphrasePolicy } from "./Passphrase";
import { Notice, PassphraseField, Spinner, TextField } from "./ui";
import { Shell } from "./Screens";

const isKind = (v: string): v is SetupKind => (SETUP_KINDS as readonly string[]).includes(v);

/**
 * /admin/setup/<owner|invite|reset>#<token>: choose a passphrase from a one-time link. The token is read from the
 * address's # part (which never reaches server logs) and then removed from the address bar.
 */
export default function Setup({ kind, onSignedIn }: { kind: string; onSignedIn: (s: SessionResponse) => void }) {
  const [token] = useState(() => {
    const raw = window.location.hash.replace(/^#/, "");
    // A link cut off in the middle of a %xx can't be decoded: use it as it is (the server then says it doesn't work)
    try { return decodeURIComponent(raw).trim(); } catch { return raw.trim(); }
  });
  const [info, setInfo] = useState<SetupInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [username, setUsername] = useState(""), [displayName, setDisplayName] = useState("");
  const [passphrase, setPassphrase] = useState(""), [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");

  // Keep the token out of the address bar and the browser history
  useEffect(() => {
    if (window.location.hash) history.replaceState(history.state, "", window.location.pathname + window.location.search);
  }, []);

  useEffect(() => {
    if (!isKind(kind) || !token) return;
    const ctrl = new AbortController();
    api<SetupInfo>(paths.setup(kind), { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal, noReauth: true })
      .then(i => { setInfo(i); setUsername(i.username ?? ""); setDisplayName(i.displayName ?? ""); })
      .catch(e => {
        if (ctrl.signal.aborted) return;
        setLoadError(e instanceof ApiError && e.code === "invalid_token" ? badLink(kind) : errorText(e));
      });
    return () => ctrl.abort();
  }, [kind, token]);

  const invalid = !isKind(kind) || !token;
  if (invalid || loadError) return (
    <Shell>
      <div className="adm-card">
        <h1 className="font-display text-xl font-semibold">This link doesn't work</h1>
        <p className="mt-2 text-[15px] text-mute">{invalid ? "The link is incomplete. Open it again from the message you were sent, or ask the web lead for a new one." : loadError}</p>
        <Link to="/admin" className="btn-ghost mt-5">Go to sign-in</Link>
      </div>
    </Shell>
  );
  if (!info) return (
    <Shell><div className="adm-card flex items-center gap-3 text-mute" role="status"><Spinner className="text-violet-soft" /> Checking your link…</div></Shell>
  );

  const creatingOwner = info.kind === "owner" && info.mode === "create";
  const context: PassphraseContext = { username: normaliseUsername(username), displayName, year: new Date().getFullYear() };
  const title = creatingOwner ? "Create the web lead account"
    : info.mode === "reset" ? "Choose a new passphrase"
      : `Welcome${info.displayName ? `, ${info.displayName}` : ""}`;

  const submit = async () => {
    setError("");
    const user = normaliseUsername(username);
    if (creatingOwner) {
      if (!displayName.trim()) { setError("Enter your name as it should appear in the admin."); return; }
      if (!isValidUsername(user)) { setError(`Choose a username of ${LIMITS.usernameMinLength} to ${LIMITS.usernameMaxLength} lowercase letters, numbers, dots, dashes or underscores.`); return; }
    }
    const problem = newPassphraseError(passphrase, confirm, context);
    if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      const body: SetupRequest = { token, passphrase, ...(creatingOwner ? { username: user, displayName: displayName.trim() } : {}) };
      const s = await api<SessionResponse>(paths.setup(info.kind), { method: "POST", body, noReauth: true });
      setPassphrase(""); setConfirm("");
      onSignedIn(s);
    } catch (e) {
      if (e instanceof ApiError && e.code === "invalid_token") setLoadError(badLink(info.kind));
      else if (e instanceof ApiError && e.code === "username_taken") setError("That username is already taken. Choose another.");
      else setError(passphraseErrorText(e));
    } finally { setBusy(false); }
  };

  return (
    <Shell>
      <form className="adm-card grid gap-4" onSubmit={e => { e.preventDefault(); submit(); }} noValidate>
        <div>
          <h1 className="font-display text-xl font-semibold">{title}</h1>
          <p className="mt-1.5 text-[15px] text-mute">
            {creatingOwner ? "This is the one account that can invite people, send reset links and download backups."
              : info.mode === "reset" ? <>For <span className="text-cream">{info.username}</span>. Your old passphrase stops working once you save this.</>
                : <>Choose a passphrase to finish setting up your account. Your username is <span className="text-cream">{info.username}</span>.</>}
            {info.expiresAt && <> This link works until {dateTime(info.expiresAt)}.</>}
          </p>
        </div>
        {creatingOwner && <>
          <TextField label="Your name" value={displayName} onChange={setDisplayName} maxLength={LIMITS.displayNameMaxLength} autoComplete="name" hint="Shown to other editors, for example in History." />
          <TextField label="Username" value={username} onChange={setUsername} maxLength={LIMITS.usernameMaxLength} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            hint="Lowercase letters, numbers, dots, dashes or underscores. You'll sign in with this." />
        </>}
        {/* Lets password managers save the passphrase under the right username */}
        {!creatingOwner && <input className="sr-only" tabIndex={-1} aria-hidden autoComplete="username" value={info.username ?? ""} readOnly />}
        <PassphraseField label="Passphrase" value={passphrase} onChange={setPassphrase} autoComplete="new-password" hint={<PassphraseHint value={passphrase} context={context} />} />
        <PassphraseField label="Type it again" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        <PassphrasePolicy />
        {error && <Notice tone="error">{error}</Notice>}
        <button type="submit" className="btn-gold" disabled={busy}>{busy ? "Saving…" : info.mode === "reset" ? "Save and sign in" : "Create account and sign in"}</button>
      </form>
    </Shell>
  );
}

function badLink(kind: string) {
  return kind === "owner"
    ? "This setup link isn't valid. It may have been used already. Check SETUP_TOKEN in the admin server's settings on Render."
    : "This link has expired or was already used. Ask the web lead for a new one.";
}
