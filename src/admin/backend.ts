/**
 * Where the admin reads and saves content.
 * - github: the live setup. Reads from and commits to the site's GitHub repository with a personal access token.
 * - local: `npm run dev` on your own computer. Reads and writes the files directly (see admin-local-backend.ts).
 * - offline: no connection. Edits are downloaded as files you can upload to GitHub yourself.
 */
export type FileChange = { path: string; content: string; encoding: "utf-8" | "base64" };
export type PublishResult = { url?: string; note: string };

export type Backend = {
  kind: "github" | "local" | "offline";
  label: string;
  read(path: string): Promise<string | null>;
  publish(changes: FileChange[], message: string): Promise<PublishResult>;
};

export class BackendError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export type GitHubConfig = { repo: string; branch: string; token: string; api?: string };

/** Explains GitHub errors in plain words. */
function explain(status: number, fallback: string) {
  if (status === 401) return "GitHub didn't accept this token. It may be mistyped or expired.";
  if (status === 403) return "This token isn't allowed to do that. Make sure it has Contents: Read and write access to the repository.";
  if (status === 404) return "Couldn't find the repository or file. Check the owner/name and that the token can access it.";
  if (status === 409 || status === 422) return "Someone else published changes at the same moment. Try publishing again.";
  return fallback;
}

export function githubBackend(cfg: GitHubConfig) {
  const api = (cfg.api || "https://api.github.com").replace(/\/$/, "");
  const base = `${api}/repos/${cfg.repo}`;
  const headers = (extra: Record<string, string> = {}) => ({
    Authorization: `Bearer ${cfg.token}`, "X-GitHub-Api-Version": "2022-11-28", Accept: "application/vnd.github+json", ...extra,
  });
  const call = async <T,>(url: string, init: RequestInit = {}): Promise<T> => {
    const res = await fetch(url, { cache: "no-store", ...init, headers: headers(init.body ? { "Content-Type": "application/json" } : {}) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { message?: string };
      throw new BackendError(explain(res.status, body.message || `GitHub error ${res.status}`), res.status);
    }
    return res.json() as Promise<T>;
  };
  const encPath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

  const backend: Backend & { verify(): Promise<{ login: string; canPush: boolean; fullName: string }> } = {
    kind: "github",
    label: `GitHub: ${cfg.repo} (${cfg.branch})`,

    async verify() {
      const repo = await call<{ full_name: string; permissions?: { push?: boolean } }>(base);
      const user = await call<{ login: string }>(`${api}/user`).catch(() => ({ login: "" }));
      return { login: user.login, canPush: !!repo.permissions?.push, fullName: repo.full_name };
    },

    async read(path) {
      const res = await fetch(`${base}/contents/${encPath(path)}?ref=${encodeURIComponent(cfg.branch)}`, {
        cache: "no-store", headers: headers({ Accept: "application/vnd.github.raw+json" }),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new BackendError(explain(res.status, `Couldn't read ${path}`), res.status);
      return res.text();
    },

    /** One commit for everything: new blobs, a tree on top of the latest commit, then move the branch. */
    async publish(changes, message) {
      const attempt = async () => {
        const ref = await call<{ object: { sha: string } }>(`${base}/git/ref/heads/${encodeURIComponent(cfg.branch)}`);
        const parent = await call<{ tree: { sha: string } }>(`${base}/git/commits/${ref.object.sha}`);
        const tree = [];
        for (const c of changes) {
          const blob = await call<{ sha: string }>(`${base}/git/blobs`, { method: "POST", body: JSON.stringify({ content: c.content, encoding: c.encoding }) });
          tree.push({ path: c.path, mode: "100644", type: "blob", sha: blob.sha });
        }
        const newTree = await call<{ sha: string }>(`${base}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: parent.tree.sha, tree }) });
        const commit = await call<{ sha: string; html_url: string }>(`${base}/git/commits`, {
          method: "POST", body: JSON.stringify({ message, tree: newTree.sha, parents: [ref.object.sha] }),
        });
        await call(`${base}/git/refs/heads/${encodeURIComponent(cfg.branch)}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });
        return commit;
      };
      let commit;
      try { commit = await attempt(); }
      catch (e) { if (e instanceof BackendError && (e.status === 409 || e.status === 422)) commit = await attempt(); else throw e; }
      return { url: commit.html_url, note: "Published to GitHub. The live site rebuilds automatically, usually within a minute or two." };
    },
  };
  return backend;
}

export async function localAvailable() {
  try { const r = await fetch("/__admin/ping", { cache: "no-store" }); return r.ok && (await r.json()).ok === true; } catch { return false; }
}

export function localBackend(): Backend {
  return {
    kind: "local",
    label: "Files on this computer (npm run dev)",
    async read(path) {
      const r = await fetch(`/__admin/file?path=${encodeURIComponent(path)}`, { cache: "no-store" });
      if (r.status === 404) return null;
      if (!r.ok) throw new BackendError(`Couldn't read ${path}`, r.status);
      return (await r.json()).text as string;
    },
    async publish(changes) {
      const r = await fetch("/__admin/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: changes }) });
      if (!r.ok) throw new BackendError((await r.json().catch(() => ({}))).error || "Couldn't save the files", r.status);
      return { note: "Saved to the project files on this computer. Commit and push them with Git to put them online." };
    },
  };
}

export function offlineBackend(): Backend {
  return {
    kind: "offline",
    label: "Offline (changes download as files)",
    async read() { return null; },
    async publish(changes) {
      for (const c of changes) {
        const bytes = c.encoding === "base64" ? Uint8Array.from(atob(c.content), ch => ch.charCodeAt(0)) : new TextEncoder().encode(c.content);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([bytes]));
        a.download = c.path.split("/").pop() || "file";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        await new Promise(r => setTimeout(r, 250));
      }
      return { note: `Downloaded ${changes.length} file${changes.length === 1 ? "" : "s"}. Put them in the same folders in the repository (the paths are listed above).` };
    },
  };
}
