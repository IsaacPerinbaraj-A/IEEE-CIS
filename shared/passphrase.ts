/**
 * Passphrase rules (NIST SP 800-63B style): at least 15 characters, no composition rules, not built from obvious
 * words. The admin shows these as hints while typing; the server checks them again and also checks the passphrase
 * against the Have I Been Pwned range API (server only).
 */
import { LIMITS } from "./api.ts";

/** Words that make a passphrase easy to guess for this site, besides the person's own name and username. */
export const CONTEXT_WORDS = ["ieee", "cis", "rec", "rajalakshmi", "admin", "password"] as const;

/** Passphrases are compared and hashed in this form. */
export const normalisePassphrase = (s: string) => s.normalize("NFC");

export type PassphraseContext = { username?: string; displayName?: string; year?: number };

const letters = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Reasons the passphrase isn't allowed (empty when it's fine). What's left after removing the club's name, the
 * person's name and username, "admin", "password" and years around `year` must be at least 10 letters or digits,
 * so "correct horse battery staple" passes but "IEEE CIS REC admin 2026" doesn't.
 */
export function passphraseProblems(passphrase: string, context: PassphraseContext = {}): string[] {
  const p = normalisePassphrase(passphrase);
  const length = Array.from(p).length;
  if (length < LIMITS.passphraseMinLength) return [`Use at least ${LIMITS.passphraseMinLength} characters. A short sentence works well.`];
  if (length > LIMITS.passphraseMaxLength) return [`Use at most ${LIMITS.passphraseMaxLength} characters.`];
  const problems: string[] = [];
  const core = letters(p);
  if (new Set(core).size < 5) problems.push("Use more different letters or words.");
  const words: string[] = [...CONTEXT_WORDS];
  for (const part of [context.username, ...(context.displayName ?? "").split(/\s+/)]) {
    const w = letters(part ?? "");
    if (w.length >= 3) words.push(w);
  }
  if (context.year) for (let y = context.year - 1; y <= context.year + 1; y++) words.push(String(y));
  let rest = core;
  // Longest words first, so "rajalakshmi" goes before "rec"
  for (const w of [...new Set(words)].sort((a, b) => b.length - a.length)) rest = rest.split(w).join("");
  if (Array.from(rest).length < 10) problems.push("Don't build it from the club's name, your name, admin, password or the year.");
  return problems;
}
