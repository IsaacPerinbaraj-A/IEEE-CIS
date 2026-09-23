/**
 * Reading request input safely. Bodies are untrusted: read only the fields you need with these helpers, which
 * throw 400 bad_request with a plain message when something is missing or the wrong type.
 */
import type { Request } from "express";
import { cleanText } from "../../shared/text.ts";
import { badRequest } from "./errors.ts";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The JSON body as an object (400 when it's missing or not an object). */
export function jsonBody(req: Request): Record<string, unknown> {
  const body: unknown = req.body;
  if (!isRecord(body)) throw badRequest("Send a JSON object.");
  return body;
}

type TextOptions = { label: string; max: number; required?: boolean; clean?: boolean };

/** A text field. `clean` (default true) applies NFC and removes control characters. Passphrases: clean false. */
export function textField(body: Record<string, unknown>, key: string, o: TextOptions): string {
  const v = body[key];
  if (v === undefined || v === null || v === "") {
    if (o.required !== false) throw badRequest(`${o.label} is missing.`);
    return "";
  }
  if (typeof v !== "string") throw badRequest(`${o.label} must be text.`);
  const text = o.clean === false ? v : cleanText(v);
  if (Array.from(text).length > o.max) throw badRequest(`${o.label} is too long (at most ${o.max} characters).`);
  return text;
}

/** An optional true/false field (missing means false). */
export function booleanField(body: Record<string, unknown>, key: string, label: string): boolean {
  const v = body[key];
  if (v === undefined || v === null) return false;
  if (typeof v !== "boolean") throw badRequest(`${label} must be true or false.`);
  return v;
}

/** A whole number from a body field, route parameter or query string. */
export function intValue(v: unknown, o: { label: string; min: number; max: number; fallback?: number }): number {
  if ((v === undefined || v === null || v === "") && o.fallback !== undefined) return o.fallback;
  const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d+$/.test(v.trim()) ? Number(v.trim()) : NaN;
  if (!Number.isSafeInteger(n) || n < o.min || n > o.max) throw badRequest(`${o.label} must be a whole number from ${o.min} to ${o.max}.`);
  return n;
}

/** A single query-string value (Express may give arrays for repeated keys). */
export function queryValue(req: Request, key: string): string | undefined {
  const v: unknown = (req.query as Record<string, unknown>)[key];
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined;
  return typeof v === "string" ? v : undefined;
}
