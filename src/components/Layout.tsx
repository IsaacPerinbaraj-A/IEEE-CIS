import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, X, Mail } from "lucide-react";
import { RecMark } from "./Brand";
import { Linkedin, Instagram } from "../lib/icons";
import { site, achievements } from "../lib/data";
import { ScrollProgress, CursorAura, BackToTop } from "./Motion";

const nav = [
  { to: "/events", label: "Events" },
  { to: "/team", label: "Team" },
  { to: "/about", label: "About" },
  ...(achievements.length ? [{ to: "/achievements", label: "Achievements" }] : []),
  { to: "/resources", label: "Resources" },
  { to: "/contact", label: "Contact" },
];

function Navbar() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3 py-2 text-[15px] transition-colors ${isActive ? "text-cream bg-raised" : "text-mute hover:text-cream"}`;

  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-ink/85 backdrop-blur-md">
      <div className="wrap flex h-[68px] items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-3" aria-label="IEEE CIS REC home">
          <RecMark />
          <span className="leading-tight">
            <span className="block font-display text-[15px] font-semibold tracking-tight">IEEE CIS REC</span>
            <span className="block text-[12.5px] text-mute">Rajalakshmi Engineering College</span>
          </span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {nav.map(n => <NavLink key={n.to} to={n.to} className={linkCls}>{n.label}</NavLink>)}
          <Link to="/join" className="btn-gold ml-3 min-h-[40px] px-5 text-[15px]">Join the chapter</Link>
        </nav>
        <button className="btn-ghost min-h-[42px] px-4 lg:hidden" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(o => !o)}>
          {open ? <X size={18} /> : <Menu size={18} />} {open ? "Close" : "Menu"}
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="fixed inset-x-0 bottom-0 top-[68px] overflow-y-auto border-t border-line bg-ink px-5 pb-10 pt-6 lg:hidden">
          <ul className="space-y-1">
            {[{ to: "/", label: "Home" }, ...nav].map(n => (
              <li key={n.to}>
                <NavLink to={n.to} end className={({ isActive }) => `block rounded-xl px-4 py-3 font-display text-xl ${isActive ? "bg-raised text-cream" : "text-mute"}`}>{n.label}</NavLink>
              </li>
            ))}
          </ul>
          <Link to="/join" className="btn-gold mt-6 w-full">Join the chapter</Link>
          <div className="mt-8 flex gap-3">
            <a className="btn-ghost px-4" href={`mailto:${site.email}`} aria-label="Email"><Mail size={18} /></a>
            <a className="btn-ghost px-4" href={site.linkedin} target="_blank" rel="noopener" aria-label="LinkedIn"><Linkedin size={18} /></a>
            <a className="btn-ghost px-4" href={site.instagram} target="_blank" rel="noopener" aria-label="Instagram"><Instagram size={18} /></a>
          </div>
        </nav>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-24 border-t border-line bg-panel">
      <div className="wrap grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3"><RecMark className="h-10 w-10" /><span className="font-display font-semibold">IEEE CIS REC</span></div>
          <p className="mt-4 max-w-[34ch] text-[15px] text-mute">{site.fullName}, {site.college}, {site.city}.</p>
        </div>
        <FooterCol title="Explore" links={[["Events", "/events"], ["Team", "/team"], ["About", "/about"], ["Resources", "/resources"]]} />
        <div>
          <h2 className="font-sans text-[15px] font-semibold">Connect</h2>
          <ul className="mt-4 space-y-3 text-[15px]">
            <li><a className="inline-flex items-center gap-2 text-mute hover:text-cream" href={`mailto:${site.email}`}><Mail size={16} /> Email</a></li>
            <li><a className="inline-flex items-center gap-2 text-mute hover:text-cream" href={site.linkedin} target="_blank" rel="noopener"><Linkedin size={16} /> LinkedIn</a></li>
            <li><a className="inline-flex items-center gap-2 text-mute hover:text-cream" href={site.instagram} target="_blank" rel="noopener"><Instagram size={16} /> Instagram</a></li>
          </ul>
        </div>
        <FooterCol title="IEEE" external links={[["IEEE", "https://www.ieee.org"], ["IEEE CIS", "https://cis.ieee.org"], ["IEEE Xplore", "https://ieeexplore.ieee.org"]]} />
      </div>
      <div className="border-t border-line">
        <p className="wrap py-5 text-[13.5px] text-mute">© {new Date().getFullYear()} IEEE CIS Student Chapter, Rajalakshmi Engineering College.</p>
      </div>
    </footer>
  );
}
function FooterCol({ title, links, external }: { title: string; links: [string, string][]; external?: boolean }) {
  return (
    <div>
      <h2 className="font-sans text-[15px] font-semibold">{title}</h2>
      <ul className="mt-4 space-y-3 text-[15px]">
        {links.map(([l, h]) => <li key={h}>{external
          ? <a className="text-mute hover:text-cream" href={h} target="_blank" rel="noopener">{l}</a>
          : <Link className="text-mute hover:text-cream" to={h}>{l}</Link>}</li>)}
      </ul>
    </div>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-gold focus:px-4 focus:py-2 focus:text-ink">Skip to content</a>
      <ScrollProgress />
      <Navbar />
      <main id="main" className="flex-1">
        {/* Each page (except the landing page, which has its own intro) rises in when opened */}
        <div key={pathname} className={pathname === "/" ? "" : "page-enter"}><Outlet /></div>
      </main>
      <Footer />
      <BackToTop />
      <CursorAura />
    </div>
  );
}
