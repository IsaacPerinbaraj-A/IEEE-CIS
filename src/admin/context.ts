import { createContext, useContext } from "react";
import type { Backend } from "./backend";
import type { Content, ContentKey } from "./model";

export type PendingImage = { path: string; blob: Blob; url: string };

export type AdminStore = {
  backend: Backend;
  content: Content;
  /** Serialized text of each file as it was when loaded (to detect changes and conflicts). */
  original: Record<ContentKey, string>;
  images: Record<string, PendingImage>;
  update: <K extends ContentKey>(key: K, value: Content[K]) => void;
  /** Queue an image for publishing. Returns the address to store in the data, e.g. /images/team/name.webp?v=… */
  addImage: (folder: "team" | "events" | "achievements", baseName: string, blob: Blob) => string;
  /** Resolve an image address to something the browser can show right now (queued uploads use a local preview). */
  preview: (src?: string) => string | undefined;
  dirty: ContentKey[];
  discard: () => void;
  afterPublish: () => void;
  signOut: () => void;
};

export const AdminContext = createContext<AdminStore | null>(null);
export function useAdmin() {
  const v = useContext(AdminContext);
  if (!v) throw new Error("useAdmin must be used inside the admin");
  return v;
}
