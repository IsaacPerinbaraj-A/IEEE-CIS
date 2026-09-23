import { createElement, lazy, type ComponentType, type FunctionComponent } from "react";
import { matchRoutes } from "react-router-dom";
import { PAGE_ROUTES, type PageName } from "./routeTable";

type PageModule = { default: ComponentType };

/** One loader per page named in routeTable.ts (TypeScript reports a page without one). Home is not here: it ships in the main bundle. */
const loaders: Record<PageName, () => Promise<PageModule>> = {
  Events: () => import("../pages/Events"),
  EventDetail: () => import("../pages/EventDetail"),
  Team: () => import("../pages/Team"),
  About: () => import("../pages/About"),
  Achievements: () => import("../pages/Achievements"),
  Resources: () => import("../pages/Resources"),
  Join: () => import("../pages/Join"),
  Contact: () => import("../pages/Contact"),
  NotFound: () => import("../pages/NotFound"),
};

export type LazyPage = {
  /** Renders the page. Suspends (shows the Suspense fallback) only while its code is still downloading. */
  Page: ComponentType;
  /** Starts downloading the page's code (once) and resolves when the page can render. */
  preload: () => Promise<unknown>;
  /** True once the code is here, so the page renders straight away. */
  ready: () => boolean;
};

function lazyPage(name: PageName): LazyPage {
  let Loaded: ComponentType | undefined;
  let pending: Promise<ComponentType> | undefined;
  const preload = (): Promise<ComponentType> => (pending ??= loaders[name]().then(
    m => (Loaded = m.default),
    // A failed download (offline, or the site was just redeployed) is tried again next time the page is opened
    err => { pending = undefined; Lazy = makeLazy(); throw err; },
  ));
  const makeLazy = () => lazy(() => preload().then(C => ({ default: C })));
  let Lazy = makeLazy();
  // With the code already here, render the page itself: React.lazy would still show the fallback for a moment,
  // and a page transition would capture that empty frame
  const Page: FunctionComponent = () => createElement(Loaded ?? Lazy);
  Page.displayName = name;
  return { Page, preload, ready: () => !!Loaded };
}

const pages = new Map<PageName, LazyPage>();
const pageNamed = (name: PageName) => {
  let page = pages.get(name);
  if (!page) pages.set(name, (page = lazyPage(name)));
  return page;
};

/** Every route except Home, with its page (App.tsx turns these into <Route>s). */
export const pageRoutes = PAGE_ROUTES.map(([path, name]) => ({ path, page: pageNamed(name) }));

// Home and the admin have nothing to load here; matchRoutes ranks the paths exactly like the router does
const matchTable = [{ path: "/" }, { path: "admin/*" }, ...pageRoutes];

/** The lazily loaded page that a URL path opens, or null for Home and the admin. */
export function pageAt(pathname: string): LazyPage | null {
  const route = matchRoutes(matchTable, pathname)?.[0]?.route;
  return route && "page" in route ? route.page : null;
}

/** Starts downloading the code of the page at `pathname`. Null when there is nothing to load (Home, the admin). */
export function preloadRoute(pathname: string) {
  return pageAt(pathname)?.preload() ?? null;
}

/** Hovering, touching or focusing a link to another page of the site starts downloading that page's code. */
let lastHref = "";
function onIntent(e: Event) {
  const a = (e.target as Element | null)?.closest?.("a[href]");
  if (!(a instanceof HTMLAnchorElement) || a.href === lastHref) return;
  lastHref = a.href;
  if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return;
  const url = new URL(a.href, window.location.href);
  if (url.origin === window.location.origin) preloadRoute(url.pathname)?.catch(() => {});
}

const whenIdle = (cb: () => void) => {
  if ("requestIdleCallback" in window) window.requestIdleCallback(cb, { timeout: 3000 });
  else setTimeout(cb, 400);
};

/** Runs `cb` once the Home intro is over (right away on other pages), so downloads never compete with it. */
function afterIntro(cb: () => void) {
  const playing = () => document.body.dataset.intro === "on" || document.body.dataset.intro === "leaving";
  if (!playing()) { cb(); return; }
  const mo = new MutationObserver(() => { if (!playing()) { mo.disconnect(); cb(); } });
  mo.observe(document.body, { attributes: true, attributeFilter: ["data-intro"] });
}

/**
 * Link intent preloading, plus every page's code in idle time after the first page has loaded (one page at a time,
 * after the Home intro), so moving around the site never waits for a download. Skipped with data saver or on 2G.
 */
export function startRoutePreloading() {
  document.addEventListener("pointerover", onIntent, { passive: true });
  document.addEventListener("touchstart", onIntent, { passive: true });
  document.addEventListener("focusin", onIntent);

  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || /2g/.test(connection?.effectiveType ?? "")) return;
  const queue = [...new Set(pageRoutes.map(r => r.page))];
  const next = () => {
    const page = queue.shift();
    if (page) page.preload().catch(() => {}).finally(() => whenIdle(next));
  };
  const begin = () => setTimeout(() => afterIntro(() => whenIdle(next)), 1000);
  if (document.readyState === "complete") begin();
  else window.addEventListener("load", begin, { once: true });
}
