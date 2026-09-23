import { useMemo, useState } from "react";
import { CalendarPlus, Pencil, Search } from "lucide-react";
import { useAdmin } from "../context";
import { PageTitle, TextField, TextArea, SelectField, ImageInput } from "../ui";
import { clone, emptyEvent, sessionFor, slugify, tidyEvent, validateEvent, type ChapterEvent, type Errors } from "../model";
import { fileToImage, renderFit } from "../image";
import { PosterCard } from "../../components/EventCards";
import { formatDate, isUpcoming } from "../../lib/data";

const TYPES = ["Workshop", "Talk", "Webinar", "Training", "Competition", "Hackathon"];

export default function EventsEditor() {
  const { content, update, preview } = useAdmin();
  const [editing, setEditing] = useState<{ draft: ChapterEvent; originalSlug?: string } | null>(null);
  const [q, setQ] = useState(""), [tab, setTab] = useState<"all" | "upcoming" | "past">("all");
  const [notice, setNotice] = useState("");

  const list = useMemo(() => {
    const up = content.events.filter(isUpcoming).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const past = content.events.filter(e => !isUpcoming(e)).sort((a, b) => (b.session + (b.date || "9")).localeCompare(a.session + (a.date || "9")));
    const all = tab === "upcoming" ? up : tab === "past" ? past : [...up, ...past];
    const s = q.trim().toLowerCase();
    return s ? all.filter(e => [e.title, e.type, e.domain, e.series, e.venue].some(v => v?.toLowerCase().includes(s))) : all;
  }, [content.events, q, tab]);

  if (editing) return (
    <EventForm key={editing.originalSlug || "new"} initial={editing.draft} originalSlug={editing.originalSlug}
      onCancel={() => setEditing(null)}
      onSave={e => {
        const tidy = tidyEvent(e);
        const next = editing.originalSlug ? content.events.map(x => (x.slug === editing.originalSlug ? tidy : x)) : [tidy, ...content.events];
        update("events", next); setEditing(null);
        setNotice(`"${tidy.title}" saved as a draft. Publish when you're ready to put it on the site.`);
      }}
      onDelete={editing.originalSlug ? () => {
        update("events", content.events.filter(x => x.slug !== editing.originalSlug)); setEditing(null);
        setNotice("Event removed from the draft. Publish to remove it from the site.");
      } : undefined} />
  );

  return (
    <>
      <PageTitle title="Events" actions={<button className="btn-gold" onClick={() => setEditing({ draft: emptyEvent() })}><CalendarPlus size={18} /> Add event</button>}>
        Add upcoming events, update details and posters, or tidy up past ones. Events move from Upcoming to Past on their own after their date.
      </PageTitle>
      {notice && <p role="status" className="mb-6 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-[15px]">{notice}</p>}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search events</span>
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" />
          <input className="adm-input mt-0 pl-10" placeholder="Search by title, type or venue" value={q} onChange={e => setQ(e.target.value)} />
        </label>
        <div className="flex gap-2" role="group" aria-label="Show">
          {(["all", "upcoming", "past"] as const).map(t => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)} className={`chip capitalize ${tab === t ? "chip-on" : ""}`}>{t}</button>
          ))}
        </div>
      </div>
      {list.length === 0 && <p className="adm-card text-mute">{q ? "No events match that search." : "No events here yet."}</p>}
      <ul className="grid grid-cols-1 gap-3">
        {list.map(e => (
          <li key={e.slug}>
            <button onClick={() => setEditing({ draft: clone(e), originalSlug: e.slug })}
              className="adm-card flex w-full items-center gap-4 p-3 text-left transition-colors hover:border-violet-soft sm:p-4">
              <span className="h-16 w-14 shrink-0 overflow-hidden rounded-lg border border-line bg-ink">
                {e.poster ? <img src={preview(e.poster)} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center bg-gradient-to-br from-violet-deep to-ink text-[11px] text-violet-soft">No poster</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{e.title}</span>
                <span className="block truncate text-[14px] text-mute">{e.type}, {formatDate(e)}</span>
              </span>
              <span className={`hidden rounded-full px-3 py-1 text-[13px] sm:inline ${isUpcoming(e) ? "bg-gold/15 text-gold" : "bg-raised text-mute"}`}>{isUpcoming(e) ? "Upcoming" : "Past"}</span>
              <Pencil size={17} className="shrink-0 text-mute" />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function EventForm({ initial, originalSlug, onCancel, onSave, onDelete }: {
  initial: ChapterEvent; originalSlug?: string; onCancel: () => void; onSave: (e: ChapterEvent) => void; onDelete?: () => void;
}) {
  const { content, addImage, preview } = useAdmin();
  const [e, setE] = useState<ChapterEvent>(initial);
  const [tried, setTried] = useState(false);            // show errors live once someone has tried to save
  const errors: Errors = tried ? validateEvent(e, content.events, originalSlug) : {};
  const [slugTouched, setSlugTouched] = useState(!!originalSlug);
  const [busy, setBusy] = useState(false), [imgError, setImgError] = useState("");
  const [start, end] = (e.time || "").split("-");
  const set = (patch: Partial<ChapterEvent>) => setE(prev => ({ ...prev, ...patch }));
  const domains = content.team.sessions[0]?.groups.map(g => g.domain) || [];
  const types = Array.from(new Set([...TYPES, ...content.events.map(x => x.type)]));

  const save = () => {
    const errs = validateEvent(e, content.events, originalSlug);
    setTried(true);
    if (Object.keys(errs).length) { setTimeout(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(), 0); return; }
    onSave(e);
  };
  const uploadPoster = async (f: File) => {
    setBusy(true); setImgError("");
    try { const img = await fileToImage(f); const poster = await addImage("events", e.slug || slugify(e.title) || "event", await renderFit(img)); set({ poster }); }
    catch (err) { setImgError(String((err as Error).message)); }
    finally { setBusy(false); }
  };
  const previewEvent = { ...e, poster: preview(e.poster), title: e.title || "Event title", summary: e.summary || "One-sentence summary" };

  return (
    <>
      <PageTitle title={originalSlug ? `Edit ${initial.title}` : "New event"}>
        Changes are kept as a draft until you publish. Fields marked optional can be left empty.
      </PageTitle>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <form className="grid grid-cols-1 gap-5" onSubmit={ev => { ev.preventDefault(); save(); }} noValidate>
          <div className="adm-card grid gap-5 sm:grid-cols-2">
            <TextField className="sm:col-span-2" label="Title" value={e.title} error={errors.title} required
              onChange={v => set({ title: v, ...(slugTouched ? {} : { slug: slugify(v) }) })} />
            <TextField label="Page address" value={e.slug} error={errors.slug} hint={`Shown as /events/${e.slug || "your-event"}`}
              onChange={v => { setSlugTouched(true); set({ slug: slugify(v) }); }} />
            <TextField label="Type" value={e.type} error={errors.type} list="event-types" hint="Pick from the list or type a new one." onChange={v => set({ type: v })} />
            <datalist id="event-types">{types.map(t => <option key={t} value={t} />)}</datalist>
            <SelectField label="Domain (optional)" value={e.domain || ""} onChange={v => set({ domain: v })}
              options={[{ value: "", label: "Whole chapter" }, ...domains.map(d => ({ value: d, label: d }))]} />
            <TextField label="Series (optional)" value={e.series || ""} hint="For example Placement Unfiltered." onChange={v => set({ series: v })} />
          </div>

          <div className="adm-card grid gap-5 sm:grid-cols-2">
            <TextField type="date" label="Start date (optional)" value={e.date || ""} error={errors.date}
              onChange={v => set({ date: v, ...(v ? { session: sessionFor(v) } : {}) })} />
            <TextField type="date" label="End date (optional)" value={e.endDate || ""} error={errors.endDate} hint="Only for events that run over several days." onChange={v => set({ endDate: v })} />
            <TextField type="time" label="Start time (optional)" value={start || ""} error={errors.time} onChange={v => set({ time: v ? `${v}${end ? `-${end}` : ""}` : "" })} />
            <TextField type="time" label="End time (optional)" value={end || ""} onChange={v => set({ time: start ? `${start}${v ? `-${v}` : ""}` : "" })} />
            <TextField label="Academic year" value={e.session} error={errors.session} hint="Filled in from the date. Format 2026-27." onChange={v => set({ session: v })} />
            <TextField label="Venue (optional)" value={e.venue || ""} onChange={v => set({ venue: v })} />
          </div>

          <div className="adm-card grid grid-cols-1 gap-5">
            <TextField label="Summary" value={e.summary} error={errors.summary} maxLength={160}
              hint={`One sentence for the event cards. ${160 - e.summary.length} characters left.`} onChange={v => set({ summary: v })} />
            <TextArea label="Description" value={e.description} error={errors.description} hint="Shown on the event's own page." onChange={v => set({ description: v })} />
            <ImageInput label="Poster (optional)" src={preview(e.poster)} busy={busy} onFile={uploadPoster} onRemove={() => set({ poster: "" })}
              hint={imgError || "Any image works. It's resized to 900 px wide, compressed and uploaded straight away."} />
            <TextField type="url" label="Registration link (optional)" value={e.register || ""} error={errors.register} placeholder="https://forms.gle/…"
              hint="The Register button only shows while the event is upcoming." onChange={v => set({ register: v })} />
            <TextField label="Coordinator (optional)" value={e.coordinator || ""} onChange={v => set({ coordinator: v })} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-gold">Save draft</button>
            <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
            {onDelete && <button type="button" className="btn-danger ml-auto" onClick={() => { if (confirm(`Delete "${initial.title}"? You can still discard this before publishing.`)) onDelete(); }}>Delete event</button>}
          </div>
        </form>

        <aside aria-label="Preview" className="xl:sticky xl:top-24 xl:self-start">
          <p className="mb-3 text-[14px] text-mute">Preview{isUpcoming(e) ? ". Upcoming events also get a large card with the Register button." : ""}</p>
          <div className="pointer-events-none select-none" aria-hidden>
            <div className="max-w-[300px]"><PosterCard e={previewEvent} /></div>
          </div>
        </aside>
      </div>
    </>
  );
}
