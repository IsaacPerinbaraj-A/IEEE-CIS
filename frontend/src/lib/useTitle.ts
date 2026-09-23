import { useEffect } from "react";
import { site } from "./data";

const HOME_TITLE = `${site.name} | Computational Intelligence Society, ${site.college}`;
let defaultDescription: string | null = null;

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.append(el); }
  el.content = content;
}

/**
 * Sets the tab title plus the description and share tags for the current page (idea from the second version's
 * useDocumentMeta), so search results and WhatsApp/LinkedIn previews describe the page you're on.
 * `noindex` asks search engines not to list the page (used for "page not found").
 */
export function useTitle(title?: string, description?: string, noindex = false) {
  useEffect(() => {
    if (defaultDescription === null) defaultDescription = document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? "";
    const fullTitle = title ? `${title} | ${site.name}` : HOME_TITLE;
    const desc = description || defaultDescription;
    document.title = fullTitle;
    setMeta("name", "description", desc);
    setMeta("property", "og:title", title ? fullTitle : site.name);
    setMeta("property", "og:description", desc);
    setMeta("name", "twitter:title", title ? fullTitle : site.name);
    setMeta("name", "twitter:description", desc);
    if (!noindex) return;
    setMeta("name", "robots", "noindex");
    return () => document.head.querySelector('meta[name="robots"]')?.remove();
  }, [title, description, noindex]);
}
