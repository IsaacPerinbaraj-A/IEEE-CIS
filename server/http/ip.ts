/**
 * The visitor's IP address, stored only as a keyed hash (IP_HASH_KEY).
 *
 * Through the site, Vercel sets x-vercel-forwarded-for / x-real-ip to the visitor's address. There is no secret
 * header between Vercel and Render, so someone calling the Render address directly can fake those headers: per-IP
 * login limits are only a second line of defence behind the per-username limits. Check which headers really
 * arrive once the site is live.
 */
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { Request } from "express";

const firstValid = (value: string | undefined) => {
  const ip = value?.split(",")[0]?.trim();
  return ip && isIP(ip) ? ip : null;
};

/** Best guess at the visitor's IP (see above), or "unknown". */
export function clientIp(req: Request): string {
  return firstValid(req.get("x-vercel-forwarded-for")) ?? firstValid(req.get("x-real-ip")) ?? firstValid(req.ip) ?? "unknown";
}

/** Pseudonym for an IP address: HMAC-SHA256 with IP_HASH_KEY, 32 hex characters. */
export const ipHash = (key: string, ip: string) => createHmac("sha256", key).update(ip).digest("hex").slice(0, 32);
