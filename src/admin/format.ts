/** Dates, times and messages as the admin shows them. */
import { normalisePassphrase, passphraseProblems, type PassphraseContext } from "../../shared/passphrase.ts";
import { ApiError, errorText } from "./api";

/** "22 Sept 2026, 3:40 pm" in the viewer's time zone. */
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago", then the date. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  const unit = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"} ago`;
  if (s < 60) return "just now";
  if (s < 3600) return unit(Math.floor(s / 60), "minute");
  if (s < 86400) return unit(Math.floor(s / 3600), "hour");
  if (s < 7 * 86400) return unit(Math.floor(s / 86400), "day");
  return dateTime(iso);
}

/** Days since a date (Infinity when there is none). */
export const daysSince = (iso: string | null | undefined, now = Date.now()) => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(t) ? Infinity : (now - t) / 86_400_000;
};

/** "Priya", "Priya and Arun", "Priya, Arun and Meena". */
export function names(list: string[]): string {
  const u = [...new Set(list.filter(Boolean))];
  return u.length <= 1 ? (u[0] ?? "") : `${u.slice(0, -1).join(", ")} and ${u[u.length - 1]}`;
}

/** Problems that stop a new passphrase from being sent (the server checks again). */
export function newPassphraseError(next: string, confirm: string, context: PassphraseContext): string {
  const problems = passphraseProblems(next, context);
  if (problems.length) return problems[0];
  if (normalisePassphrase(next) !== normalisePassphrase(confirm)) return "The two passphrases don't match.";
  return "";
}

/** Server answers about a new passphrase, in plain words. */
export function passphraseErrorText(e: unknown): string {
  if (e instanceof ApiError && e.code === "weak_passphrase") {
    const reasons = Array.isArray(e.data.reasons) ? e.data.reasons.filter((r): r is string => typeof r === "string") : [];
    return reasons.length ? reasons.join(" ") : e.message;
  }
  return errorText(e);
}
