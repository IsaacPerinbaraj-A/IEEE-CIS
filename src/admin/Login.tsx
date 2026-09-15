import { useEffect, useState } from "react";
import { Github, HardDrive, KeyRound, WifiOff } from "lucide-react";
import { githubBackend, localAvailable, localBackend, offlineBackend, type Backend } from "./backend";
import { adminConfig } from "./model";
import { BRANCH_KEY, REPO_KEY, TOKEN_KEY } from "./session";
import { TextField } from "./ui";
import { RecMark } from "../components/Brand";

export default function Login({ onConnect }: { onConnect: (b: Backend, who?: string) => void }) {
  const [repo, setRepo] = useState(localStorage.getItem(REPO_KEY) || adminConfig.repo);
  const [branch, setBranch] = useState(localStorage.getItem(BRANCH_KEY) || adminConfig.branch || "main");
  const [token, setToken] = useState(""), [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [local, setLocal] = useState(false);

  useEffect(() => { localAvailable().then(setLocal); }, []);

  const connect = async () => {
    setError("");
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo.trim())) { setError("Enter the repository as owner/name, for example ieee-cis-rec/website."); return; }
    if (token.trim().length < 20) { setError("Paste your GitHub access token."); return; }
    setBusy(true);
    try {
      const gh = githubBackend({ repo: repo.trim(), branch: branch.trim() || "main", token: token.trim() });
      const who = await gh.verify();
      if (!who.canPush) { setError("This token can see the repository but can't change it. It needs Contents: Read and write."); return; }
      localStorage.setItem(REPO_KEY, repo.trim()); localStorage.setItem(BRANCH_KEY, branch.trim() || "main");
      (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token.trim());
      onConnect(gh, who.login);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-ink px-4 py-10">
      <div className="w-full max-w-[520px]">
        <div className="mb-8 flex items-center gap-3"><RecMark className="h-10 w-10" /><div><p className="font-display font-semibold">IEEE CIS REC</p><p className="text-[14px] text-mute">Website admin</p></div></div>

        {local && (
          <button onClick={() => onConnect(localBackend())} className="adm-card mb-4 flex w-full items-center gap-4 text-left transition-colors hover:border-violet-soft">
            <HardDrive className="shrink-0 text-gold" />
            <span><span className="block font-medium">Edit the files on this computer</span><span className="text-[14px] text-mute">You're running the site locally, so changes save straight into the project.</span></span>
          </button>
        )}

        <form className="adm-card grid gap-4" onSubmit={e => { e.preventDefault(); connect(); }} noValidate>
          <h1 className="flex items-center gap-2 font-display text-xl font-semibold"><Github size={20} /> Sign in with GitHub</h1>
          <p className="-mt-1 text-[15px] text-mute">Only people with write access to the website's repository can publish.</p>
          <TextField label="Repository" value={repo} onChange={setRepo} placeholder="owner/name" autoComplete="off" spellCheck={false} />
          <TextField label="Branch" value={branch} onChange={setBranch} autoComplete="off" spellCheck={false} />
          <TextField label="Access token" type="password" value={token} onChange={setToken} autoComplete="off" spellCheck={false}
            hint="Stays in this browser. It's never added to the website's code." />
          <label className="flex items-center gap-2.5 text-[15px] text-mute">
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="h-4 w-4 accent-[#F2B544]" />
            Keep me signed in on this device (only on your own device)
          </label>
          {error && <p role="alert" className="rounded-xl border border-[#7F1D1D] bg-[#7F1D1D]/25 px-4 py-3 text-[15px] text-[#FCA5A5]">{error}</p>}
          <button type="submit" className="btn-gold" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
          <details className="rounded-xl border border-line p-4 text-[14px] text-mute">
            <summary className="flex cursor-pointer items-center gap-2 font-medium text-cream"><KeyRound size={16} /> How to get an access token</summary>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5">
              <li>On GitHub, open Settings, then Developer settings, then Personal access tokens, then Fine-grained tokens.</li>
              <li>Choose Generate new token. Give it a name like "CIS website admin" and an expiry date.</li>
              <li>Under Repository access, choose Only select repositories and pick the website's repository.</li>
              <li>Under Permissions, set Contents to Read and write. Leave everything else as it is.</li>
              <li>Generate the token, copy it, and paste it above. Treat it like a password.</li>
            </ol>
            <p className="mt-3">You need to be a collaborator on the repository first. Ask the current web lead to add you.</p>
          </details>
        </form>

        <button onClick={() => onConnect(offlineBackend())} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3 text-[15px] text-mute hover:text-cream">
          <WifiOff size={16} /> Continue without signing in (changes download as files)
        </button>
      </div>
    </div>
  );
}
