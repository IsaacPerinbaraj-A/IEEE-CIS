import { createContext, useContext } from "react";
import type { DeployInfo, PresenceEntry, PublishResponse, Role, SessionResponse } from "../../shared/api.ts";
import type { ImageFolder } from "../../shared/sections.ts";
import type { Content, ContentKey } from "./model";
import type { Prefer } from "./draft";

/** The signed-in person. */
export type Me = { id: string; username: string; name: string; role: Role };

/** The newest release the admin knows about. Release 0: nothing has been published yet. */
export type LiveInfo = { release: number; publishedAt: string | null; publishedBy: string | null };

/** What the last publish from this browser did, for the Publish page's live status. */
export type LastPublish = { release: number; deploy: DeployInfo; merged: PublishResponse["merged"]; summaries: PublishResponse["summaries"] };

export type AdminStore = {
  me: Me;
  /** Owner-only extras from the session (SETUP_TOKEN still set, last backup). */
  owner?: SessionResponse["owner"];
  /** The draft every editor works on: the live content plus this person's unpublished edits. */
  content: Content;
  /** What the draft's edits are measured against (the content each section had when editing started). */
  base: Content;
  /** The release the edits started from (sent with Publish, so the server can combine them with newer releases). */
  baseRelease: number;
  live: LiveInfo;
  /** False while nothing is published yet (the owner imports the starting content from Accounts). */
  initialised: boolean;
  update: <K extends ContentKey>(key: K, value: Content[K]) => void;
  /** Uploads an image (already cropped and compressed) and returns the address to store in the content. */
  addImage: (folder: ImageFolder, baseName: string, blob: Blob) => Promise<string>;
  /** Resolves an image address to something the browser can show right now (new uploads come from the server). */
  preview: (src?: string) => string | undefined;
  /** Sections with unpublished changes, in SECTION_KEYS order. */
  dirty: ContentKey[];
  discard: () => void;
  /**
   * Fetches the newest release and moves the draft onto it, keeping unpublished edits. With "theirs", items both
   * sides changed take the newest release's version; by default clashing sections stay as they are, so Publish
   * reports the clash.
   */
  reloadContent: (prefer?: Prefer) => Promise<void>;
  /** Records a successful publish and moves the draft onto the new release. */
  afterPublish: (res: PublishResponse, sent: Partial<Content>) => Promise<void>;
  lastPublish: LastPublish | null;
  clearLastPublish: () => void;
  /** Other people with a section open right now. */
  others: PresenceEntry[];
  changePassphrase: () => void;
  signOut: () => void;
};

export const AdminContext = createContext<AdminStore | null>(null);
export function useAdmin() {
  const v = useContext(AdminContext);
  if (!v) throw new Error("useAdmin must be used inside the admin");
  return v;
}
