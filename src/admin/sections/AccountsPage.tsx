import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Copy, Database, Download, FileUp, UserPlus } from "lucide-react";
import { useAdmin } from "../context";
import { api, errorText as say } from "../api";
import { Modal, PageTitle, TextField } from "../ui";
import { ReleaseResult } from "./HistoryPage";
import {
  api as paths, LIMITS, isValidUsername, normaliseUsername,
  type Account, type AccountResponse, type AccountsResponse, type AuditAction, type AuditEntry, type AuditPage, type BackupFile,
  type BackupImportRequest, type BackupImportResponse, type InviteRequest, type LinkResponse, type PublishStatus, type SessionResponse,
  type StartingContentRequest, type StartingContentResponse,
} from "../../../shared/api.ts";
import type { ErrorItem } from "../../../shared/validate.ts";

/* ---------- Small helpers ---------- */

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
const SMALL_BTN = "btn-ghost btn-sm max-sm:min-h-[44px]";
const DAY = 24 * 60 * 60 * 1000;

function Problem({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-[#7F1D1D] bg-[#7F1D1D]/25 px-4 py-3 text-[15px] text-[#FCA5A5]">
      <p>{text}</p>
      {onRetry && <button className={`${SMALL_BTN} mt-3`} onClick={onRetry}>Try again</button>}
    </div>
  );
}

const ACTIONS: Record<AuditAction, string> = {
  login: "Signed in",
  login_failed: "Failed sign-in",
  login_throttled: "Sign-in slowed down after repeated failures",
  login_spike: "Many failed sign-ins across accounts",
  logout: "Signed out",
  passphrase_changed: "Changed their passphrase",
  setup_owner: "Used the owner setup code",
  setup_invite: "Accepted an invite",
  setup_reset: "Set a new passphrase from a reset link",
  invite_created: "Invited someone",
  reset_created: "Created a reset link",
  account_deactivated: "Deactivated an account",
  account_reactivated: "Reactivated an account",
  publish: "Published",
  restore: "Made an earlier release live again",
  deploy_failed: "Site rebuild didn't start",
  deploy_retry: "Asked for the site rebuild again",
  image_upload: "Uploaded an image",
  backup_download: "Downloaded a backup",
  backup_import: "Imported a backup",
  import_starting_content: "Imported the starting content",
};

const isBackupFile = (v: unknown): v is BackupFile => {
  const b = v as Partial<BackupFile> | null;
  return !!b && typeof b === "object" && b.format === "ieee-cis-admin-backup" && b.version === 1
    && Array.isArray(b.releases) && Array.isArray(b.sectionVersions) && Array.isArray(b.images);
};

/* ---------- The page ---------- */

export default function AccountsPage() {
  const { me } = useAdmin();
  if (me.role !== "owner") return (
    <>
      <PageTitle title="Accounts" />
      <p className="adm-card text-mute">Only the owner can manage accounts.</p>
    </>
  );
  return <OwnerAccounts myId={me.id} />;
}

function OwnerAccounts({ myId }: { myId: string }) {
  const { reloadContent, owner } = useAdmin();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [accountsError, setAccountsError] = useState("");
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [status, setStatus] = useState<PublishStatus | null>(null);
  const [statusError, setStatusError] = useState("");

  const loadAccounts = useCallback(async () => {
    setAccountsError("");
    try { setAccounts((await api<AccountsResponse>(paths.accounts)).accounts); }
    catch (e) { setAccountsError(say(e)); }
  }, []);
  const loadSession = useCallback(async () => {
    try { setSession(await api<SessionResponse>(paths.session)); } catch { /* the backup reminder just stays hidden */ }
  }, []);
  const loadStatus = useCallback(async () => {
    setStatusError("");
    try { setStatus(await api<PublishStatus>(paths.publishStatus)); }
    catch (e) { setStatusError(say(e)); }
  }, []);
  useEffect(() => { void loadAccounts(); void loadSession(); void loadStatus(); }, [loadAccounts, loadSession, loadStatus]);

  const afterNewRelease = () => { void loadStatus(); void Promise.resolve(reloadContent()).catch(() => undefined); };
  const putAccount = (a: Account) => setAccounts(list => {
    if (!list) return [a];
    return list.some(x => x.id === a.id) ? list.map(x => (x.id === a.id ? a : x)) : [...list, a];
  });

  return (
    <>
      <PageTitle title="Accounts">People who can sign in to the admin, the activity log and backups. Only you, the owner, can see this page.</PageTitle>

      {(session?.owner ?? owner)?.setupTokenActive && (
        <div role="note" className="mb-6 flex gap-3 rounded-2xl border border-gold/50 bg-gold/10 p-5 text-[15px]">
          <AlertTriangle className="mt-0.5 shrink-0 text-gold" />
          <p><span className="font-medium">SETUP_TOKEN is still set in Render's environment settings.</span> <span className="text-mute">Remove it there now that your owner account works. Set a new one only if you ever need to recover the owner account.</span></p>
        </div>
      )}

      {statusError && <div className="mb-6"><Problem text={`Couldn't check whether the database has content. ${statusError}`} onRetry={() => void loadStatus()} /></div>}
      {status?.release === 0 && <StartingContent onDone={afterNewRelease} />}

      <People accounts={accounts} error={accountsError} myId={myId} onRetry={() => void loadAccounts()} onChange={putAccount} />
      <Backups lastBackupAt={(session?.owner ?? owner)?.lastBackupAt ?? null} hasContent={status ? status.release > 0 : null}
        onDownloaded={() => void loadSession()} onImported={afterNewRelease} />
      <ActivityLog />
    </>
  );
}

/* ---------- People ---------- */

const STATUS_STYLE: Record<Account["status"], { text: string; cls: string }> = {
  active: { text: "Active", cls: "border-[#166534] text-[#86EFAC]" },
  invited: { text: "Invited", cls: "border-violet-soft/60 text-violet-soft" },
  deactivated: { text: "Deactivated", cls: "border-[#7F1D1D] text-[#FCA5A5]" },
};

function People({ accounts, error, myId, onRetry, onChange }: { accounts: Account[] | null; error: string; myId: string; onRetry: () => void; onChange: (a: Account) => void }) {
  const [inviting, setInviting] = useState(false);
  const [link, setLink] = useState<{ title: string; res: LinkResponse } | null>(null);
  const [confirmOff, setConfirmOff] = useState<Account | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const newLink = async (a: Account) => {
    setBusyId(a.id); setActionError("");
    try {
      const res = await api<LinkResponse>(paths.accountReset(a.id), { method: "POST", body: {} });
      onChange(res.account);
      setLink({ title: `${a.status === "invited" ? "New invite" : "Reset"} link for ${a.displayName}`, res });
    } catch (e) { setActionError(`Couldn't create a link for ${a.displayName}. ${say(e)}`); }
    finally { setBusyId(null); }
  };
  const reactivate = async (a: Account) => {
    setBusyId(a.id); setActionError("");
    try { onChange((await api<AccountResponse>(paths.accountReactivate(a.id), { method: "POST", body: {} })).account); }
    catch (e) { setActionError(`Couldn't reactivate ${a.displayName}. ${say(e)}`); }
    finally { setBusyId(null); }
  };

  return (
    <section aria-labelledby="acc-people">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="acc-people" className="font-display text-lg font-semibold">People</h2>
        <button className="btn-gold btn-sm max-sm:min-h-[44px]" onClick={() => setInviting(true)}><UserPlus size={16} /> Invite someone</button>
      </div>
      {actionError && <div className="mb-4"><Problem text={actionError} /></div>}
      {error ? <Problem text={`Couldn't load the accounts. ${error}`} onRetry={onRetry} />
        : !accounts ? <p role="status" className="adm-card text-mute">Loading accounts…</p>
          : (
            <ul className="grid grid-cols-1 gap-3">
              {accounts.map(a => {
                const locked = a.role === "owner" || a.id === myId, st = STATUS_STYLE[a.status], busy = busyId === a.id;
                return (
                  <li key={a.id} className="adm-card flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 break-words font-medium">{a.displayName}</span>
                        {a.id === myId && <span className="text-[14px] text-mute">(you)</span>}
                        <span className={`rounded-full border px-2.5 py-0.5 text-[12.5px] ${a.role === "owner" ? "border-violet-soft/60 text-violet-soft" : "border-line text-mute"}`}>{a.role === "owner" ? "Owner" : "Editor"}</span>
                        <span className={`rounded-full border px-2.5 py-0.5 text-[12.5px] font-medium ${st.cls}`}>{st.text}</span>
                      </p>
                      <p className="mt-1 break-words text-[14px] text-mute">{a.username} · {a.lastLoginAt ? `last signed in ${when(a.lastLoginAt)}` : "hasn't signed in yet"}</p>
                      {a.pendingLink && <p className="mt-1 text-[14px] text-mute">Unused {a.pendingLink.kind} link, expires {when(a.pendingLink.expiresAt)}</p>}
                    </div>
                    {!locked && (
                      <div className="flex flex-wrap gap-2">
                        {a.status !== "deactivated" ? (
                          <>
                            <button className={SMALL_BTN} disabled={busy} onClick={() => void newLink(a)}>{busy ? "Working…" : a.status === "invited" ? "New invite link" : "Reset link"}</button>
                            <button className="btn-danger btn-sm max-sm:min-h-[44px]" disabled={busy} onClick={() => { setActionError(""); setConfirmOff(a); }}>Deactivate</button>
                          </>
                        ) : <button className={SMALL_BTN} disabled={busy} onClick={() => void reactivate(a)}>{busy ? "Working…" : "Reactivate"}</button>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
      <p className="adm-hint mt-3">Everyone you invite is an editor: they can edit, publish, see the history and undo. A reset link lets someone choose a new passphrase; their current one keeps working until they use it.</p>

      {inviting && <InviteDialog onClose={() => setInviting(false)} onCreated={res => { onChange(res.account); setInviting(false); setLink({ title: `Invite link for ${res.account.displayName}`, res }); }} />}
      {link && <LinkDialog title={link.title} res={link.res} onClose={() => setLink(null)} />}
      {confirmOff && <DeactivateDialog account={confirmOff} onClose={() => setConfirmOff(null)} onDone={a => { onChange(a); setConfirmOff(null); }} />}
    </section>
  );
}

function InviteDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (res: LinkResponse) => void }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [errors, setErrors] = useState<{ name?: string; username?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const displayName = name.trim(), user = normaliseUsername(username), err: typeof errors = {};
    if (!displayName) err.name = "Add their name as it should appear in the admin.";
    else if (displayName.length > LIMITS.displayNameMaxLength) err.name = `Keep this to ${LIMITS.displayNameMaxLength} characters or fewer.`;
    if (!isValidUsername(user)) err.username = `Use ${LIMITS.usernameMinLength} to ${LIMITS.usernameMaxLength} lowercase letters, numbers, dots, dashes or underscores, starting and ending with a letter or number.`;
    setErrors(err);
    if (err.name || err.username) return;
    setBusy(true);
    try {
      const body: InviteRequest = { username: user, displayName };
      onCreated(await api<LinkResponse>(paths.invite, { method: "POST", body }));
    } catch (e) {
      if ((e as { code?: unknown } | null)?.code === "username_taken") setErrors({ username: "Someone already has this username. Choose another." });
      else setErrors({ form: say(e) });
      setBusy(false);
    }
  };

  return (
    <Modal title="Invite someone" onClose={() => { if (!busy) onClose(); }}
      footer={<>
        <button className="btn-ghost" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="btn-gold" disabled={busy} onClick={() => void submit()}>{busy ? "Creating the link…" : "Create invite link"}</button>
      </>}>
      <form className="grid grid-cols-1 gap-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <TextField label="Name" value={name} error={errors.name} maxLength={LIMITS.displayNameMaxLength} autoComplete="off"
          hint="How the admin shows them, for example in the history." onChange={setName} />
        <TextField label="Username" value={username} error={errors.username} maxLength={LIMITS.usernameMaxLength} autoComplete="off"
          autoCapitalize="none" spellCheck={false} hint="What they type to sign in, for example priya.s" onChange={setUsername} />
        {errors.form && <p role="alert" className="adm-error">{errors.form}</p>}
        <p className="text-[14px] text-mute">You'll get a one-time link to send them. They open it and choose their own passphrase.</p>
        <button type="submit" className="sr-only" tabIndex={-1}>Create invite link</button>
      </form>
    </Modal>
  );
}

function LinkDialog({ title, res, onClose }: { title: string; res: LinkResponse; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<"" | "yes" | "no">("");
  const copy = async () => {
    try { await navigator.clipboard.writeText(res.link); setCopied("yes"); }
    catch { input.current?.focus(); input.current?.select(); setCopied("no"); }
  };
  return (
    <Modal title={title} onClose={onClose} footer={<button className="btn-ghost" onClick={onClose}>Done</button>}>
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label htmlFor="setup-link" className="adm-label">One-time link</label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <input id="setup-link" ref={input} readOnly value={res.link} className="adm-input !mt-0 min-w-0 flex-1 font-mono text-[13.5px]" onFocus={e => e.currentTarget.select()} />
            <button className="btn-gold btn-sm max-sm:min-h-[44px] shrink-0" onClick={() => void copy()}>{copied === "yes" ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy</>}</button>
          </div>
          <span className="adm-hint" role="status">{copied === "no" ? "Couldn't copy automatically. The link is selected: copy it with your keyboard or long-press." : ""}</span>
        </div>
        <p className="text-[15px]">
          Send it privately, for example in a direct message. It works once and expires in {LIMITS.linkHours} hours ({when(res.expiresAt)}).
        </p>
        <p className="text-[14px] text-mute">It isn't shown again. If it gets lost, create a new link from this page; that cancels this one.</p>
      </div>
    </Modal>
  );
}

function DeactivateDialog({ account, onClose, onDone }: { account: Account; onClose: () => void; onDone: (a: Account) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    setBusy(true); setError("");
    try { onDone((await api<AccountResponse>(paths.accountDeactivate(account.id), { method: "POST", body: {} })).account); }
    catch (e) { setError(say(e)); setBusy(false); }
  };
  return (
    <Modal title={`Deactivate ${account.displayName}?`} onClose={() => { if (!busy) onClose(); }}
      footer={<>
        <button className="btn-ghost" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="btn-danger" disabled={busy} onClick={() => void go()}>{busy ? "Deactivating…" : "Deactivate"}</button>
      </>}>
      <div className="grid grid-cols-1 gap-3 text-[15px]">
        <p>{account.displayName} ({account.username}) is signed out everywhere and can't sign in again. Any unused link for them stops working.</p>
        <p className="text-mute">What they published stays in the history. You can reactivate the account later.</p>
        {error && <p role="alert" className="adm-error">{error}</p>}
      </div>
    </Modal>
  );
}

/* ---------- Starting content ---------- */

function StartingContent({ onDone }: { onDone: () => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<StartingContentResponse | null>(null);

  const go = async () => {
    setBusy(true); setError("");
    try {
      // The server rebuilds the site only when nothing needs fixing (the build refuses content that breaks the rules)
      const body: StartingContentRequest = { deploy: true };
      const res = await api<StartingContentResponse>(paths.importStartingContent, { method: "POST", body });
      setResult(res); setAsking(false); onDone();
    } catch (e) { setError(say(e)); }
    finally { setBusy(false); }
  };

  if (result) return (
    <section aria-label="Starting content imported" className="mb-10 grid grid-cols-1 gap-4">
      <ReleaseResult release={result.release} deploy={result.deploy}>
        <p className="font-medium">The starting content is in the database as release #{result.release}, with {result.imagesAdded} {result.imagesAdded === 1 ? "photo" : "photos"}.</p>
      </ReleaseResult>
      {result.warnings.length > 0 && <Warnings items={result.warnings} />}
    </section>
  );

  return (
    <section aria-labelledby="acc-start" className="adm-card mb-10 border-gold/50">
      <div className="flex gap-4">
        <Database className="mt-0.5 shrink-0 text-gold" />
        <div className="min-w-0 flex-1 text-[15px]">
          <h2 id="acc-start" className="font-display text-lg font-semibold">The database is empty</h2>
          <p className="mt-2 text-mute">
            Import the starting content to copy today's website content and photos (the files in the site's code) into the database, once, as release #1. After that, the database is where the content lives and every edit happens here.
          </p>
          <button className="btn-gold mt-4" onClick={() => { setError(""); setAsking(true); }}>Import starting content</button>
        </div>
      </div>
      {asking && (
        <Modal title="Import the starting content?" onClose={() => { if (!busy) setAsking(false); }}
          footer={<>
            <button className="btn-ghost" disabled={busy} onClick={() => setAsking(false)}>Cancel</button>
            <button className="btn-gold" disabled={busy} onClick={() => void go()}>{busy ? "Importing…" : "Import"}</button>
          </>}>
          <div className="grid grid-cols-1 gap-3 text-[15px]">
            <p>This copies every section (events, team, achievements, site settings, the Join page, FAQs, resources and the Home page) and the team, event and achievement photos into the database as release #1.</p>
            <p className="text-mute">It works only while the database has no releases, so it can't overwrite anything. Anything the content rules flag is listed afterwards, to fix here and publish. The site is rebuilt from the database once nothing needs fixing.</p>
            {error && <p role="alert" className="adm-error">{error}</p>}
          </div>
        </Modal>
      )}
    </section>
  );
}

function Warnings({ items }: { items: ErrorItem[] }) {
  return (
    <div className="adm-card border-gold/50">
      <p className="flex items-center gap-2 font-medium"><AlertTriangle size={18} className="shrink-0 text-gold" /> {items.length} {items.length === 1 ? "thing needs" : "things need"} fixing</p>
      <p className="mt-1 text-[14px] text-mute">These were imported as they are. Fix them in the editors before publishing those sections again.</p>
      <ul className="mt-3 grid grid-cols-1 gap-2 text-[15px]">
        {items.map((w, i) => <li key={i} className="min-w-0 break-words"><span className="font-medium">{w.label}:</span> <span className="text-mute">{w.message}</span></li>)}
      </ul>
    </div>
  );
}

/* ---------- Backups ---------- */

function Backups({ lastBackupAt, hasContent, onDownloaded, onImported }: { lastBackupAt: string | null; hasContent: boolean | null; onDownloaded: () => void; onImported: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [justDownloaded, setJustDownloaded] = useState(false);
  const [picked, setPicked] = useState<{ name: string; backup: BackupFile } | null>(null);
  const [pickError, setPickError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [imported, setImported] = useState<BackupImportResponse | null>(null);
  const [note, setNote] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [now] = useState(() => Date.now());

  const stale = hasContent && !justDownloaded && (!lastBackupAt || now - new Date(lastBackupAt).getTime() > LIMITS.backupReminderDays * DAY);

  const download = async () => {
    setDownloading(true); setDownloadError("");
    try {
      const r = await fetch(paths.backup, { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (!r.ok) {
        let msg = "";
        try { msg = ((await r.json()) as { error?: string }).error ?? ""; } catch { /* not JSON */ }
        throw new Error(msg || (r.status === 401 ? "Your session has ended. Sign in again." : `The server answered ${r.status}.`));
      }
      const blob = await r.blob();
      const name = /filename="?([^";]+)"?/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? `cis-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setJustDownloaded(true); onDownloaded();
    } catch (e) { setDownloadError(say(e)); }
    finally { setDownloading(false); }
  };

  const pick = async (file: File) => {
    setPickError(""); setImportError(""); setImported(null);
    if (file.size > LIMITS.backupBodyBytes) { setPickError(`This file is larger than ${LIMITS.backupBodyBytes / 1024 / 1024} MB, the most the server accepts.`); return; }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isBackupFile(parsed)) { setPickError("This isn't a backup from this admin. Choose a file made with Download backup."); return; }
      setNote(""); setPicked({ name: file.name, backup: parsed });
    } catch { setPickError("This file couldn't be read as a backup. Choose a file made with Download backup."); }
  };

  const runImport = async () => {
    if (!picked) return;
    setImporting(true); setImportError("");
    try {
      const body: BackupImportRequest = { backup: picked.backup, ...(note.trim() ? { note: note.trim() } : {}) };
      const res = await api<BackupImportResponse>(paths.backupImport, { method: "POST", body });
      setImported(res); setPicked(null); onImported();
    } catch (e) { setImportError(say(e)); }
    finally { setImporting(false); }
  };

  const liveOfBackup = picked?.backup.releases.find(r => r.release === picked.backup.release);

  return (
    <section aria-labelledby="acc-backups" className="mt-10">
      <h2 id="acc-backups" className="mb-4 font-display text-lg font-semibold">Backups</h2>
      <div className="adm-card grid grid-cols-1 gap-5">
        <div>
          <p className="text-[15px]">A backup is one file with every release, every section version and every photo. Accounts aren't included. Keep it somewhere safe, outside this admin.</p>
          <p className="mt-2 text-[14px] text-mute">{justDownloaded ? "Last backup: just now." : lastBackupAt ? `Last backup: ${when(lastBackupAt)}.` : "No backup has been downloaded yet."}</p>
          {stale && (
            <p className="mt-3 flex gap-2 rounded-xl border border-gold/50 bg-gold/10 px-4 py-3 text-[15px]">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-gold" />
              {lastBackupAt ? `Your last backup is more than ${LIMITS.backupReminderDays} days old. Download a new one.` : "Download a first backup now."}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-gold btn-sm max-sm:min-h-[44px]" disabled={downloading || !hasContent} onClick={() => void download()}><Download size={16} /> {downloading ? "Preparing the backup…" : "Download backup"}</button>
          </div>
          {hasContent === false && <p className="adm-hint">There is nothing to back up until the database has content.</p>}
          {downloadError && <div className="mt-3"><Problem text={`Couldn't download the backup. ${downloadError}`} /></div>}
        </div>

        <div className="border-t border-line pt-5">
          <h3 className="font-medium">Import a backup</h3>
          <p className="mt-1 text-[15px] text-mute">Adds the photos from the backup that the database doesn't have, then makes the backup's live content live again as a new release. Nothing already in the database is removed.</p>
          <button className={`${SMALL_BTN} mt-4`} onClick={() => fileInput.current?.click()}><FileUp size={16} /> Choose a backup file</button>
          <input ref={fileInput} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-label="Backup file"
            onChange={e => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />
          {pickError && <p role="alert" className="adm-error">{pickError}</p>}
          {imported && (
            <div className="mt-4">
              <ReleaseResult release={imported.release} deploy={imported.deploy}>
                <p className="font-medium">The backup's content is now release #{imported.release}. {imported.imagesAdded} {imported.imagesAdded === 1 ? "photo was" : "photos were"} added.</p>
              </ReleaseResult>
              {(imported.warnings ?? []).length > 0 && <div className="mt-4"><Warnings items={imported.warnings} /></div>}
            </div>
          )}
        </div>
      </div>

      {picked && (
        <Modal title="Import this backup?" onClose={() => { if (!importing) setPicked(null); }}
          footer={<>
            <button className="btn-ghost" disabled={importing} onClick={() => setPicked(null)}>Cancel</button>
            <button className="btn-gold" disabled={importing} onClick={() => void runImport()}>{importing ? "Importing…" : "Import and make it live"}</button>
          </>}>
          <div className="grid grid-cols-1 gap-4 text-[15px]">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
              <dt className="text-mute">File</dt><dd className="break-words">{picked.name}</dd>
              <dt className="text-mute">Made</dt><dd>{when(picked.backup.createdAt)}</dd>
              <dt className="text-mute">Live then</dt><dd>Release #{picked.backup.release}{liveOfBackup ? `, published ${when(liveOfBackup.publishedAt)} by ${liveOfBackup.publishedBy}` : ""}</dd>
              <dt className="text-mute">Contains</dt><dd>{picked.backup.releases.length} releases, {picked.backup.images.length} photos</dd>
            </dl>
            <p>The content of release #{picked.backup.release} from this file replaces what is live now, as a new release. Today's content stays in the history, so you can switch back from the History page.</p>
            <TextField label="Note (optional)" value={note} maxLength={LIMITS.noteMaxLength} placeholder="Why you're importing it" onChange={setNote} />
            {importError && <p role="alert" className="adm-error">{importError}</p>}
          </div>
        </Modal>
      )}
    </section>
  );
}

/* ---------- Activity log ---------- */

function ActivityLog() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (before?: string) => {
    setLoading(true); setError("");
    try {
      const page = await api<AuditPage>(paths.audit(before, LIMITS.auditPageSize));
      setEntries(prev => (before === undefined ? page.entries : [...(prev ?? []), ...page.entries]));
      setNextBefore(page.nextBefore);
    } catch (e) { setError(say(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <section aria-labelledby="acc-log" className="mt-10">
      <h2 id="acc-log" className="mb-1 font-display text-lg font-semibold">Activity log</h2>
      <p className="mb-4 text-[14px] text-mute">Sign-ins, publishes, account changes and backups, newest first. Kept for {LIMITS.auditRetentionDays} days.</p>
      {error && <div className="mb-4"><Problem text={`Couldn't load the activity log. ${error}`} onRetry={() => void load(entries?.length ? (nextBefore ?? undefined) : undefined)} /></div>}
      {entries === null ? (!error && <p role="status" className="adm-card text-mute">Loading the activity log…</p>)
        : entries.length === 0 ? <p className="adm-card text-mute">Nothing has happened yet.</p>
          : (
            <ul className="adm-card grid grid-cols-1 divide-y divide-line !py-2">
              {entries.map(e => (
                <li key={e.id} className="min-w-0 py-3 text-[15px]">
                  <p className="break-words">
                    <span className="font-medium">{ACTIONS[e.action] ?? e.action}</span>
                    {e.target && <span className="text-cream/90">: {e.target}</span>}
                  </p>
                  <p className="mt-0.5 break-words text-[13.5px] text-mute">{e.actor ?? "Not signed in"} · {when(e.at)}{e.detail ? ` · ${e.detail}` : ""}</p>
                </li>
              ))}
            </ul>
          )}
      {nextBefore !== null && entries && (
        <button className="btn-ghost mt-4 w-full sm:w-auto" disabled={loading} onClick={() => void load(nextBefore)}>{loading ? "Loading…" : "Load older activity"}</button>
      )}
    </section>
  );
}
