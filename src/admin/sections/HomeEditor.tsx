import { useState } from "react";
import { ArrowDown, ArrowUp, Lightbulb, Plus, Trash2 } from "lucide-react";
import { useAdmin } from "../context";
import { IconButton, PageTitle, TextArea, TextField } from "../ui";
import { pillarIcon } from "../../lib/icons";
import { HOME_STORY_STEPS, PILLAR_ICONS, PILLAR_ICON_LABELS, type HomeContent, type HomeHero } from "../../../shared/content.ts";
import { MAX, validateHome, type Errors } from "../../../shared/validate.ts";

const swap = <T,>(a: T[], i: number, j: number) => { [a[i], a[j]] = [a[j], a[i]]; };
const LINK_HINT = "A page on this site like /about, or a full link starting with https://";

const HERO_FIELDS: { key: keyof HomeHero; label: string; hint?: string; long?: boolean; wide?: boolean }[] = [
  { key: "eyebrow", label: "Line above the title", hint: "The small line at the top of the Home page.", wide: true },
  { key: "title", label: "Title" },
  { key: "tagline", label: "Tagline", hint: "Shown under the title." },
  { key: "intro", label: "Introduction", long: true, wide: true },
  { key: "primaryLabel", label: "First button text", hint: "The gold button." },
  { key: "primaryLink", label: "First button link", hint: LINK_HINT },
  { key: "secondaryLabel", label: "Second button text" },
  { key: "secondaryLink", label: "Second button link", hint: LINK_HINT },
];

export default function HomeEditor() {
  const { content, update } = useAdmin();
  const home: HomeContent = content.home;
  // Problems show once something has been edited here, then update live
  const [edited, setEdited] = useState(false);
  const errors: Errors = edited ? validateHome(home) : {};
  const edit = (fn: (h: HomeContent) => void) => { const next = structuredClone(home); fn(next); update("home", next); setEdited(true); };
  const { hero, about, whatWeDo } = home;
  const items = whatWeDo.items;

  return (
    <>
      <PageTitle title="Home page">
        The Home page hero, the About the Society text and the What We Do list. The About page uses the same About and What We Do text.
      </PageTitle>

      <section aria-labelledby="home-hero">
        <h2 id="home-hero" className="mb-4 font-display text-lg font-semibold">Hero</h2>
        <div className="adm-card grid grid-cols-1 gap-5 sm:grid-cols-2">
          {HERO_FIELDS.map(f => {
            const common = { label: f.label, hint: f.hint, value: hero[f.key], error: errors[`hero.${f.key}`], className: f.wide ? "sm:col-span-2" : "",
              onChange: (v: string) => edit(h => { h.hero[f.key] = v; }) };
            return f.long ? <TextArea key={f.key} {...common} /> : <TextField key={f.key} {...common} />;
          })}
        </div>
      </section>

      <section aria-labelledby="home-about" className="mt-10">
        <h2 id="home-about" className="mb-4 font-display text-lg font-semibold">About the Society</h2>
        <div className="adm-card grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField label="Small heading" hint="For example About the Society." value={about.label} error={errors["about.label"]}
            onChange={v => edit(h => { h.about.label = v; })} />
          <TextField label="Title" value={about.title} error={errors["about.title"]} onChange={v => edit(h => { h.about.title = v; })} />
        </div>
        <div className="mb-4 mt-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-medium">Paragraphs</h3>
            <p className="adm-hint">Home shows the first two; the About page shows all of them. Put two asterisks on each side of words to make them bold: **like this**.</p>
          </div>
          <button className="btn-ghost btn-sm" disabled={about.paragraphs.length >= MAX.paragraphs}
            onClick={() => edit(h => { h.about.paragraphs.push(""); })}><Plus size={15} /> Add paragraph</button>
        </div>
        {errors["about.paragraphs"] && <p className="adm-error mb-4" role="alert">{errors["about.paragraphs"]}</p>}
        <div className="grid grid-cols-1 gap-4">
          {about.paragraphs.map((p, i) => (
            <div key={i} className="adm-card flex flex-col gap-3 sm:flex-row sm:items-start">
              <TextArea label={`Paragraph ${i + 1}`} value={p} error={errors[`about.paragraphs.${i}`]} className="min-w-0 flex-1"
                onChange={v => edit(h => { h.about.paragraphs[i] = v; })} />
              <div className="flex gap-2 sm:flex-col sm:pt-7">
                <IconButton label={`Move paragraph ${i + 1} up`} disabled={i === 0} onClick={() => edit(h => swap(h.about.paragraphs, i, i - 1))}><ArrowUp size={16} /></IconButton>
                <IconButton label={`Move paragraph ${i + 1} down`} disabled={i === about.paragraphs.length - 1} onClick={() => edit(h => swap(h.about.paragraphs, i, i + 1))}><ArrowDown size={16} /></IconButton>
                <IconButton label={`Delete paragraph ${i + 1}`} tone="danger" onClick={() => edit(h => { h.about.paragraphs.splice(i, 1); })}><Trash2 size={16} /></IconButton>
              </div>
            </div>
          ))}
          {!about.paragraphs.length && <p className="adm-card text-mute">No paragraphs yet. Add at least one.</p>}
        </div>
      </section>

      <section aria-labelledby="home-wwd" className="mt-10">
        <h2 id="home-wwd" className="mb-4 font-display text-lg font-semibold">What We Do</h2>
        <div className="adm-card grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField label="Small heading" hint="For example What We Do." value={whatWeDo.label} error={errors["whatWeDo.label"]}
            onChange={v => edit(h => { h.whatWeDo.label = v; })} />
          <TextField label="Title" value={whatWeDo.title} error={errors["whatWeDo.title"]} onChange={v => edit(h => { h.whatWeDo.title = v; })} />
        </div>
        <div className="mb-4 mt-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-medium">Items</h3>
            <p className="adm-hint">
              Keep at least {HOME_STORY_STEPS}. Home shows the first {HOME_STORY_STEPS} in its swipe deck and scroll story, one particle shape each, so their order matters. The About page lists every item.
            </p>
          </div>
          <button className="btn-ghost btn-sm" disabled={items.length >= MAX.whatWeDoItems}
            onClick={() => edit(h => { h.whatWeDo.items.push({ icon: PILLAR_ICONS[0], title: "", text: "" }); })}><Plus size={15} /> Add item</button>
        </div>
        {errors["whatWeDo.items"] && <p className="adm-error mb-4" role="alert">{errors["whatWeDo.items"]}</p>}
        <div className="grid grid-cols-1 gap-4">
          {items.map((item, i) => (
            <div key={i} className="adm-card grid grid-cols-1 gap-4">
              <div className="flex items-end gap-2">
                <TextField label={`Item ${i + 1}`} value={item.title} error={errors[`whatWeDo.items.${i}.title`]} className="min-w-0 flex-1"
                  hint={i >= HOME_STORY_STEPS ? "Shown on the About page only." : undefined}
                  onChange={v => edit(h => { h.whatWeDo.items[i].title = v; })} />
                <IconButton label={`Move item ${i + 1} up`} disabled={i === 0} onClick={() => edit(h => swap(h.whatWeDo.items, i, i - 1))}><ArrowUp size={16} /></IconButton>
                <IconButton label={`Move item ${i + 1} down`} disabled={i === items.length - 1} onClick={() => edit(h => swap(h.whatWeDo.items, i, i + 1))}><ArrowDown size={16} /></IconButton>
                <IconButton label={`Delete item ${i + 1}`} tone="danger" disabled={items.length <= HOME_STORY_STEPS}
                  onClick={() => edit(h => { h.whatWeDo.items.splice(i, 1); })}><Trash2 size={16} /></IconButton>
              </div>
              <TextArea label="One or two sentences about it" value={item.text} error={errors[`whatWeDo.items.${i}.text`]}
                onChange={v => edit(h => { h.whatWeDo.items[i].text = v; })} />
              <IconPicker index={i} value={item.icon} error={errors[`whatWeDo.items.${i}.icon`]} onChange={v => edit(h => { h.whatWeDo.items[i].icon = v; })} />
            </div>
          ))}
        </div>
        {items.length <= HOME_STORY_STEPS && <p className="adm-hint mt-3">Items can't be deleted while there are only {HOME_STORY_STEPS}. Add one first, or edit an item instead.</p>}
      </section>
    </>
  );
}

/** Six icon choices as radio buttons, each showing the icon the site will use. */
function IconPicker({ index, value, error, onChange }: { index: number; value: string; error?: string; onChange: (v: string) => void }) {
  const name = `wwd-icon-${index}`;
  const current = (PILLAR_ICONS as readonly string[]).includes(value) ? PILLAR_ICON_LABELS[value as keyof typeof PILLAR_ICON_LABELS] : "none chosen";
  return (
    <fieldset aria-describedby={`${name}-note`}>
      <legend className="adm-label">Icon</legend>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {PILLAR_ICONS.map(key => {
          const Icon = pillarIcon[key] ?? Lightbulb, on = value === key;
          return (
            <label key={key} title={PILLAR_ICON_LABELS[key]}
              className={`grid h-11 w-11 cursor-pointer place-items-center rounded-xl border transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-violet-soft ${on ? "border-violet-soft bg-raised text-cream" : "border-line text-mute hover:border-violet-soft hover:text-cream"}`}>
              <input type="radio" name={name} value={key} checked={on} className="sr-only" aria-label={PILLAR_ICON_LABELS[key]} onChange={() => onChange(key)} />
              <Icon size={20} aria-hidden />
            </label>
          );
        })}
      </div>
      {error ? <span id={`${name}-note`} className="adm-error" role="alert">{error}</span>
        : <span id={`${name}-note`} className="adm-hint">{current}</span>}
    </fieldset>
  );
}
