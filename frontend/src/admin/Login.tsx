import { useState, type ReactNode } from "react";
import { LogIn } from "lucide-react";
import { MESSAGES, normaliseUsername, type LoginRequest, type SessionResponse } from "../../../shared/api.ts";
import { ApiError, api, errorText, paths } from "./api";
import { Modal, Notice, PassphraseField, TextField } from "./ui";
import { Shell } from "./Screens";

/** Username + passphrase. Checked only on the server; every failed sign-in gets the same message. */
export function SignInForm({ fixedUsername, onSignedIn, extra }: { fixedUsername?: string; onSignedIn: (s: SessionResponse) => void; extra?: ReactNode }) {
  const [username, setUsername] = useState(fixedUsername ?? ""), [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!username.trim() || !passphrase) { setError("Enter your username and passphrase."); return; }
    setBusy(true);
    try {
      const body: LoginRequest = { username: normaliseUsername(username), passphrase };
      const s = await api<SessionResponse>(paths.login, { method: "POST", body, noReauth: true });
      setPassphrase("");
      onSignedIn(s);
    } catch (e) {
      setError(e instanceof ApiError && e.code === "bad_credentials" ? MESSAGES.badCredentials : errorText(e));
    } finally { setBusy(false); }
  };

  return (
    <form className="grid gap-4" onSubmit={e => { e.preventDefault(); submit(); }} noValidate>
      {fixedUsername
        ? <p className="text-[15px] text-mute">Username: <span className="font-medium text-cream">{fixedUsername}</span></p>
        : <TextField label="Username" value={username} onChange={setUsername} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus />}
      <PassphraseField label="Passphrase" value={passphrase} onChange={setPassphrase} autoComplete="current-password" autoFocus={!!fixedUsername} />
      {error && <Notice tone="error">{error}</Notice>}
      <button type="submit" className="btn-gold" disabled={busy}>{busy ? "Checking…" : <><LogIn size={18} /> Sign in</>}</button>
      {extra}
    </form>
  );
}

/** The sign-in page. */
export default function Login({ onSignedIn }: { onSignedIn: (s: SessionResponse) => void }) {
  return (
    <Shell>
      <div className="adm-card">
        <h1 className="mb-1 font-display text-xl font-semibold">Sign in</h1>
        <p className="mb-5 text-[15px] text-mute">For the chapter's office bearers. Nothing changes on the live site until you publish.</p>
        <SignInForm onSignedIn={onSignedIn} />
        <div className="mt-5 grid gap-1.5 border-t border-line pt-4 text-[14px] text-mute">
          <p>Forgot your passphrase? Ask the web lead to send you a reset link.</p>
          <p>New here? The web lead sends each person their own invite link.</p>
        </div>
      </div>
    </Shell>
  );
}

/** Shown over the admin when the session has ended, so unsaved work stays where it is. */
export function SignInDialog({ username, onSignedIn, onSignOut }: { username: string; onSignedIn: (s: SessionResponse) => void; onSignOut: () => void }) {
  return (
    <Modal title="Sign in again" onClose={() => {}} dismissible={false}>
      <p className="mb-4 text-[15px] text-mute">Your session ended, so the admin needs your passphrase again. Your unpublished changes are safe on this device.</p>
      <SignInForm fixedUsername={username} onSignedIn={onSignedIn}
        extra={<button type="button" className="btn-ghost" onClick={onSignOut}>Sign out instead</button>} />
    </Modal>
  );
}
