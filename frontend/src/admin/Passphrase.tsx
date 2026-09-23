import { useState } from "react";
import { Check } from "lucide-react";
import { LIMITS, type ChangePassphraseRequest, type OkResponse } from "../../../shared/api.ts";
import { normalisePassphrase, passphraseProblems, type PassphraseContext } from "../../../shared/passphrase.ts";
import { ApiError, api, paths } from "./api";
import { newPassphraseError, passphraseErrorText } from "./format";
import { Modal, Notice, PassphraseField } from "./ui";

/** The rules in plain words, shown wherever a passphrase is chosen. */
export function PassphrasePolicy() {
  return (
    <div className="rounded-xl border border-line bg-ink/60 p-4 text-[14px] text-mute">
      <p className="font-medium text-cream">Choosing a passphrase</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>At least {LIMITS.passphraseMinLength} characters. A short sentence of four or more words works well, for example a line only you would think of.</li>
        <li>No need for capitals, numbers or symbols.</li>
        <li>Don't build it from the club's name, your name, admin, password or the year. Don't reuse one from another site: it's checked against known leaked passwords.</li>
        <li>A password manager can remember it for you. Pasting is fine.</li>
      </ul>
    </div>
  );
}

/** Live feedback while typing a new passphrase. */
export function PassphraseHint({ value, context }: { value: string; context: PassphraseContext }) {
  const length = Array.from(normalisePassphrase(value)).length;
  if (!value) return <>At least {LIMITS.passphraseMinLength} characters.</>;
  const problems = passphraseProblems(value, context);
  if (problems.length) return <>{problems[0]} ({length} characters so far)</>;
  return <span className="inline-flex items-center gap-1.5 text-[#86EFAC]"><Check size={14} /> {length >= 20 ? "Strong." : "Good."} The server also checks it against known leaked passwords.</span>;
}

/** Change your own passphrase. Your other sessions are signed out. */
export function ChangePassphraseDialog({ username, displayName, onClose }: { username: string; displayName: string; onClose: () => void }) {
  const [current, setCurrent] = useState(""), [next, setNext] = useState(""), [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState(false);
  const context: PassphraseContext = { username, displayName, year: new Date().getFullYear() };

  const submit = async () => {
    setError("");
    if (!current) { setError("Enter your current passphrase."); return; }
    const problem = newPassphraseError(next, confirm, context);
    if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      const body: ChangePassphraseRequest = { current, next };
      await api<OkResponse>(paths.password, { method: "POST", body });
      setCurrent(""); setNext(""); setConfirm(""); setDone(true);
    } catch (e) {
      setError(e instanceof ApiError && e.code === "bad_credentials" ? "Your current passphrase isn't right." : passphraseErrorText(e));
    } finally { setBusy(false); }
  };

  return (
    <Modal title="Change your passphrase" onClose={onClose}
      footer={done
        ? <button className="btn-gold" onClick={onClose}>Done</button>
        : <><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-gold" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Change passphrase"}</button></>}>
      {done ? (
        <Notice tone="ok" title="Passphrase changed">Use the new one next time you sign in. Any other devices where you were signed in have been signed out.</Notice>
      ) : (
        <form className="grid gap-4" onSubmit={e => { e.preventDefault(); submit(); }} noValidate>
          <PassphraseField label="Current passphrase" value={current} onChange={setCurrent} autoComplete="current-password" />
          <PassphraseField label="New passphrase" value={next} onChange={setNext} autoComplete="new-password" hint={<PassphraseHint value={next} context={context} />} />
          <PassphraseField label="Type the new passphrase again" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          <PassphrasePolicy />
          {error && <Notice tone="error">{error}</Notice>}
          <button type="submit" className="sr-only" tabIndex={-1}>Change passphrase</button>
        </form>
      )}
    </Modal>
  );
}
