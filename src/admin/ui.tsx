import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, ImagePlus, Info, Loader2, Trash2, X, XCircle } from "lucide-react";

/** Label + control + hint/error, wired together for screen readers. */
export function Field({ label, hint, error, children, className = "" }: { label: string; hint?: ReactNode; error?: string; children: (id: string, describedBy: string | undefined) => ReactNode; className?: string }) {
  const id = useId(), hintId = `${id}-hint`;
  return (
    <div className={className}>
      <label htmlFor={id} className="adm-label">{label}</label>
      {children(id, hint || error ? hintId : undefined)}
      {error ? <span id={hintId} className="adm-error" role="alert">{error}</span> : hint ? <span id={hintId} className="adm-hint">{hint}</span> : null}
    </div>
  );
}

export function TextField({ label, hint, error, value, onChange, className, ...rest }: { label: string; hint?: ReactNode; error?: string; value: string; onChange: (v: string) => void; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!error} className="adm-input" value={value} onChange={e => onChange(e.target.value)} {...rest} />}
    </Field>
  );
}

export function TextArea({ label, hint, error, value, onChange, className, ...rest }: { label: string; hint?: ReactNode; error?: string; value: string; onChange: (v: string) => void; className?: string } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id, d) => <textarea id={id} aria-describedby={d} aria-invalid={!!error} className="adm-input min-h-[110px] resize-y" value={value} onChange={e => onChange(e.target.value)} {...rest} />}
    </Field>
  );
}

export function SelectField({ label, hint, error, value, onChange, options, className, ...rest }: { label: string; hint?: ReactNode; error?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string } & Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id, d) => (
        <select id={id} aria-describedby={d} className="adm-input" value={value} onChange={e => onChange(e.target.value)} {...rest}>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
}

export function PageTitle({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-[clamp(1.6rem,3vw,2.2rem)] font-semibold">{title}</h1>
        {children && <p className="mt-2 max-w-[62ch] text-mute">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function IconButton({ label, onClick, children, disabled, tone = "normal" }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean; tone?: "normal" | "danger" }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line transition-colors disabled:opacity-35 ${tone === "danger" ? "text-[#FCA5A5] hover:border-[#F87171] hover:bg-[#7F1D1D]/30" : "text-mute hover:border-violet-soft hover:text-cream"}`}>
      {children}
    </button>
  );
}

/** Pick an image file. Shows the current image and lets you replace or remove it. */
export function ImageInput({ label, hint, src, onFile, onRemove, square = false, busy = false }: { label: string; hint?: string; src?: string; onFile: (f: File) => void; onRemove?: () => void; square?: boolean; busy?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <span className="adm-label">{label}</span>
      <div className="mt-1.5 flex items-center gap-4">
        <div className={`grid shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-ink ${square ? "h-24 w-24" : "h-28 w-[88px]"}`}>
          {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={22} className="text-mute" />}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={() => input.current?.click()} disabled={busy}>{busy ? "Processing…" : src ? "Replace" : "Upload"}</button>
          {src && onRemove && <button type="button" className="btn-ghost btn-sm" onClick={onRemove}><Trash2 size={15} /> Remove</button>}
        </div>
        <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-label={label}
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      </div>
      {hint && <span className="adm-hint">{hint}</span>}
    </div>
  );
}

/**
 * Accessible modal: focuses itself, closes on Esc, keeps the page behind from scrolling. With `dismissible` false it
 * has no close button, and Esc or a click outside does nothing (the sign-in dialog).
 */
export function Modal({ title, onClose, children, footer, wide = false, dismissible = true }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; dismissible?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // The latest onClose, so a parent re-render (new arrow function) doesn't re-run the focus effect below
  const close = useRef({ onClose, dismissible });
  useEffect(() => { close.current = { onClose, dismissible }; });
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input,textarea,select,button")?.focus();
    // Only the top-most dialog reacts to Esc (the photo cropper can open on top of a form)
    const onKey = (e: KeyboardEvent) => { const all = document.querySelectorAll("[role=dialog]"); if (close.current.dismissible && e.key === "Escape" && all[all.length - 1] === ref.current) close.current.onClose(); };
    document.addEventListener("keydown", onKey); document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey); prev?.focus();
      setTimeout(() => { if (!document.querySelector("[role=dialog]")) document.body.style.overflow = ""; }, 0);
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={e => { if (dismissible && e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className={`flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-panel sm:rounded-3xl ${wide ? "sm:max-w-4xl" : "sm:max-w-xl"}`}>
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          {dismissible && <IconButton label="Close" onClick={onClose}><X size={18} /></IconButton>}
        </div>
        <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4 sm:px-6">{footer}</div>}
      </div>
    </div>
  );
}

/** A passphrase box with a show/hide button. Pasting is allowed (password managers). */
export function PassphraseField({ label, value, onChange, autoComplete, hint, error, className, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; autoComplete: "current-password" | "new-password"; hint?: ReactNode; error?: string; className?: string; autoFocus?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id, d) => (
        <div className="relative">
          <input id={id} aria-describedby={d} aria-invalid={!!error} className="adm-input pr-14" type={shown ? "text" : "password"} value={value}
            onChange={e => onChange(e.target.value)} autoComplete={autoComplete} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus={autoFocus} />
          <button type="button" onClick={() => setShown(v => !v)} aria-pressed={shown} aria-label={shown ? "Hide passphrase" : "Show passphrase"} title={shown ? "Hide" : "Show"}
            className="absolute right-1 top-[calc(50%+3px)] grid h-11 w-11 -translate-y-1/2 place-items-center rounded-lg text-mute hover:text-cream">
            {shown ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      )}
    </Field>
  );
}

const NOTICE_TONES = {
  error: { cls: "border-[#7F1D1D] bg-[#7F1D1D]/25 text-[#FCA5A5]", Icon: XCircle },
  warn: { cls: "border-gold/50 bg-gold/10 text-cream", Icon: AlertTriangle },
  ok: { cls: "border-[#166534] bg-[#14532D]/25 text-cream", Icon: CheckCircle2 },
  info: { cls: "border-line bg-panel text-cream", Icon: Info },
} as const;

/** A message box. Errors and warnings are announced to screen readers. */
export function Notice({ tone = "info", title, children, actions, className = "" }: { tone?: keyof typeof NOTICE_TONES; title?: ReactNode; children?: ReactNode; actions?: ReactNode; className?: string }) {
  const { cls, Icon } = NOTICE_TONES[tone];
  return (
    <div role={tone === "error" || tone === "warn" ? "alert" : "status"} className={`flex gap-3 rounded-2xl border px-4 py-3.5 text-[15px] ${cls} ${className}`}>
      <Icon size={19} className={`mt-0.5 shrink-0 ${tone === "warn" ? "text-gold" : tone === "ok" ? "text-[#4ADE80]" : tone === "info" ? "text-violet-soft" : ""}`} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? "mt-1 text-mute" : ""}>{children}</div>}
        {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** A small spinning icon (still when reduced motion is on). */
export function Spinner({ size = 18, className = "" }: { size?: number; className?: string }) {
  return <Loader2 size={size} aria-hidden className={`shrink-0 motion-safe:animate-spin ${className}`} />;
}
