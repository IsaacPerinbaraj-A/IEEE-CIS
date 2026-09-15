import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, X, Mail, ArrowRight } from "lucide-react";
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

const DESKTOP_NAV = "(min-width: 1024px)"; // same breakpoint as Tailwind's lg, where the full nav shows

function Navbar() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => setOpen(false), [pathname]);

  // While the menu is open: lock page scroll, make the page behind it inert, and close on Escape
  // or when the window grows wide enough for the desktop nav
  useEffect(() => {
    if (!open) return;
    const behind = document.querySelectorAll("#main, footer, .back-to-top, .skip-link");
    behind.forEach(el => el.setAttribute("inert", ""));
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    };
    const wide = window.matchMedia(DESKTOP_NAV);
    const onWide = () => { if (wide.matches) setOpen(false); };
    window.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      behind.forEach(el => el.removeAttribute("inert"));
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3 py-2 text-[15px] transition-colors ${isActive ? "text-cream bg-raised" : "text-mute hover:text-cream"}`;
  const menuItems = [{ to: "/", label: "Home" }, ...nav];
  // Links close the menu. If the link is the page you're already on, nothing navigates, so put focus back on the toggle
  const closeFor = (to: string) => () => {
    if (open && to === pathname) toggle.current?.focus();
    setOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-line/70 bg-ink/85 backdrop-blur-md">
        <div className="wrap flex h-[68px] items-center justify-between gap-3">
          <Link to="/" onClick={closeFor("/")} className="flex min-w-0 items-center gap-3" aria-label={`${site.name} home`}>
            <RecMark />
            {/* Narrow phones get a one-line subtitle so the brand never wraps into three lines */}
            <span className="min-w-0 leading-tight">
              <span className="block font-display text-[15px] font-semibold tracking-tight">{site.name}</span>
              <span className="block text-[12.5px] text-mute min-[420px]:hidden">{site.city}</span>
              <span className="hidden text-[12.5px] text-mute min-[420px]:block">{site.college}</span>
            </span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            {nav.map(n => <NavLink key={n.to} to={n.to} className={linkCls}>{n.label}</NavLink>)}
            <Link to="/join" className="btn-gold ml-3 min-h-[40px] px-5 text-[15px]">Join the chapter</Link>
          </nav>
          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            <Link to="/join" onClick={closeFor("/join")} className="btn-gold hidden min-h-[44px] px-5 text-[15px] sm:inline-flex">Join the chapter</Link>
            <button ref={toggle} type="button" className="btn-ghost min-h-[44px] px-4" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(o => !o)}>
              {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />} {open ? "Close" : "Menu"}
            </button>
          </div>
        </div>
      </header>

      {/* Full-screen mobile menu. It sits outside <header> on purpose: the header's backdrop blur would
          otherwise become the containing block of this fixed panel and squash it to the header's height. */}
      <nav id="mobile-nav" aria-label="Main" data-open={open ? "1" : undefined}
        className="mnav fixed inset-0 z-[45] flex flex-col overflow-y-auto scroll-pt-[80px] bg-ink pt-[68px] lg:hidden">
        <div className="wrap my-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6">
          <ul>
            {menuItems.map((n, i) => (
              <li key={n.to} className="border-b border-line/70" style={{ "--i": i } as CSSProperties}>
                <NavLink to={n.to} end={n.to === "/"} onClick={closeFor(n.to)}
                  className={({ isActive }) => `group flex items-center py-1 transition-colors ${isActive ? "text-cream" : "text-mute hover:text-cream"}`}>
                  {({ isActive }) => (
                    <span className="flex flex-1 overflow-hidden py-2">
                      <span className="mnav-rise flex flex-1 items-center gap-4">
                        <span aria-hidden className={`w-7 text-[14px] tabular-nums ${isActive ? "text-gold" : "text-violet-soft"}`}>{String(i + 1).padStart(2, "0")}</span>
                        <span className="flex-1 font-display text-[clamp(1.6rem,min(8vw,5.2svh),2.6rem)] font-semibold leading-tight">{n.label}</span>
                        <ArrowRight size={20} aria-hidden className={`transition-transform duration-300 group-hover:translate-x-1 ${isActive ? "opacity-100" : "opacity-40"}`} />
                      </span>
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
          <Link to="/join" onClick={closeFor("/join")} className="mnav-fade btn-gold mt-8 w-full sm:hidden" style={{ "--i": menuItems.length } as CSSProperties}>Join the chapter</Link>
          <ul className="mnav-fade mt-8 flex flex-wrap gap-x-6 border-t border-line pt-4 text-[15px]" style={{ "--i": menuItems.length + 1 } as CSSProperties}>
            <li><a className="inline-flex min-h-[44px] items-center gap-2 text-mute hover:text-cream" href={`mailto:${site.email}`}><Mail size={18} aria-hidden /> Email</a></li>
            <li><a className="inline-flex min-h-[44px] items-center gap-2 text-mute hover:text-cream" href={site.linkedin} target="_blank" rel="noopener"><Linkedin size={18} aria-hidden /> LinkedIn<span className="sr-only"> (opens in a new tab)</span></a></li>
            <li><a className="inline-flex min-h-[44px] items-center gap-2 text-mute hover:text-cream" href={site.instagram} target="_blank" rel="noopener"><Instagram size={18} aria-hidden /> Instagram<span className="sr-only"> (opens in a new tab)</span></a></li>
          </ul>
        </div>
      </nav>
    </>
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
      <a href="#main" className="skip-link sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-gold focus:px-4 focus:py-2 focus:text-ink">Skip to content</a>
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
