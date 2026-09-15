import { adminConfig } from "./model";

export const REPO_KEY = "cis-admin-repo", BRANCH_KEY = "cis-admin-branch", TOKEN_KEY = "cis-admin-token";

/** Stored sign-in (token only in this tab unless "keep me signed in" was ticked). */
export function savedGitHub() {
  const token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  const repo = localStorage.getItem(REPO_KEY) || adminConfig.repo, branch = localStorage.getItem(BRANCH_KEY) || adminConfig.branch || "main";
  return token && repo ? { token, repo, branch } : null;
}
export function forgetToken() { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); }
