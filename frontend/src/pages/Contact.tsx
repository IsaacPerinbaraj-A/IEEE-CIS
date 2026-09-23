import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { Check, Copy, Mail, Map as MapIcon, MapPin, Navigation } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { Linkedin, Instagram } from "../lib/icons";
import { site } from "../lib/data";
import { prefersReducedMotion } from "../lib/motion";
import { useMediaQuery, PHONE } from "../lib/useMediaQuery";
import { useTitle } from "../lib/useTitle";
import { Reveal, Tilt } from "../components/Motion";

const topics = ["Joining the chapter", "An event", "Collaboration or sponsorship", "Something else"];
const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(site.mapQuery)}`;
const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(site.mapQuery)}&output=embed`;
const mapTitle = "Map showing Rajalakshmi Engineering College";

/** A closed panel can't be tabbed into or read out. (`inert` isn't in React 18's types, so it's passed as an attribute.) */
const inert = (on: boolean) => (on ? { inert: "" } : {});

/** Copies text, falling back to a hidden text box where the Clipboard API is missing or blocked. */
async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* try the fallback */ }
  try {
    const back = document.activeElement as HTMLElement | null, ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", "");
    Object.assign(ta.style, { position: "fixed", top: "0", left: "0", opacity: "0", fontSize: "16px" });
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    ta.remove();
    back?.focus({ preventScroll: true }); // selecting moved focus to the text box; give it back to the Copy button
    return ok;
  } catch { return false; }
}

/** Phones: one gold Email us button, the address with a Copy button, then Instagram, LinkedIn and Directions tiles. */
function PhoneChannels() {
  const [copied, setCopied] = useState(false);
  const address = useRef<HTMLSpanElement>(null), timer = useRef(0), alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; clearTimeout(timer.current); };
  }, []);
  const copy = async () => {
    const ok = await copyText(site.email);
    if (!alive.current) return;
    // If copying isn't allowed, select the address so it can be copied by hand
    if (!ok) { if (address.current) window.getSelection()?.selectAllChildren(address.current); return; }
    setCopied(true); clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  };
  // Let a long address wrap after the @ rather than mid-word on narrow phones
  const at = site.email.indexOf("@");
  const tiles = [
    { Icon: Instagram, label: "Instagram", href: site.instagram },
    { Icon: Linkedin, label: "LinkedIn", href: site.linkedin },
    { Icon: Navigation, label: "Directions", href: directions },
  ];
  return (
    <div className="min-w-0">
      <Reveal>
        <a href={`mailto:${site.email}`} className="btn-gold min-h-[48px] w-full"><Mail size={18} aria-hidden />Email us</a>
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-line bg-panel py-1.5 pl-4 pr-1.5">
          <span ref={address} className="min-w-0 flex-1 text-[15px] [overflow-wrap:anywhere]">
            {at > 0 ? <>{site.email.slice(0, at + 1)}<wbr />{site.email.slice(at + 1)}</> : site.email}
          </span>
          <button type="button" onClick={copy} aria-label="Copy email address"
            className="press inline-flex min-h-[44px] shrink-0 items-center rounded-full border border-line px-3.5 text-[15px] font-medium hover:border-violet-soft">
            {/* "Copy" rolls up and "Copied" rolls in from below (an instant swap with reduced motion) */}
            <span aria-hidden className="grid overflow-hidden">
              <span className={`inline-flex items-center gap-1.5 transition-transform duration-300 ease-[cubic-bezier(.2,.7,.2,1)] [grid-area:1/1] ${copied ? "-translate-y-full" : ""}`}><Copy size={15} className="shrink-0" />Copy</span>
              <span className={`inline-flex items-center gap-1.5 text-gold transition-transform duration-300 ease-[cubic-bezier(.2,.7,.2,1)] [grid-area:1/1] ${copied ? "" : "translate-y-full"}`}><Check size={15} strokeWidth={2.5} className="shrink-0" />Copied</span>
            </span>
          </button>
          <span role="status" className="sr-only">{copied ? "Email address copied" : ""}</span>
        </div>
      </Reveal>
      <ul className="mt-3 grid grid-cols-3 gap-3">
        {tiles.map(({ Icon, label, href }, i) => (
          <Reveal as="li" key={label} delay={90 + i * 70}>
            <Tilt className="rounded-2xl" max={3}>
              <a href={href} target="_blank" rel="noopener"
                className="press flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-panel px-2 text-[15px] transition-colors hover:border-violet-soft hover:bg-raised">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-raised text-violet-soft"><Icon size={19} aria-hidden /></span>
                {label}
              </a>
            </Tilt>
          </Reveal>
        ))}
      </ul>
    </div>
  );
}

/**
 * Phones: a folded Campus card. "Show map" opens a 260px panel; the map itself only loads on the first open,
 * once the panel has finished opening (loading it mid-animation made the open stutter), and fades in when ready.
 */
function PhoneMap() {
  const [open, setOpen] = useState(false), [mounted, setMounted] = useState(false), [loaded, setLoaded] = useState(false);
  const timer = useRef(0);
  const panel = useId();
  useEffect(() => () => clearTimeout(timer.current), []);
  const toggle = () => {
    clearTimeout(timer.current);
    if (!open && !mounted) timer.current = window.setTimeout(() => setMounted(true), prefersReducedMotion() ? 0 : 450);
    setOpen(!open);
  };
  return (
    <section className="wrap mt-12">
      <Reveal className="rounded-3xl border border-line bg-panel p-5">
        <div className="flex items-center gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-raised text-violet-soft"><MapPin size={19} aria-hidden /></span>
          <span className="min-w-0"><span className="block text-[14px] text-mute">Campus</span><span className="block">{site.college}, {site.city}</span></span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <a href={directions} target="_blank" rel="noopener" className="btn-ghost min-h-[48px] gap-1.5 whitespace-nowrap px-3"><Navigation size={17} aria-hidden className="shrink-0" />Directions</a>
          <button type="button" className="btn-ghost min-h-[48px] gap-1.5 whitespace-nowrap px-3" aria-expanded={open} aria-controls={panel} onClick={toggle}>
            <MapIcon size={17} aria-hidden className="shrink-0" />{open ? "Hide map" : "Show map"}
          </button>
        </div>
        <div id={panel} {...inert(!open)} style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
          className="grid transition-[grid-template-rows] duration-[450ms] ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none">
          <div className="min-h-0 overflow-hidden [perspective:900px]">
            <div className={`relative mt-4 grid h-[260px] origin-top place-items-center overflow-hidden rounded-2xl border border-line bg-ink text-mute/40 transition-[transform,opacity] duration-[450ms] ease-[cubic-bezier(.2,.7,.2,1)] ${open ? "opacity-100" : "opacity-0 [transform:rotateX(-14deg)]"}`}>
              <MapPin size={22} aria-hidden />
              {mounted && (
                <iframe title={mapTitle} referrerPolicy="no-referrer-when-downgrade" src={mapSrc} onLoad={() => setLoaded(true)}
                  className={`absolute inset-0 h-full w-full transition-opacity duration-[450ms] [filter:invert(.9)_hue-rotate(200deg)_saturate(.6)] ${loaded ? "opacity-100" : "opacity-0"}`} />
              )}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/** Enter in a one-line field moves on to the next field (the phone keyboard shows "Next"). */
const nextOnEnter = (to: RefObject<HTMLElement | null>) => (e: KeyboardEvent) => {
  if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); to.current?.focus(); }
};

export default function Contact() {
  useTitle("Contact", "Questions about joining, an idea for an event, or a collaboration? Reach IEEE CIS REC by email, Instagram or LinkedIn.");
  const phone = useMediaQuery(PHONE);
  const [f, setF] = useState({ name: "", email: "", topic: topics[0], message: "" });
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const emailField = useRef<HTMLInputElement>(null), messageField = useRef<HTMLTextAreaElement>(null);
  const send = () => {
    if (!f.name.trim() || !f.message.trim()) { setError("Add your name and a message so we know who's writing and what about."); return; }
    setError("");
    const subject = `${f.topic}: message from ${f.name}`;
    const body = `${f.message}\n\n${f.name}${f.email ? ` (${f.email})` : ""}`;
    window.location.href = `mailto:${site.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    // The page can't tell whether the email app opened, so it says what should have happened and offers a way out
    setSent({ subject, body });
    setCopied(false);
  };
  const copyMessage = async () => {
    if (!sent) return;
    const text = `To: ${site.email}\nSubject: ${sent.subject}\n\n${sent.body}`;
    try { await navigator.clipboard.writeText(text); } catch { /* older browsers: the message stays on screen to copy by hand */ }
    setCopied(true);
  };
  // Phones: 17px text so iOS doesn't zoom into the field
  const field = "mt-2 w-full rounded-xl border border-line bg-ink px-4 py-3 text-cream placeholder:text-mute/60 focus:border-violet-soft focus:outline-none max-sm:text-[17px]";
  const channels = [
    { Icon: Mail, label: "Email", value: site.email, href: `mailto:${site.email}` },
    { Icon: Instagram, label: "Instagram", value: "@ieee_cis_rec", href: site.instagram },
    { Icon: Linkedin, label: "LinkedIn", value: "IEEE CIS REC", href: site.linkedin },
    { Icon: MapPin, label: "Campus", value: `${site.college}, ${site.city}`, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.mapQuery)}` },
  ];
  return (
    <>
      <PageHeader title="Contact" shape="ripple">Questions about joining, an idea for an event, or a collaboration? We read everything.</PageHeader>
      <section className="wrap mt-14 grid gap-10 max-sm:mt-8 max-sm:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {phone ? <PhoneChannels /> : (
          <ul className="min-w-0 space-y-3">
            {channels.map(({ Icon, label, value, href }, i) => (
              <Reveal as="li" key={label} delay={i * 90}>
                <Tilt className="rounded-2xl" max={6}><a href={href} target={href.startsWith("mailto") ? undefined : "_blank"} rel="noopener" className="press flex items-center gap-4 rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-violet-soft hover:bg-raised">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-raised text-violet-soft"><Icon size={19} /></span>
                  <span className="min-w-0"><span className="block text-[14px] text-mute">{label}</span><span className="block break-words [overflow-wrap:anywhere]">{value}</span></span>
                </a></Tilt>
              </Reveal>
            ))}
          </ul>
        )}
        <Reveal delay={150} className="min-w-0 rounded-3xl border border-line bg-panel p-6 sm:p-9">
          {sent ? (
            <div role="status">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-raised text-violet-soft"><Check size={24} aria-hidden /></span>
              <h2 className="mt-5 text-2xl font-semibold">Your email app should have opened</h2>
              <p className="mt-3 text-[15px] text-mute">The message to {site.email} is filled in and ready. Press send there and we'll have it.</p>
              <p className="mt-2 text-[15px] text-mute">Nothing opened? Copy the message and send it from wherever you read email.</p>
              <pre className="mt-5 max-h-40 overflow-auto whitespace-pre-wrap rounded-2xl border border-line bg-ink p-4 text-[14px] text-cream/85">{sent.body}</pre>
              <div className="mt-6 flex flex-wrap gap-3 max-sm:flex-col">
                <button className="btn-gold max-sm:min-h-[48px] max-sm:w-full" onClick={copyMessage}>{copied ? "Copied" : "Copy the message"}</button>
                <button className="btn-ghost max-sm:min-h-[48px] max-sm:w-full" onClick={() => { setSent(null); setF({ name: "", email: "", topic: topics[0], message: "" }); }}>Write another message</button>
              </div>
            </div>
          ) : (
          <>
          <h2 className="text-2xl font-semibold">Send a message</h2>
          <p className="mt-2 text-[15px] text-mute">This opens your email app with the message filled in.</p>
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <label className="text-[15px]">Your name<input className={field} value={f.name} onChange={e => setF({ ...f, name: e.target.value })}
              name="name" autoComplete="name" autoCapitalize="words" enterKeyHint="next" onKeyDown={nextOnEnter(emailField)} /></label>
            <label className="text-[15px]">Your email <span className="text-mute">(optional)</span><input ref={emailField} type="email" className={field} value={f.email} onChange={e => setF({ ...f, email: e.target.value })}
              name="email" autoComplete="email" autoCapitalize="none" spellCheck={false} enterKeyHint="next" onKeyDown={nextOnEnter(messageField)} /></label>
          </div>
          <label className="mt-5 block text-[15px]">Topic
            <select className={field} value={f.topic} onChange={e => setF({ ...f, topic: e.target.value })}>{topics.map(t => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="mt-5 block text-[15px]">Message<textarea ref={messageField} rows={5} className={field} value={f.message} onChange={e => setF({ ...f, message: e.target.value })}
            name="message" autoCapitalize="sentences" /></label>
          {error && <p role="alert" className="mt-4 text-[15px] text-gold">{error}</p>}
          <button className="btn-gold mt-6 max-sm:min-h-[48px] max-sm:w-full" onClick={send}>Write the email</button>
          </>
          )}
        </Reveal>
      </section>
      {phone ? <PhoneMap /> : (
        <section className="wrap mt-16">
          <iframe title={mapTitle} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
            className="h-[360px] w-full rounded-3xl border border-line [filter:invert(.9)_hue-rotate(200deg)_saturate(.6)]"
            src={mapSrc} />
        </section>
      )}
    </>
  );
}
