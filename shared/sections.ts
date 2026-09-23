/**
 * The content sections the admin edits, shared by the admin (browser), the admin server (Render) and the build script.
 * Nothing in shared/ may use browser-only or Node-only APIs.
 */

/** Every section, in the order the admin lists them. */
export const SECTION_KEYS = ["events", "team", "achievements", "site", "join", "faqs", "resources", "home"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  events: "Events",
  team: "Team",
  achievements: "Milestones",
  site: "Site settings",
  join: "Join page",
  faqs: "FAQs",
  resources: "Resources",
  home: "Home page",
};

/** The repository file each section is built into (and the starting copy used before the database has content). */
export const SECTION_FILES: Record<SectionKey, string> = {
  events: "src/data/events.json",
  team: "src/data/team.json",
  achievements: "src/data/achievements.json",
  site: "src/data/site.json",
  join: "src/data/join.json",
  faqs: "src/data/faqs.json",
  resources: "src/data/resources.json",
  home: "src/data/home.json",
};

export const isSectionKey = (v: unknown): v is SectionKey => typeof v === "string" && (SECTION_KEYS as readonly string[]).includes(v);

/* ---------- Images ---------- */

/** Folders under public/images that the admin manages. Logos (public/brand) stay in the code. */
export const IMAGE_FOLDERS = ["team", "events", "achievements"] as const;
export type ImageFolder = (typeof IMAGE_FOLDERS)[number];
export const isImageFolder = (v: unknown): v is ImageFolder => typeof v === "string" && (IMAGE_FOLDERS as readonly string[]).includes(v);

/** The section whose content uses each image folder. */
export const IMAGE_FOLDER_SECTION: Record<ImageFolder, SectionKey> = { team: "team", events: "events", achievements: "achievements" };

export const IMAGE_TYPES = ["image/webp", "image/jpeg"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
export const IMAGE_EXTENSION: Record<ImageType, "webp" | "jpg"> = { "image/webp": "webp", "image/jpeg": "jpg" };
export const isImageType = (v: unknown): v is ImageType => typeof v === "string" && (IMAGE_TYPES as readonly string[]).includes(v);

/**
 * The address stored in content for an image, exactly as visitors load it: /images/<folder>/<lowercase-dash-name>.<webp|jpg>.
 * No query string. The build writes the file to public/images/... so Vercel serves it.
 */
export const IMAGE_PATH_RE = /^\/images\/(team|events|achievements)\/[a-z0-9]+(?:-[a-z0-9]+)*\.(webp|jpg)$/;
export const isImagePath = (v: unknown): v is string => typeof v === "string" && IMAGE_PATH_RE.test(v);

/** A SHA-256 as 64 lowercase hex characters (the image id used by the API). */
export const SHA256_RE = /^[0-9a-f]{64}$/;
