/**
 * One JSON line per event on stdout (Render keeps these logs only briefly; lasting records go to the audit
 * collection). Never log passphrases, tokens, cookies, request bodies, connection strings or the deploy hook:
 * fields with such names are replaced by "[redacted]" and connection strings inside text are masked.
 */

export type LogFields = Record<string, unknown>;
export type Logger = {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
};

const SECRET_FIELD = /pass(word|phrase)?|token|secret|cookie|authori[sz]ation|mongodb_?uri|connection_?string|hook_?url|hash_?key/i;

/** Masks connection strings, bearer tokens and URLs with credentials inside free text. */
export function scrub(text: string): string {
  return text
    .replace(/mongodb(\+srv)?:\/\/[^\s"'<>]+/gi, "mongodb://[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]")
    .replace(/https:\/\/api\.vercel\.com\/v1\/integrations\/deploy\/[^\s"'<>]+/gi, "[deploy hook]")
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[redacted]@");
}

function clean(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrub(value).slice(0, 2000);
  if (value instanceof Error) return { name: value.name, message: scrub(value.message).slice(0, 500) };
  if (Array.isArray(value)) return depth > 3 ? "[list]" : value.slice(0, 50).map(v => clean(v, depth + 1));
  if (value && typeof value === "object") {
    if (depth > 3) return "[object]";
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_FIELD.test(k) ? "[redacted]" : clean(v, depth + 1);
    return out;
  }
  return value;
}

export function createLogger(write: (line: string) => void = line => { process.stdout.write(`${line}\n`); }): Logger {
  const emit = (level: "info" | "warn" | "error", event: string, fields: LogFields = {}) => {
    const safe = clean(fields) as LogFields;
    write(JSON.stringify({ ts: new Date().toISOString(), level, event, ...safe }));
  };
  return {
    info: (event, fields) => emit("info", event, fields),
    warn: (event, fields) => emit("warn", event, fields),
    error: (event, fields) => emit("error", event, fields),
  };
}

/** For tests. */
export const silentLogger: Logger = { info() {}, warn() {}, error() {} };
