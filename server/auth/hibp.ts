/**
 * New passphrases: the shared rules (shared/passphrase.ts: length, context words, the current year) plus the
 * Have I Been Pwned "Pwned Passwords" range API. Only the first 5 characters of the passphrase's SHA-1 leave the
 * server (k-anonymity), with Add-Padding so the response size reveals nothing. If the API can't be reached the
 * check is skipped (fail open) and a warning is logged; the other rules still apply.
 */
import { createHash } from "node:crypto";
import type { WeakPassphraseError } from "../../shared/api.ts";
import { normalisePassphrase, passphraseProblems, type PassphraseContext } from "../../shared/passphrase.ts";
import type { AppDeps } from "../deps.ts";
import { HttpError } from "../http/errors.ts";

export const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";
export const HIBP_TIMEOUT_MS = 4000;
export const BREACHED_MESSAGE = "This passphrase has appeared in a data breach, so attackers already try it. Choose a different one.";

/** Uppercase SHA-1 hex of the NFC passphrase, split into the 5 characters sent and the 35 kept. */
export function sha1Parts(passphrase: string): { prefix: string; suffix: string } {
  const hex = createHash("sha1").update(normalisePassphrase(passphrase), "utf8").digest("hex").toUpperCase();
  return { prefix: hex.slice(0, 5), suffix: hex.slice(5) };
}

/** How often `suffix` appears in a range response ("SUFFIX:COUNT" lines; padding lines have count 0). */
export function breachCount(body: string, suffix: string): number {
  for (const line of body.split(/\r?\n/)) {
    const [s, n] = line.trim().split(":");
    if (s?.toUpperCase() === suffix) {
      const count = Number(n);
      return Number.isFinite(count) ? count : 0;
    }
  }
  return 0;
}

/** Times the passphrase appears in known breaches, or null when the API couldn't be asked. */
export async function pwnedCount(fetchFn: typeof fetch, passphrase: string, timeoutMs = HIBP_TIMEOUT_MS): Promise<number | null> {
  const { prefix, suffix } = sha1Parts(passphrase);
  try {
    const r = await fetchFn(`${HIBP_RANGE_URL}${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "ieee-cis-rec-admin" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return null;
    return breachCount(await r.text(), suffix);
  } catch {
    return null;
  }
}

/** Every reason a new passphrase isn't allowed (empty when it's fine). */
export async function newPassphraseProblems(deps: AppDeps, passphrase: string, context: PassphraseContext): Promise<string[]> {
  const local = passphraseProblems(passphrase, { ...context, year: deps.now().getUTCFullYear() });
  if (local.length) return local;
  const count = await pwnedCount(deps.fetch, passphrase);
  if (count === null) {
    deps.log.warn("hibp_unreachable", { hint: "The breached-passphrase check was skipped for this passphrase." });
    return [];
  }
  return count > 0 ? [BREACHED_MESSAGE] : [];
}

/** Throws 422 weak_passphrase (WeakPassphraseError) unless the new passphrase is fine. */
export async function requireStrongPassphrase(deps: AppDeps, passphrase: string, context: PassphraseContext): Promise<void> {
  const reasons = await newPassphraseProblems(deps, passphrase, context);
  if (reasons.length) {
    const extra: Pick<WeakPassphraseError, "reasons"> = { reasons };
    throw new HttpError(422, "weak_passphrase", reasons[0], extra);
  }
}
