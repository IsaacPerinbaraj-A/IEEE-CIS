/** Small text helpers shared by the admin, the server and the build. No browser-only or Node-only APIs. */

/**
 * Text as it is stored: Unicode NFC, Windows line endings turned into \n, and control characters removed
 * (tab and new line are kept). Leading and trailing spaces are left alone; validators decide about empty text.
 */
export function cleanText(s: string): string {
  let out = "";
  for (const ch of s.normalize("NFC").replace(/\r\n?/g, "\n")) {
    const c = ch.charCodeAt(0);
    if ((c < 32 && c !== 9 && c !== 10) || c === 127) continue;
    out += ch;
  }
  return out;
}

/** Lowercase letters, numbers and single dashes, at most 60 characters ("Priya S." becomes "priya-s"). */
export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, "");

/** Number of characters as people count them (code points, so an emoji counts once). */
export const charCount = (s: string) => Array.from(s).length;

/** "a", "a and b", "a, b and c" */
export function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** Cuts long text for labels: "Who can join IEEE CIS…" */
export function truncate(s: string, max = 48): string {
  const chars = Array.from(s.trim());
  return chars.length > max ? `${chars.slice(0, max - 1).join("").trimEnd()}…` : chars.join("");
}
