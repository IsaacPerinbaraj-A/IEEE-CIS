import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { BookOpen, CalendarDays, ExternalLink, HelpCircle, LayoutDashboard, LogOut, Settings, Trophy, UploadCloud, UserPlus, Users } from "lucide-react";
import { AdminContext, type AdminStore, type PendingImage } from "./context";
import { githubBackend, type Backend } from "./backend";
import { FILES, bundled, clone, serialize, slugify, type Content, type ContentKey } from "./model";
import { extFor } from "./image";
import Login from "./Login";
import { forgetToken, savedGitHub } from "./session";
import Dashboard from "./sections/Dashboard";
import EventsEditor from "./sections/EventsEditor";
import TeamEditor from "./sections/TeamEditor";
import SiteEditor from "./sections/SiteEditor";
import FaqEditor from "./sections/FaqEditor";
import JoinEditor from "./sections/JoinEditor";
import ResourcesEditor from "./sections/ResourcesEditor";
import AchievementsEditor from "./sections/AchievementsEditor";
import PublishPanel from "./sections/PublishPanel";
import { RecMark } from "../components/Brand";

const KEYS = Object.keys(FILES) as ContentKey[];
const NAV = [
  { to: "/admin", label: "Dashboard", Icon: LayoutDashboard, end: true },
  { to: "/admin/events", label: "Events", Icon: CalendarDays },
  { to: "/admin/team", label: "Team", Icon: Users },
  { to: "/admin/achievements", label: "Achievements", Icon: Trophy },
  { to: "/admin/site", label: "Site settings", Icon: Settings },
  { to: "/admin/join", label: "Join page", Icon: UserPlus },
  { to: "/admin/faqs", label: "FAQs", Icon: HelpCircle },
  { to: "/admin/resources", label: "Resources", Icon: BookOpen },
];

export default function AdminApp() {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [who, setWho] = useState<string>();
  const [data, setData] = useState<{ content: Content; original: Record<ContentKey, string> } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [autoTried, setAutoTried] = useState(false);

  // Keep the admin out of search results and away from the landing intro
  useEffect(() => {
    const meta = document.createElement("meta"); meta.name = "robots"; meta.content = "noindex, nofollow"; document.head.appendChild(meta);
    document.title = "Admin | IEEE CIS REC"; document.body.dataset.intro = "done";
    return () => meta.remove();
  }, []);

  // Sign back in automatically if this browser still has a token
  useEffect(() => {
    const saved = savedGitHub();
    if (!saved) { setAutoTried(true); return; }
    const gh = githubBackend(saved);
    gh.verify().then(r => { if (r.canPush) { setBackend(gh); setWho(r.login); } else forgetToken(); }).catch(() => forgetToken()).finally(() => setAutoTried(true));
  }, []);

  // Load the latest content from wherever we're connected
  useEffect(() => {
    if (!backend) return;
    let cancelled = false;
    (async () => {
      try {
        const content = clone(bundled), original = {} as Record<ContentKey, string>;
        for (const k of KEYS) {
          const text = await backend.read(FILES[k]);
          if (text !== null) (content as Record<ContentKey, unknown>)[k] = JSON.parse(text);
          original[k] = serialize(content[k]);
        }
        if (!cancelled) setData({ content, original });
      } catch (e) { if (!cancelled) setLoadError((e as Error).message); }
    })();
    return () => { cancelled = true; };
  }, [backend]);

  if (!backend) return autoTried ? <Login onConnect={(b, w) => { setBackend(b); setWho(w); }} /> : <Loading text="Checking your sign-in…" />;
  if (loadError) return <Loading text={`Couldn't load the site content: ${loadError}`} error onRetry={() => location.reload()} />;
  if (!data) return <Loading text="Loading the latest content…" />;
  return <Workspace backend={backend} who={who} initial={data} onSignOut={() => { forgetToken(); setBackend(null); setData(null); }} />;
}

function Loading({ text, error, onRetry }: { text: string; error?: boolean; onRetry?: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-ink px-6 text-center">
      <div><p className={error ? "text-[#FCA5A5]" : "text-mute"} role={error ? "alert" : "status"}>{text}</p>
        {onRetry && <button className="btn-ghost mt-5" onClick={onRetry}>Try again</button>}</div>
    </div>
  );
}

function Workspace({ backend, who, initial, onSignOut }: { backend: Backend; who?: string; initial: { content: Content; original: Record<ContentKey, string> }; onSignOut: () => void }) {
  const [content, setContent] = useState(initial.content);
  const [original, setOriginal] = useState(initial.original);
  const [images, setImages] = useState<Record<string, PendingImage>>({});
  const navigate = useNavigate();

  const dirty = useMemo(() => KEYS.filter(k => serialize(content[k]) !== original[k]), [content, original]);
  const pending = dirty.length + Object.keys(images).length;

  // Warn before closing the tab with unpublished work
  useEffect(() => {
    if (!pending) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  const update = useCallback(<K extends ContentKey>(key: K, value: Content[K]) => setContent(c => ({ ...c, [key]: value })), []);
  const addImage = useCallback((folder: "team" | "events" | "achievements", baseName: string, blob: Blob) => {
    const file = `${slugify(baseName) || folder}.${extFor(blob)}`, path = `public/images/${folder}/${file}`;
    setImages(prev => { if (prev[path]) URL.revokeObjectURL(prev[path].url); return { ...prev, [path]: { path, blob, url: URL.createObjectURL(blob) } }; });
    return `/images/${folder}/${file}?v=${Date.now().toString(36)}`;
  }, []);
  const preview = useCallback((src?: string) => (src ? images[`public${src.split("?")[0]}`]?.url ?? src : undefined), [images]);

  const store: AdminStore = {
    backend, content, original, images, update, addImage, preview, dirty,
    discard: () => { setContent(clone(Object.fromEntries(KEYS.map(k => [k, JSON.parse(original[k])])) as Content)); setImages({}); navigate("/admin"); },
    afterPublish: () => { setOriginal(Object.fromEntries(KEYS.map(k => [k, serialize(content[k])])) as Record<ContentKey, string>); setImages({}); },
    signOut: onSignOut,
  };

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] transition-colors ${isActive ? "bg-raised text-cream" : "text-mute hover:bg-panel hover:text-cream"}`;

  return (
    <AdminContext.Provider value={store}>
      <div className="min-h-screen bg-ink pb-24">
        <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
            <Link to="/admin" className="flex items-center gap-3"><RecMark /><span className="leading-tight"><span className="block font-display text-[15px] font-semibold">CIS REC admin</span>
              <span className="block max-w-[46vw] truncate text-[12.5px] text-mute">{backend.label}{who ? `, signed in as ${who}` : ""}</span></span></Link>
            <div className="ml-auto flex items-center gap-2">
              <a href="/" target="_blank" rel="noopener" className="btn-ghost btn-sm max-sm:hidden"><ExternalLink size={15} /> View site</a>
              <button className="btn-ghost btn-sm" onClick={() => { if (!pending || confirm("You have unpublished changes. Sign out anyway?")) onSignOut(); }}><LogOut size={15} /><span className="max-sm:sr-only">Sign out</span></button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-10">
          <nav aria-label="Admin sections" className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4 py-2 lg:sticky lg:top-24 lg:z-30 lg:mx-0 lg:mb-0 lg:mt-8 lg:flex-col lg:self-start lg:border-0 lg:p-0">
            {NAV.map(({ to, label, Icon, end }) => <NavLink key={to} to={to} end={end} className={linkCls}><Icon size={18} />{label}</NavLink>)}
            <NavLink to="/admin/publish" className={({ isActive }) => `${linkCls({ isActive })} lg:mt-3`}>
              <UploadCloud size={18} />Publish{pending > 0 && <span className="ml-auto rounded-full bg-gold px-2 text-[13px] font-semibold text-ink">{pending}</span>}
            </NavLink>
          </nav>
          <main className="min-w-0 lg:pt-8">
            <Routes>
              <Route index element={<Dashboard />} />
              <Route path="events" element={<EventsEditor />} />
              <Route path="team" element={<TeamEditor />} />
              <Route path="achievements" element={<AchievementsEditor />} />
              <Route path="site" element={<SiteEditor />} />
              <Route path="join" element={<JoinEditor />} />
              <Route path="faqs" element={<FaqEditor />} />
              <Route path="resources" element={<ResourcesEditor />} />
              <Route path="publish" element={<PublishPanel />} />
              <Route path="*" element={<Dashboard />} />
            </Routes>
          </main>
        </div>

        {pending > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/40 bg-panel/95 backdrop-blur-md">
            <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gold shadow-[0_0_12px_#F2B544]" />
              <p className="flex-1 text-[15px]">{pending} unpublished {pending === 1 ? "change" : "changes"}</p>
              <Link to="/admin/publish" className="btn-gold btn-sm">Review and publish</Link>
            </div>
          </div>
        )}
      </div>
    </AdminContext.Provider>
  );
}
