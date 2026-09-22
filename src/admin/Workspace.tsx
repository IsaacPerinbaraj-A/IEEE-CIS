import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen, CalendarDays, ExternalLink, HelpCircle, History, Home, KeyRound, LayoutDashboard, LogOut, Settings, Trophy, UploadCloud, UserCog, UserPlus, Users,
} from "lucide-react";
import {
  LIMITS, type ContentResponse, type ImageUploadResponse, type PresenceEntry, type PresenceRequest, type PresenceResponse, type PublishResponse, type SessionResponse,
} from "../../shared/api.ts";
import type { PartialContent } from "../../shared/content.ts";
import { SECTION_LABELS, isImageType, isSectionKey, type ImageFolder, type SectionKey } from "../../shared/sections.ts";
import { ApiError, api, errorText, paths, setReauthHandler, subscribeWaking } from "./api";
import { AdminContext, type AdminStore, type LastPublish, type LiveInfo, type Me } from "./context";
import {
  dirtyKeys, emptyContent, fresh, published, readSaved, rebase, restoreSaved, savedSections, toSaved, writeSaved, type DraftState, type Prefer, type SavedDraft,
} from "./draft";
import { ago, names } from "./format";
import { clone, slugify, type Content, type ContentKey } from "./model";
import { SignInDialog } from "./Login";
import { ChangePassphraseDialog } from "./Passphrase";
import { StatusScreen, type BootState } from "./Screens";
import { Modal, Notice, PageTitle, Spinner } from "./ui";
import Dashboard from "./sections/Dashboard";
import HomeEditor from "./sections/HomeEditor";
import EventsEditor from "./sections/EventsEditor";
import TeamEditor from "./sections/TeamEditor";
import AchievementsEditor from "./sections/AchievementsEditor";
import SiteEditor from "./sections/SiteEditor";
import JoinEditor from "./sections/JoinEditor";
import FaqEditor from "./sections/FaqEditor";
import ResourcesEditor from "./sections/ResourcesEditor";
import PublishPanel from "./sections/PublishPanel";
import HistoryPage from "./sections/HistoryPage";
import AccountsPage from "./sections/AccountsPage";
import { RecMark } from "../components/Brand";

type NavItem = { to: string; label: string; Icon: typeof LayoutDashboard; end?: boolean; section?: SectionKey };
const NAV: NavItem[] = [
  { to: "/admin", label: "Dashboard", Icon: LayoutDashboard, end: true },
  { to: "/admin/home", label: "Home page", Icon: Home, section: "home" },
  { to: "/admin/events", label: "Events", Icon: CalendarDays, section: "events" },
  { to: "/admin/team", label: "Team", Icon: Users, section: "team" },
  { to: "/admin/achievements", label: "Achievements", Icon: Trophy, section: "achievements" },
  { to: "/admin/site", label: "Site settings", Icon: Settings, section: "site" },
  { to: "/admin/join", label: "Join page", Icon: UserPlus, section: "join" },
  { to: "/admin/faqs", label: "FAQs", Icon: HelpCircle, section: "faqs" },
  { to: "/admin/resources", label: "Resources", Icon: BookOpen, section: "resources" },
];

/** The section open at this address (/admin/events → events), or null. */
const sectionAt = (pathname: string): SectionKey | null => {
  const seg = pathname.split("/")[2] ?? "";
  return isSectionKey(seg) ? seg : null;
};

type Restore = { state: DraftState; saved: SavedDraft; sections: SectionKey[] };

/** The signed-in admin: loads the content, keeps the draft (and a copy on this device), and lays out the pages. */
export default function Workspace({ session, onSession, onSignedOut }: { session: SessionResponse; onSession: (s: SessionResponse) => void; onSignedOut: () => void }) {
  const me: Me = useMemo(() => ({ id: session.user.id, username: session.user.username, name: session.user.displayName, role: session.user.role }), [session.user]);
  const navigate = useNavigate(), location = useLocation();
  const section = sectionAt(location.pathname);

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [live, setLive] = useState<LiveInfo>({ release: 0, publishedAt: null, publishedBy: null });
  const [initialised, setInitialised] = useState(false);
  const [loadState, setLoadState] = useState<BootState | null>({ kind: "loading", text: "Loading the latest content…" });
  const [loadRound, setLoadRound] = useState(0);
  const [restore, setRestore] = useState<Restore | null>(null);
  /** Image path → image id (sha256), for previews of images the site doesn't serve yet. */
  const [ids, setIds] = useState<Record<string, string>>({});
  const [livePaths, setLivePaths] = useState<ReadonlySet<string>>(new Set());
  /** Images uploaded from this device (kept with the saved draft). */
  const [uploads, setUploads] = useState<Record<string, string>>({});
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({});
  const [storageOk, setStorageOk] = useState(true);
  const [lastPublish, setLastPublish] = useState<LastPublish | null>(null);
  const [others, setOthers] = useState<PresenceEntry[]>([]);
  const [reauth, setReauth] = useState(false);
  const [changingPass, setChangingPass] = useState(false);
  const [waking, setWaking] = useState(false);
  const reauthWaiters = useRef<{ resolve: () => void; reject: (e: unknown) => void }[]>([]);

  /* ---------- Session ended: sign in again without losing anything ---------- */

  useEffect(() => {
    const waiters = reauthWaiters.current;
    setReauthHandler(() => new Promise<void>((resolve, reject) => { waiters.push({ resolve, reject }); setReauth(true); }));
    return () => { setReauthHandler(null); waiters.splice(0).forEach(w => w.reject(new Error("Signed out"))); };
  }, []);
  const reauthed = (s: SessionResponse) => {
    onSession(s);
    setReauth(false);
    reauthWaiters.current.splice(0).forEach(w => w.resolve());
  };

  useEffect(() => subscribeWaking(setWaking), []);

  /* ---------- Content ---------- */

  const applyContent = useCallback((res: ContentResponse, mode: "first" | Prefer) => {
    setLive({ release: res.release, publishedAt: res.publishedAt, publishedBy: res.publishedBy });
    setIds(prev => ({ ...prev, ...res.images }));
    setLivePaths(new Set(Object.keys(res.images)));
    if (!res.sections || res.release === 0) {
      setInitialised(false);
      setDraft({ baseRelease: 0, base: emptyContent(), content: emptyContent() });
      return;
    }
    setInitialised(true);
    const latest = { release: res.release, sections: res.sections };
    if (mode !== "first") { setDraft(prev => (prev ? rebase(prev, latest, mode).state : fresh(latest))); return; }
    setDraft(fresh(latest));
    const saved = readSaved(me.id);
    const restored = saved && restoreSaved(saved, latest);
    if (saved && restored) setRestore({ state: restored, saved, sections: savedSections(saved, latest) });
    else if (saved) writeSaved(me.id, null);   // everything in it is live already
  }, [me.id]);

  useEffect(() => {
    const ctrl = new AbortController();
    api<ContentResponse>(paths.content, { signal: ctrl.signal })
      .then(res => { applyContent(res, "first"); setLoadState(null); })
      .catch(e => {
        if (ctrl.signal.aborted) return;
        setLoadState(e instanceof ApiError && e.code === "db_unavailable" ? { kind: "db_down" } : { kind: "error", text: `Couldn't load the site content. ${errorText(e)}` });
      });
    return () => ctrl.abort();
  }, [applyContent, loadRound]);

  const reloadContent = useCallback(async (prefer: Prefer = "keep") => {
    applyContent(await api<ContentResponse>(paths.content), prefer);
  }, [applyContent]);

  const afterPublish = useCallback(async (res: PublishResponse, sent: PartialContent) => {
    setDraft(prev => prev && published(prev, sent, res.sections));
    setLive({ release: res.release, publishedAt: res.publishedAt, publishedBy: me.name });
    setLastPublish({ release: res.release, deploy: res.deploy, merged: res.merged, summaries: res.summaries });
    try { await reloadContent(); } catch { /* what was published is already in the draft */ }
  }, [me.name, reloadContent]);

  const update = useCallback(<K extends ContentKey>(key: K, value: Content[K]) => {
    setDraft(d => d && { ...d, content: { ...d.content, [key]: value } });
  }, []);

  const dirty = useMemo(() => (draft && initialised ? dirtyKeys(draft) : []), [draft, initialised]);

  /* ---------- Images ---------- */

  const urlsRef = useRef(localUrls);
  useEffect(() => { urlsRef.current = localUrls; });
  useEffect(() => () => Object.values(urlsRef.current).forEach(u => URL.revokeObjectURL(u)), []);

  const addImage = useCallback(async (folder: ImageFolder, baseName: string, blob: Blob) => {
    if (!isImageType(blob.type)) throw new Error("Couldn't process this image. Try a JPG, PNG or WebP.");
    if (blob.size > LIMITS.imageBytes) throw new Error("This image is still over 1 MB after compressing. Try a smaller one.");
    let r: ImageUploadResponse;
    try {
      // The server names the file after this (letters and numbers only), so fall back to the folder for names like "Ω"
      r = await api<ImageUploadResponse>(paths.uploadImage(folder, slugify(baseName) || folder), { method: "POST", raw: blob, contentType: blob.type });
    } catch (e) {
      if (e instanceof ApiError && e.status === 413) throw new Error("This image is too large to upload. Try a smaller one.");
      throw new Error(`Couldn't upload the image. ${errorText(e)}`);
    }
    setIds(p => ({ ...p, [r.path]: r.id }));
    setUploads(p => ({ ...p, [r.path]: r.id }));
    setLocalUrls(p => (p[r.path] ? p : { ...p, [r.path]: URL.createObjectURL(blob) }));
    return r.path;
  }, []);

  const preview = useCallback((src?: string) => {
    if (!src) return undefined;
    if (localUrls[src]) return localUrls[src];
    const id = ids[src];
    // New images aren't on the site until the rebuild, so they come from the admin server (always, during local development)
    if (id && (import.meta.env.DEV || !livePaths.has(src))) return paths.image(id);
    return src;
  }, [ids, livePaths, localUrls]);

  /* ---------- Kept on this device until published ---------- */

  const latestRef = useRef({ draft, uploads, paused: true });
  useEffect(() => { latestRef.current = { draft, uploads, paused: !!restore || !initialised || !draft }; });
  const saveNow = useCallback(() => {
    const { draft: d, uploads: u, paused } = latestRef.current;
    if (paused || !d) return;
    setStorageOk(writeSaved(me.id, toSaved(d, me.id, u)));
  }, [me.id]);
  useEffect(() => { const t = setTimeout(saveNow, 400); return () => clearTimeout(t); }, [draft, uploads, restore, saveNow]);
  useEffect(() => {
    window.addEventListener("pagehide", saveNow);
    return () => window.removeEventListener("pagehide", saveNow);
  }, [saveNow]);
  // Only when this browser can't keep a copy: warn before closing the tab with unpublished work
  useEffect(() => {
    if (storageOk || !dirty.length) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [storageOk, dirty.length]);

  const applyRestore = () => {
    if (!restore) return;
    setDraft(restore.state);
    setIds(p => ({ ...restore.saved.images, ...p }));
    setUploads(restore.saved.images);
    setRestore(null);
  };
  const dropRestore = () => { writeSaved(me.id, null); setRestore(null); };

  const discard = useCallback(() => {
    setDraft(d => d && { ...d, content: clone(d.base) });
    writeSaved(me.id, null);
    navigate("/admin");
    reloadContent().catch(() => { /* stays on the content it had */ });
  }, [me.id, navigate, reloadContent]);

  /* ---------- Who's editing ---------- */

  const lastActive = useRef(0);
  useEffect(() => {
    lastActive.current = Date.now();
    const mark = () => { lastActive.current = Date.now(); };
    const events = ["pointerdown", "keydown", "input", "wheel", "touchstart"] as const;
    events.forEach(ev => window.addEventListener(ev, mark, { passive: true }));
    return () => events.forEach(ev => window.removeEventListener(ev, mark));
  }, []);
  useEffect(() => {
    if (!initialised) return;
    let stopped = false, busy = false;
    const beat = async () => {
      // Only while someone is actually working here, so an unattended admin still signs out after the idle time
      if (busy || document.visibilityState !== "visible") return;
      if (Date.now() - lastActive.current > 5 * 60_000) { setOthers([]); return; }
      busy = true;
      try {
        const body: PresenceRequest = { section };
        const r = await api<PresenceResponse>(paths.presence, { method: "POST", body });
        if (!stopped) setOthers(r.editors.filter(e => e.userId !== me.id));
      } catch { /* best effort */ } finally { busy = false; }
    };
    beat();
    const timer = setInterval(beat, LIMITS.presenceHeartbeatSeconds * 1000);
    const onVisible = () => { if (document.visibilityState === "visible") beat(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [section, initialised, me.id]);

  /* ---------- Signing out ---------- */

  const signOut = useCallback(async () => {
    saveNow();
    setReauthHandler(null);
    reauthWaiters.current.splice(0).forEach(w => w.reject(new Error("Signed out")));
    try { await api(paths.logout, { method: "POST", noReauth: true }); } catch { /* signed out here anyway */ }
    onSignedOut();
  }, [onSignedOut, saveNow]);
  const askSignOut = () => {
    if (dirty.length && !confirm(storageOk
      ? "Sign out? Your unpublished changes stay saved on this device for the next time you sign in."
      : "This browser can't keep your unpublished changes. Sign out and lose them?")) return;
    signOut();
  };

  if (loadState) return <StatusScreen state={loadState} onRetry={() => { setLoadState({ kind: "loading", text: "Loading the latest content…" }); setLoadRound(r => r + 1); }} />;
  if (!draft) return <StatusScreen state={{ kind: "loading", text: "Loading the latest content…" }} />;

  const store: AdminStore = {
    me, owner: session.owner, content: draft.content, base: draft.base, baseRelease: draft.baseRelease, live, initialised,
    update, addImage, preview, dirty, discard, reloadContent, afterPublish, lastPublish, clearLastPublish: () => setLastPublish(null),
    others, changePassphrase: () => setChangingPass(true), signOut: askSignOut,
  };
  const editingHere = section ? others.filter(e => e.section === section) : [];
  const ready = (el: ReactElement) => (initialised ? el : <NotReady owner={me.role === "owner"} />);
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-[44px] shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] transition-colors ${isActive ? "bg-raised text-cream" : "text-mute hover:bg-panel hover:text-cream"}`;

  return (
    <AdminContext.Provider value={store}>
      <div className="min-h-screen bg-ink pb-24">
        <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
            <Link to="/admin" className="flex min-w-0 items-center gap-3"><RecMark /><span className="min-w-0 leading-tight"><span className="block font-display text-[15px] font-semibold">CIS REC admin</span>
              <span className="block max-w-[46vw] truncate text-[12.5px] text-mute">Signed in as {me.name}{me.role === "owner" ? " (web lead)" : ""}</span></span></Link>
            <div className="ml-auto flex items-center gap-2">
              <a href="/" target="_blank" rel="noopener" className="btn-ghost btn-sm max-sm:hidden"><ExternalLink size={15} /> View site</a>
              <button className="btn-ghost btn-sm min-h-[44px] sm:min-h-[38px]" onClick={() => setChangingPass(true)} title="Change your passphrase"><KeyRound size={15} /><span className="max-sm:sr-only">Passphrase</span></button>
              <button className="btn-ghost btn-sm min-h-[44px] sm:min-h-[38px]" onClick={askSignOut}><LogOut size={15} /><span className="max-sm:sr-only">Sign out</span></button>
            </div>
          </div>
        </header>

        {waking && (
          <div role="status" className="sticky top-16 z-30 flex items-center justify-center gap-2 border-b border-line bg-panel px-4 py-2 text-[14px] text-mute">
            <Spinner size={15} className="text-violet-soft" /> Waking the server (up to a minute)…
          </div>
        )}

        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-10">
          <nav aria-label="Admin sections" className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4 py-2 lg:sticky lg:top-24 lg:z-30 lg:mx-0 lg:mb-0 lg:mt-8 lg:flex-col lg:self-start lg:border-0 lg:p-0">
            {NAV.map(({ to, label, Icon, end, section: key }) => {
              const here = key ? others.filter(e => e.section === key) : [];
              return (
                <NavLink key={to} to={to} end={end} className={linkCls}>
                  <Icon size={18} />{label}
                  {here.length > 0 && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-violet-soft" title={`${names(here.map(e => e.name))} editing`}><span className="sr-only">{names(here.map(e => e.name))} editing</span></span>}
                  {key && dirty.includes(key) && <span className={`${here.length ? "" : "ml-auto"} h-2 w-2 shrink-0 rounded-full bg-gold`} title="Unpublished changes"><span className="sr-only">Unpublished changes</span></span>}
                </NavLink>
              );
            })}
            <NavLink to="/admin/publish" className={({ isActive }) => `${linkCls({ isActive })} lg:mt-3`}>
              <UploadCloud size={18} />Publish{dirty.length > 0 && <span className="ml-auto rounded-full bg-gold px-2 text-[13px] font-semibold text-ink">{dirty.length}</span>}
            </NavLink>
            <NavLink to="/admin/history" className={linkCls}><History size={18} />History</NavLink>
            {me.role === "owner" && <NavLink to="/admin/accounts" className={linkCls}><UserCog size={18} />Accounts</NavLink>}
          </nav>
          <main className="min-w-0 lg:pt-8">
            {editingHere.length > 0 && section && (
              <Notice tone="info" className="mb-6">
                {names(editingHere.map(e => e.name))} {editingHere.length === 1 ? "is" : "are"} also editing {SECTION_LABELS[section]}. Changes to different items are combined when you publish; if you both change the same item, you choose which to keep.
              </Notice>
            )}
            <Routes>
              <Route index element={<Dashboard />} />
              <Route path="home" element={ready(<HomeEditor />)} />
              <Route path="events" element={ready(<EventsEditor />)} />
              <Route path="team" element={ready(<TeamEditor />)} />
              <Route path="achievements" element={ready(<AchievementsEditor />)} />
              <Route path="site" element={ready(<SiteEditor />)} />
              <Route path="join" element={ready(<JoinEditor />)} />
              <Route path="faqs" element={ready(<FaqEditor />)} />
              <Route path="resources" element={ready(<ResourcesEditor />)} />
              <Route path="publish" element={ready(<PublishPanel />)} />
              <Route path="history" element={<HistoryPage />} />
              {me.role === "owner" && <Route path="accounts" element={<AccountsPage />} />}
              <Route path="*" element={<Dashboard />} />
            </Routes>
          </main>
        </div>

        {dirty.length > 0 && !location.pathname.startsWith("/admin/publish") && (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/40 bg-panel/95 backdrop-blur-md">
            <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gold shadow-[0_0_12px_#F2B544]" />
              <p className="min-w-0 flex-1 text-[15px]">
                Unpublished changes in {dirty.length} {dirty.length === 1 ? "section" : "sections"}
                <span className="block text-[13px] text-mute">{storageOk ? "Saved on this device until you publish" : "This browser can't keep a copy, so publish before closing the tab"}</span>
              </p>
              <Link to="/admin/publish" className="btn-gold btn-sm min-h-[44px] sm:min-h-[38px]">Review and publish</Link>
            </div>
          </div>
        )}
      </div>

      {restore && (
        <Modal title="Restore your unsaved changes?" onClose={() => {}} dismissible={false}
          footer={<><button className="btn-ghost" onClick={dropRestore}>Discard them</button><button className="btn-gold" onClick={applyRestore}>Restore</button></>}>
          <p className="text-[15px]">This device has changes you didn't publish{restore.saved.savedAt ? `, last saved ${ago(restore.saved.savedAt)}` : ""}:</p>
          <ul className="mt-3 list-disc pl-5 text-[15px] text-mute">{restore.sections.map(k => <li key={k}>{SECTION_LABELS[k]}</li>)}</ul>
          {restore.saved.baseRelease < live.release && (
            <p className="mt-3 text-[15px] text-mute">The site has been published since you made them (now release #{live.release}). Your changes will be combined with the newer content, and you'll be asked if you both changed the same item.</p>
          )}
        </Modal>
      )}
      {changingPass && <ChangePassphraseDialog username={me.username} displayName={me.name} onClose={() => setChangingPass(false)} />}
      {reauth && <SignInDialog username={me.username} onSignedIn={reauthed} onSignOut={signOut} />}
    </AdminContext.Provider>
  );
}

function NotReady({ owner }: { owner: boolean }) {
  return (
    <>
      <PageTitle title="Nothing is published yet" />
      <div className="adm-card text-[15px] text-mute">
        {owner
          ? <>The database is empty. Open <Link to="/admin/accounts" className="link">Accounts</Link> and choose Import starting content to load the site's current content as release #1.</>
          : "The database is empty. Ask the web lead to import the starting content, then reload this page."}
      </div>
    </>
  );
}
