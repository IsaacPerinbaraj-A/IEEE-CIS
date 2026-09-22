/**
 * Every page except Home, as [path, file in src/pages]. Home ships with the main bundle (it is the landing page with
 * the intro); each page here is its own small download, fetched when it is first needed or earlier (src/lib/routes.ts).
 * App.tsx builds the routes from this list, and vite.config.ts uses it so a direct visit to a page (for example a
 * shared event link) downloads that page's code together with the main bundle. Add new pages here.
 * Plain data on purpose: vite.config.ts imports it too.
 */
export const PAGE_ROUTES = [
  ["events", "Events"],
  ["events/:slug", "EventDetail"],
  ["team", "Team"],
  ["about", "About"],
  ["achievements", "Achievements"],
  ["resources", "Resources"],
  ["join", "Join"],
  ["contact", "Contact"],
  ["*", "NotFound"],
] as const;

export type PageName = (typeof PAGE_ROUTES)[number][1];
