/**
 * Activity log entries for content actions (publish, restore, deploy, image upload, starting-content import),
 * written with the shared helper in server/auth/audit.ts after the change is committed. A failed write is logged
 * and never fails the request.
 */
import type { Request } from "express";
import { recordAudit, requestIpHash, type AuditInput } from "../auth/audit.ts";
import type { AppDeps } from "../deps.ts";

export type ContentAuditEntry = Omit<AuditInput, "ipHash">;

/** The activity log's name for a release. */
export const releaseTarget = (n: number) => `Release ${n}`;

export const writeAudit = (deps: AppDeps, req: Request | null, entry: ContentAuditEntry): Promise<void> =>
  recordAudit(deps, { ...entry, ipHash: req ? requestIpHash(deps, req) : null });
