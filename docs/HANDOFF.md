# IEEE CIS REC website: full project handoff

Written 10 September 2026 at the end of a long chat (updated after the layout, responsive and admin round), so the work can continue in a new chat or in Claude Code without losing anything.

---

## How to continue in a new chat

1. Download **`IEEE-CIS-REC-complete-bundle.zip`** from this chat. It contains this document, the full website source code, both earlier prototypes, all preview images and your cursor screenshot.
2. In the new chat, upload the bundle zip (or at minimum `website/` zipped plus this `HANDOFF.md`).
   To continue in **Claude Code** instead: unzip, open a terminal in `website/`, run `npm install`, then `claude`.
   `website/CLAUDE.md` is loaded automatically and points to `website/docs/HANDOFF.md`.
3. Start with a message like:
   > "Continue my IEEE CIS REC website project. Read HANDOFF.md first, then unzip the website folder. Next I want to …"

The newest, complete version of the site is the `website/` folder. The standalone prototypes are older design explorations kept for reference only.

---

## 1. Background

- **Who:** a student in Chennai building the website for their college club.
- **Club:** **IEEE CIS REC**, the student chapter of the **IEEE Computational Intelligence Society** at **Rajalakshmi Engineering College (REC)**, Thandalam, Chennai.
- **Priorities stated by the user:** UI is the main factor. They want it vibrant, with 3D designs and animations (scroll effects, cursor effects), and an intro screen before the landing page. They liked the cursor "force field" hole effect ("very well broo").
- **Existing site:** the chapter's previous site (from the 2025 team) was uploaded as `IEEE-CIS-main.zip` (React + TypeScript + Vite + Tailwind).

---

## 2. Conversation timeline

1. **What is `ui-ux-pro-max-skill`?** Explained: a GitHub "skill" for AI coding assistants (Claude Code, Cursor, Windsurf) with a local database of UI styles, colour palettes, font pairings, UX guidelines and chart types, searched by a Python script. MIT licensed. Not designed for upload to Claude.ai (repo exceeds 200-file limit).
2. **Alternatives:** Anthropic's official Frontend Design skill, Taste Skill (Leonxlnx, adjustable "dials" for variance/motion/density), Emil Kowalski's skill (animation polish), Bencium UX Designer, Vercel skills (Web Design Guidelines, React Best Practices, accessibility), LibreUIUX (huge toolkit), Impeccable (pbakaus).
3. **Comparison verdict:** best single pick is Anthropic's Frontend Design (light, official). Taste Skill for bold landing pages; UI UX Pro Max for multi-framework design systems; add Vercel's guidelines for accessibility and performance. Don't install several design skills at once.
4. **Club website v1 (standalone HTML):** built `ieee-cis-rec.html` using the Frontend Design approach (details in section 9).
5. **UI UX Pro Max version:** cloned the repo into the sandbox, ran its design-system generator (first query matched a sports profile, retried per the skill's rules, used "Research Lab / University Department"), built `ieee-cis-rec-uupm.html` (details in section 9).
6. **Analysis of the old site zip:** full code review, build and browser testing. Findings in section 3.
7. **Design review of the old site + its `figma_design` folder.** Findings in section 3.
8. **Full rebuild inside the real React codebase** with new pages, routing, compressed images, clean data files. Delivered as `IEEE-CIS-REC-redesign.zip`.
9. **3D round:** custom WebGL particle engine, intro before the landing, scroll story morphing through the four ideas of computational intelligence, cursor force field, scroll reveals, 3D tilt cards, marquee, progress bar.
10. **"Does an admin page exist?"** No, it was removed on purpose (insecure). Options explained; Decap CMS recommended; offered to set it up (**not done yet**).
11. **Round: intro, cursor, headers:** intro replays on every refresh of the home page (not on in-site navigation); intro particles ignore the cursor; new custom stardust cursor site-wide; click shockwave; 3D particle formations in every page header; back-to-top button; more reveals/tilt on other pages; About page marquee. Note: an earlier attempt at this round had been interrupted; its changes were reviewed and reconciled, and a dev-mode bug (intro never showing under React StrictMode) was fixed.
12. **"Can I continue in Claude Code?"** Yes. Added `website/CLAUDE.md` (auto-loaded by Claude Code) and `website/docs/HANDOFF.md`. Install notes: native installer, requires a paid Claude plan (Pro/Max/Team/Enterprise/Console).
13. **Latest round (current state):** the user reported (with screenshots at 1536 × 730, 125% scaling) that the 3D shapes sat too far right and were clipped, and asked for full responsiveness, an admin page for editing everything, and suggestions.
    - **Layout fix:** shapes are now placed inside measured regions of the page (content column, beside the hero text / step cards / page titles) with a perspective-aware fitting helper (`layout.ts` → `fitShape`), so near-camera parts never leave the screen. Headline sized by width and height.
    - **Responsive:** automated audit of 10 pages × 13 devices (320 px phone to 2560 px monitor, landscape phones, tablets): the only overflow (Contact page on phones) fixed; visual checks of hero, story and headers on 9 devices. Home switches between side-by-side and stacked with one shared media query.
    - **Admin page built** at `/admin` (details in section 4). Tested end to end in local mode (files verified on disk, then restored) and against a simulated GitHub API (bad token, sign-in, conflict warning, publish with automatic retry). Checked on phones (320/390 px), which exposed and fixed a grid overflow in admin lists.

---

## 3. Findings about the old site (`IEEE-CIS-main.zip`)

**Structure:** React 18 + TypeScript + Vite 7 + Tailwind 3, shadcn-style UI, three.js + Vanta globe, snow particles, mouse-following glow orbs. Pages: Home, About (team from `members.json`), Events (from `public/events.json` and `past_event.json`), Join, Contact, plus a hidden `/admin`. No URL routing (state-based pages). A `figma_design/` folder was a Figma Make (AI) prototype the site was built from; not used by the build, contained placeholder emails/Unsplash images, and an unfilled `Guidelines.md`.

**Problems found:**
- **Security (most urgent):** admin username and password hardcoded in the login component and **displayed on screen as "Demo Credentials"**, also committed in a `.env` file as `VITE_` variables (which get bundled into public JavaScript). Login check was browser-only. **If that password is reused anywhere, change it.** (Credentials intentionally not repeated in this document.)
- Admin add/delete events posted to `localhost:5000`, a server not in the repo, so it could never work online.
- Event filter broken: categories plural ("Webinars") vs event types singular ("Webinar"), so every filter showed "No Events Found" (confirmed in browser).
- Fake placeholder past events ("AI Workshop Series 2", "Data Science Bootcamp" with `example.com` links); "upcoming" SIH event was a year old; footer said © 2024.
- Contradicting numbers: "486,000 members" (roughly all of IEEE, not CIS) vs "420,000+"; unverified claims ("Training 500+ students annually", internship partnerships).
- Two different emails: `ieee.cis@rec.edu` (likely wrong) and `ieee.cis@rajalakshmi.edu.in`.
- Typos: "Public Realtions", "Secertary", "Swarna Laskshmi", misspelled `deafult_pfp.jpg`.
- Contact page existed but had no menu link; no shareable URLs; refresh always went Home; back button left the site.
- Very heavy: ~45 MB images (one team photo 9 MB), three.js ~700 KB, whole app re-rendered on every mouse move, no reduced-motion support.
- Design: every section used identical glass cards with purple icon circles (template look); CIS logo's black text unreadable on dark purple; glowing text reduced readability; hero had no call-to-action; home page mostly about global IEEE CIS rather than the chapter; emoji icons in footer.
- Good parts kept: purple identity (matches REC's purple-and-gold logo), real team photos with LinkedIn/GitHub/Instagram links, real event posters, JSON-based data.

**Details recovered from the old posters:**
- **LLM Tuned:** online on Google Meet, May 5 and 6, 7:45 to 9 pm; signed by Pugal M (Chair), Shrinithi S (Vice Chair), Akshaya M (Secretary), Vijay K (Staff Coordinator). Year not shown (assumed 2025).
- **REWIRED:** by the chapter's IoT domain, "AIML Dept 2025–2026", two-level skill training; phase one 3 March online (Google Meet), phase two 6 March at Idea Factory KS02; limited seats; hybrid hands-on.
- **Champion's Mic: SIH Edition, The Winner's Playbook:** poster says 18 September, 7:30 to 9 pm, online, featuring SIH 2024 champions (software and hardware tracks). The old JSON said 17 September.
- **Datavizzx** (21 April 2025, Power BI), **Operation Shadow** (15 February 2025, cybersecurity), **Cloudscape** (12 February 2025, AWS).
- From a web search of the chapter's LinkedIn: **ANALYTICA** (data science challenge with a simulated business scenario) and **The Resume Hack** (Placement Unfiltered series, with the Department of AI & ML). Dates unknown.

**21 photos in the old `public/images/` folder aren't linked to anyone in `members.json`** (possibly past office bearers; roles unknown, so not used): ABDULLASABITH A, AKASHVARDHAN V, AKSHAYA K, ASHVANTH M, BALAMURUGAN S, DINESHRAJ, HARISH M (duplicate), ISAAC PERINBARAJ, LATHIKARAJMOHAN, MANI SHANKAR RAJU R (duplicate), MYTHRAYEE V, NIRANJAN V, NITIN TS, PRADHIKSHYAANAND, RAKESH B, SAJINREYANS J, SANJAY R (duplicate), SHERLY K, Saranya V, VARNEKA K, ZAARALAWRENCE.

---

## 4. The current website (`website/` in the bundle)

### Stack and commands

- React 18, TypeScript 5.8, Vite 7, Tailwind 3, React Router 6, lucide-react **0.294** (keep this version: newer versions removed the LinkedIn/GitHub/Instagram brand icons), self-hosted fonts via `@fontsource/unbounded` (500, 600) and `@fontsource-variable/geist`.
- Removed from the old project: three.js, Vanta, snow, admin login, `.env`.
- Dev-only: `@types/node` (for `admin-local-backend.ts`).
- Commands: `npm install`, `npm run dev` (localhost:5173, also enables the admin's local mode), `npm run build` (outputs `dist/`), `npm run lint`.
- Build size: main JS about 278 KB (89 KB gzipped); admin loads separately (about 65 KB, 20 KB gzipped); CSS about 47 KB. Images 1.2 MB total (old: ~45 MB).

### Hosting

- `BrowserRouter` with `public/_redirects` (Netlify) and `vercel.json` (Vercel) already set up so deep links work.
- GitHub Pages: switch `BrowserRouter` to `HashRouter` in `src/App.tsx`.
- Content updates: through `/admin` (publishes to GitHub), or by editing the JSON in GitHub; the host auto-redeploys.
- `public/robots.txt` disallows `/admin`.

### File structure

```
index.html                 meta/OG tags, favicon, inline script that hides the chrome before the intro
public/_redirects          Netlify SPA rewrite
vercel.json                Vercel SPA rewrite
public/brand/              rec-main-logo.png (REC purple/gold), ieee-logo.svg (IEEE CIS logo, black text)
public/images/team/        28 face-cropped 480x480 WebP photos
public/images/events/      6 posters (max 900px WebP)
tailwind.config.js         colour tokens and fonts
src/index.css              base styles, component classes, all animation/intro/cursor CSS
src/main.tsx               font imports, app mount
src/App.tsx                routes
src/data/                  events.json, team.json, site.json, faqs.json, resources.json, achievements.json
src/lib/data.ts            types, loaders, upcoming/past logic, date/time formatting, .ics calendar files, initials
src/lib/icons.ts           brand icons + domain icon map (kept out of component files for the lint rule)
src/lib/useTitle.ts        per-page document titles
src/components/Layout.tsx  navbar (desktop + full-screen mobile menu), footer, skip link, scroll-to-top on route change,
                           ScrollProgress, BackToTop, CursorAura
src/components/PageHeader.tsx       page title block with HeaderParticles (prop `shape`)
src/components/EventCards.tsx       Poster (typographic fallback when no poster), PosterCard (tilt, data-cursor="View"), UpcomingCard
src/components/MemberCard.tsx       photo with tilt, name, role, social buttons, initials fallback
src/components/Accordion.tsx        FAQ accordion
src/components/Brand.tsx            CisLogoTile (logo on a cream tile for readability), RecMark
src/components/Icons.tsx            AreaGlyph (line drawings for the four CI areas; gold marks "the best")
src/components/Motion.tsx           Reveal, Tilt, Marquee, ScrollProgress, CursorAura, BackToTop
src/components/particles/engine.ts          custom WebGL particle engine
src/components/particles/shapes.ts          point-cloud generators
src/components/particles/ParticleStory.tsx  home intro + scroll story
src/components/particles/HeaderParticles.tsx page header formations
src/pages/                  Home, Events, EventDetail, Team, About, Achievements, Resources, Join, Contact, NotFound
src/components/particles/layout.ts          SIDE_QUERY (side-by-side vs stacked), BOUNDS per formation, fitShape()
src/admin/AdminApp.tsx      admin shell: sign-in gate, loading, draft state, image queue, nav, unpublished-changes bar
src/admin/Login.tsx         GitHub token sign-in, local-mode and offline options, token help
src/admin/session.ts        stored repo/branch/token helpers
src/admin/backend.ts        github (Git Data API, one commit, retry), local (dev server), offline (downloads) backends
src/admin/model.ts          content types, file paths, validation, slugify, academic-year helper, tidyEvent
src/admin/image.ts          in-browser image processing (square crop 480 px, fit 900 px, WebP with JPEG fallback)
src/admin/context.ts        shared admin state (AdminContext, useAdmin)
src/admin/ui.tsx            form fields, image picker, accessible modal, icon buttons
src/admin/CropDialog.tsx    drag/zoom/keyboard photo framing
src/admin/sections/         Dashboard, EventsEditor, TeamEditor, AchievementsEditor, SiteEditor, FaqEditor, ResourcesEditor, PublishPanel
src/data/admin.json         { "repo": "", "branch": "main" } → set the repository for the admin
admin-local-backend.ts      Vite dev-server plugin: /__admin/ping, /__admin/file, /__admin/commit (dev only, path allow-list)
public/robots.txt           keeps /admin out of search engines
CLAUDE.md, docs/HANDOFF.md  instructions for Claude Code and this handoff
README.md                   how to run, deploy, use the admin, update content, prepare images, tweak animations
```

### Routes and pages

| Route | Page | Header formation | Contents |
|---|---|---|---|
| `/` | Home | (full-screen story) | Intro, hero globe, 4-step scroll story, next/most recent event bar, scroll-reactive marquee of event names, "Nine teams, one chapter" domains (5 technical tiles with real heads' names, 4 support teams), recent event posters, about band, join band (animated gradient, spinning ring) |
| `/events` | Events | orbit rings | Upcoming/Past tabs with counts, type filter chips, past grouped by academic year; `?tab=` and `?type=` in URL |
| `/events/:slug` | Event detail | (none) | Poster at natural shape, facts (date, time, venue, coordinator), description, Register + Add to calendar (upcoming only), Share, more events |
| `/team` | Team | constellation (9 clusters sized by real team sizes) | Year switcher (2025–26 latest, 2024–25), domain chips, faculty, groups; `?year=` and `?domain=` |
| `/about` | About | globe | Mission, event counts computed from data, four CI areas, domain marquee, IEEE CIS worldwide, team CTA |
| `/achievements` | Achievements | peaks (fuzzy) | Timeline; menu link appears only when `achievements.json` has entries (currently empty) |
| `/resources` | Resources | helix | Curated official learning links by domain |
| `/join` | Join | swarm | 3 steps (IEEE membership, add CIS, chapter form), benefits, FAQ |
| `/contact` | Contact | ripples | Email/Instagram/LinkedIn/campus cards, message form that opens the email app (mailto), Google Maps embed |
| `*` | 404 | chaos | "This page doesn't exist" with links |
| `/admin/*` | Admin (outside the site layout) | none | Dashboard, Events, Team, Achievements, Site settings, FAQs, Resources, Publish |

### Admin page

- **Sign-in:** each editor uses their own fine-grained GitHub personal access token (repository access: only the website repo; permission: Contents read/write). Verified on sign-in (must have push access). Token kept in `sessionStorage` (or `localStorage` if "Keep me signed in"). Repo/branch from `src/data/admin.json` or the sign-in form. Only repository collaborators can publish.
- **Modes:** GitHub (live), local (`npm run dev`, writes files via `admin-local-backend.ts`), offline (Publish downloads the changed files).
- **Editors:** events (search, filters, poster upload, auto page address and academic year, live preview with the real PosterCard), team (academic years incl. "New academic year" that copies team names and faculty, faculty, rename/reorder/delete teams, add/edit/move/reorder/remove members, photo crop, live MemberCard preview), achievements (with photos), site settings, FAQs, resources.
- **Publish:** lists changes in plain words ("1 added, 2 edited"), optional message, checks whether GitHub changed since loading (warns before overwriting someone else), then one commit (blobs → tree → commit → move branch, retries once on a race). Success links to the commit.
- **Safety:** drafts only in memory until Publish; warning when closing the tab with unpublished changes; confirmation on deletes and sign-out; noindex; not loaded for normal visitors.
- **Images:** saved as `public/images/{team|events|achievements}/<slug>.webp` with `?v=<timestamp>` in the data to bust caches. Old replaced images are left in the repo.

### Design system

| Token | Hex | Use |
|---|---|---|
| ink | #0F0A1C | page background |
| panel | #181128 | raised surfaces |
| raised | #221839 | hover / second level |
| line | #33284D | borders |
| cream | #F4EFE4 | main text |
| mute | #B3A8C8 | secondary text |
| violet | #8B5CF6 (soft #C4B5FD, deep #5B3BA8) | accents |
| gold | #F2B544 (deep #E0A12A) | REC gold: primary buttons and "the goal" |
| extra vibrant accents in animations | pink #EC4899 / #F472B6, cyan #22D3EE, purple #A855F7 | particles, marquee, progress bar |

- Fonts: **Unbounded** (display headings, wide and bold) and **Geist** (body). Member names use Geist (Unbounded wrapped badly).
- Component classes in `index.css`: `.wrap`, `.btn`, `.btn-gold`, `.btn-ghost`, `.chip`, `.chip-on`, `.h-page`, `.h-section`, `.lede`, `.link`, plus `.reveal`, `.tilt`, `.tilt-glare`, `.marquee-fill`, `.marquee-outline`, `.join-band`, `.join-ring`, `.scroll-cue`, cursor classes, `.back-to-top`.

### Animation system

**Engine (`engine.ts`, class `ParticleField`, WebGL1, no three.js):** thousands of additive-blended glowing points morph between shapes. Each frame draws one transition, shape `from` to shape `to`, with per-particle staggered timing and an outward "burst" mid-morph.
- `ShapeSpec`: `positions`, `colors` [bottom, top], `offset`, `scale`, `spin` (continuous Y rotation, 0 faces camera), `sway` (gentle side-to-side), `flutter` (particles wander; swarm), `size` (point size multiplier).
- API: `setShapes`, `setLayout`, `replaceShape`, `pointer(nx, ny | null)`, `shock(nx, ny)`, `interactive` (false = ignore cursor), `morph` / `morphTarget` / `follow`, `motion` (0 for reduced motion), `onFrame`, `start`, `stop`, `resize`, `draw`, `dispose`, static `supported()`.
- Cursor effect in the shader: particles within a radius are pushed out and swirled (vortex) and brightened, creating the "force field" hole. Click `shock()` sends an expanding gold ring that pushes particles outward (lasts about 1.4 s).
- Rotation angle wraps within one turn so shapes never unwind several times. Gold sparks on ~3.5% of particles.

**Home (`ParticleStory.tsx`):** formations 0 intro cloud, 1 chapter-name text, 2 hero globe, 3 neural network (faces camera with sway), 4 fuzzy membership hills, 5 DNA helix, 6 swarm. 6,500 particles desktop, 2,600 phones. The canvas is sticky while the hero and four step cards scroll over it; formation index is interpolated from each step element's real position; soft glow blobs behind change colour per formation.
- Step cards: "1 of 4 Neural networks" (links to LLM Tuned), "2 of 4 Fuzzy systems", "3 of 4 Evolutionary computation", "4 of 4 Swarm intelligence".
- **Intro:** plays when the site is opened or refreshed on `/` (module flag `openedOnHome` + `introPlayedThisLoad`, set only when the intro finishes). Not on in-site navigation back to Home, not after opening another page first. Forces scroll to top (`history.scrollRestoration = "manual"`). Timeline: loading bar, then gather into "IEEE CIS / REC" (desktop) or "IEEE / CIS / REC" (phones) over 1.7 s, hold 1.3 s with "Computational Intelligence Society / Rajalakshmi Engineering College, Chennai" under the text, then release into the globe over 1.5 s. Skip button (with countdown ring) or Esc skips (0.7 s release). Particles are **not interactive during the intro**.
- `body[data-intro]` states: `on` (header, hero items `.intro-item`, progress bar, back-to-top, `.story-shade` hidden; scroll locked), `leaving` (chrome animates in with delays), `done`. An inline script in `index.html` sets `on` before first paint on `/` (unless reduced motion). Fallbacks set `done` if WebGL is missing.
- Clicking empty space on the home scene sends a shockwave. Home scene wrapper is pulled up under the navbar (`-mt-[69px]`).

**Page headers (`HeaderParticles.tsx`):** 3,000 particles desktop, 1,500 phones; assemble from a scattered cloud over 1.8 s; force field and click shockwave active; presets: sphere, neural, fuzzy, helix, swarm, chaos, rings, constellation, ripple.

**Site-wide (`Motion.tsx`):**
- `CursorAura` (mouse + fine pointer only, not reduced motion): hides the native cursor (except text fields), gold dot, trailing ring, stardust spark trail on a full-screen canvas; ring grows over links; shows a gold badge label for `data-cursor="..."` (posters say "View"); click = spark burst; during the intro becomes a golden halo with a longer gold trail. State via `html[data-aura]`, `html[data-aura-hover="link|label|text"]`, `html[data-aura-press]`.
- `BackToTop`: appears after 600 px, gradient progress ring, smooth scroll (instant for reduced motion), hidden during intro.
- `Reveal` (fade/lift/unblur on scroll, staggered delays), `Tilt` (3D perspective tilt + glare, fine pointers only), `Marquee` (Web Animations API; speeds up and reverses with scroll), `ScrollProgress` (top gradient bar).

**Performance and accessibility:** animations pause off screen and in background tabs; DPR capped (1.75 desktop, 1.5 phones); fewer particles on phones; reduced-motion users get still versions, no intro, no custom cursor; no-WebGL browsers show the page normally; skip link; focus-visible outlines; aria labels on icon buttons; tested: no page errors.

### Content data (`src/data/`)

**`events.json`** (upcoming/past computed from dates at runtime; undated events count as past; grouped by `session`):

| slug | title | type | session | date | notes |
|---|---|---|---|---|---|
| analytica | ANALYTICA | Competition (Data Science) | 2025-26 | unknown | no poster (typographic card) |
| the-resume-hack | The Resume Hack | Talk (Placement Unfiltered) | 2025-26 | unknown | no poster |
| rewired | REWIRED | Training (IoT) | 2025-26 | 2026-03-03 to 03-06 | Idea Factory KS02 |
| sih-champions-mic | Champion's Mic: The Winner's Playbook | Webinar (SIH 2025) | 2025-26 | 2025-09-18, 19:30–21:00 | Google Form register link kept |
| llm-tuned | LLM Tuned | Workshop (ML) | 2024-25 | 2025-05-05 to 05-06, 19:45–21:00 | year assumed |
| datavizzx | Datavizzx | Workshop (Data Science) | 2024-25 | 2025-04-21 | Power BI |
| operation-shadow | Operation Shadow | Workshop | 2024-25 | 2025-02-15 | cybersecurity |
| cloudscape | Cloudscape | Workshop | 2024-25 | 2025-02-12 | AWS |

**`team.json`**, session **2025–26** (28 people, 9 teams, all with photos; faculty list empty):
- Management: Swarna Lakshmi B (Chair), Surweesh SP (Vice Chair), Harish Kumar V (Secretary), Mervin Anto Santhosh A (HR), Sajiv Jess B (Treasurer)
- Web Development: Tarun Aanand S G, Ashikhashree Karthikeyan, Surya Prajin S, Gunavazhagan B (Web Dev Team)
- Machine Learning: Shriram N, Shri Dharashini M (ML Heads), Sanjay R (ML Senior Associate)
- Data Science: Sai Sanjay SV, Dilip Kannan (DS Heads), Lokaa V (DS Senior Associate)
- Computer Vision: Lakshiya Sri KM, Prathisha R (CV Heads), Devesh D (CV Senior Associate)
- Internet of Things: Doneeswaran J, Harish M (IoT Heads), Umesh Sarathy (IoT Senior Associate)
- Design: Gnaanesh BB, Antony Jadrian A (Design Heads), Vijay R (Design Senior Associate)
- Event Management: Sathyanath L, Mani Shankar Raju R (Event Heads)
- Public Relations: Rashmi R, Dejaswini G (PR Heads)

Session **2024–25** (from posters): Pugal M (Chair), Shrinithi S (Vice Chair), Akshaya M (Secretary); faculty Vijay K (Staff Coordinator).

**`site.json`:** name "IEEE CIS REC"; email `ieee.cis@rajalakshmi.edu.in`; LinkedIn `https://in.linkedin.com/in/ieee-cis-rec-27900a29a` (found by web search, active in 2026; the old site used `linkedin.com/company/ieee-cis-rec`); Instagram `https://instagram.com/ieee_cis_rec`; `memberForm` empty; map query "Rajalakshmi Engineering College, Thandalam, Chennai".

**`faqs.json`:** who can join; do I need IEEE membership for events; membership cost (points to IEEE); joining domain teams; proposing a workshop.

**`resources.json`:** ML (scikit-learn guide, PyTorch tutorials, Kaggle Learn), Data Science (pandas docs, Power BI docs, Kaggle datasets), CV (OpenCV, Hugging Face Learn), IoT (Arduino docs, Raspberry Pi docs), Web (MDN, React), Cloud and Security (AWS Skill Builder, OWASP Top 10), IEEE (cis.ieee.org, IEEE Xplore, IEEE membership).

**`achievements.json`:** empty `[]`.

**Data fixes made:** "Swarna Laskshmi B" to "Swarna Lakshmi B" (LinkedIn slug confirms), "SURWEESH SP" to "Surweesh SP", "SajivJess B" to "Sajiv Jess B", "Secertary" to "Secretary", "Public Realtions" to "Public Relations", "Internet Of Things" to "Internet of Things", Instagram "NIL" entries emptied and handles turned into URLs. Photos auto-cropped around faces with OpenCV; four fixed by hand (Dejaswini G, Rashmi R, Sathyanath L, Shri Dharashini M).

---

## 5. Things the user still needs to confirm or provide

- [ ] SIH event date: poster says **18 September**, old data said 17 (site uses 18).
- [ ] LLM Tuned year (assumed **2025**).
- [ ] Correct chapter email (`ieee.cis@rajalakshmi.edu.in` used).
- [ ] Spellings of all member names (e.g. "Shri Dharashini M" vs photo file "SHRI DHARSHINI M"), and whether "Vice Chair" etc. are right.
- [ ] Whether a **2026–27 team** exists (send names, roles, photos, links; add as the first session in `team.json`).
- [ ] 2025–26 faculty coordinator (Vijay K was on 2024–25 posters).
- [ ] **Membership Google Form link** for `site.json` → `memberForm`.
- [ ] Dates and posters for ANALYTICA and The Resume Hack.
- [ ] Achievements (SIH results, wins, papers) for `achievements.json`.
- [ ] Which LinkedIn URL is official; confirm Instagram handle `@ieee_cis_rec`.
- [ ] Roles for the 21 unused old photos, if they should appear (e.g. as alumni).
- [ ] Change the old admin password anywhere it was reused.
- [ ] Put the site on GitHub, connect Netlify or Vercel, set `"repo"` in `src/data/admin.json`, add office bearers as collaborators, and try the admin against the real repository (so far tested against a simulated GitHub).
- [ ] Test on a real laptop and phone (all testing was in a headless browser with software graphics).

## 6. Offered but not done yet (possible next steps)

- ~~Admin panel~~: **done** (custom Git-based admin, see section 4).
- Suggestions given to the user: achievements content (SIH results etc.); event photo gallery (uploadable via admin); alumni section from past years' teams; domain project showcases with GitHub links; "add all events to my calendar" subscription link; certificate verification; share images (Open Graph) per page/event; privacy-friendly analytics (Plausible or Umami); custom domain; yearly handover of repository access.
- Possible admin additions: gallery editor, cleanup of replaced images, preview deploys via branches, editing "What we explore"/Home copy.
- Deploy to Netlify/Vercel and connect a domain.
- Lighthouse/performance audit on real hardware; maybe code-split the home-page particle code.
- Replace the placeholder REC mark or CIS tile if the chapter has an official combined logo.

## 7. Technical gotchas for whoever continues

- `tsconfig.app.json` has `erasableSyntaxOnly`: no constructor parameter properties (declare fields, assign in constructor). `resolveJsonModule` was added for JSON imports.
- ESLint `react-refresh/only-export-components`: files exporting components must only export components. That's why icon maps live in `src/lib/icons.ts`.
- The intro depends on three places staying in sync: the inline script in `index.html`, `ParticleStory.tsx`, and the `body[data-intro]` rules in `index.css`.
- `PageHeader` accepts `shape` (formation) and optional `aside` / `below` slots.
- `data-cursor="Label"` on any element shows that label in the cursor ring.
- Contact form has no backend (opens the visitor's email app). The map is a Google Maps embed with a CSS colour-invert filter.
- `lucide-react` must stay at 0.294.x for brand icons.
- CSS grid items won't shrink below their longest unbroken line (truncated names, long emails): single-column grids with truncated text need `grid-cols-1`/`minmax(0,1fr)` and `min-w-0` (this caused overflow on the Contact page and in admin lists on phones).
- `SIDE_QUERY` in `layout.ts` and the `@media` block in `index.css` must stay identical. Shapes are fitted inside DOM-measured regions; never position them from the screen edge.
- New team groups added in the admin appear on the Team page; the home page's domain tiles only show the nine known team slugs (see `technical`/`support` maps in `Home.tsx`).
- Sandbox testing notes (for an AI assistant): run `vite preview` and Playwright in the same bash call; use Chromium flags `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` for WebGL; never run `pkill -f "vite preview"` (it kills its own shell).

---

## 8. Files from this chat

**In the bundle (`IEEE-CIS-REC-complete-bundle.zip`):**

| Path | What it is |
|---|---|
| `HANDOFF.md` | This document |
| `website/` | **The current, complete website source** (with the admin) plus README, `CLAUDE.md` (auto-read by Claude Code) and `docs/HANDOFF.md` (copy of this file) |
| `prototypes/ieee-cis-rec.html` | v1 standalone page (Frontend Design approach, PSO swarm hero) |
| `prototypes/ieee-cis-rec-uupm.html` | UI UX Pro Max version (Swiss academic style, filterable events) |
| `previews/IEEE-CIS-REC-new-effects.png` | Latest round: intro halo cursor, force field, shockwave, all page headers |
| `previews/IEEE-CIS-REC-preview.png` | First React redesign (before 3D), desktop + mobile |
| `previews/IEEE-CIS-REC-animation-preview.gif` | Slideshow of the intro and scroll story (3D round) |
| `reference/user-cursor-screenshot.png` | The user's screenshot of the force-field effect they liked |
| `reference/user-screenshot-hero-1536.png`, `reference/user-screenshot-step-1536.png` | The user's screenshots showing the old right-shifted, clipped shapes (before the layout fix) |
| `previews/IEEE-CIS-REC-layout-and-admin.png` | Latest round: fixed layout on several devices, admin on desktop and phone |

**Also available separately in this chat:** `IEEE-CIS-REC-redesign.zip` (website only) and the individual files above.

**Not included on purpose:** the original `IEEE-CIS-main.zip` (44 MB, and it contains the exposed `.env`). The user already has it; re-upload only if the old code is needed.

---

## 9. Earlier prototypes and research (for reference)

**v1 standalone (`ieee-cis-rec.html`):** light page with a navy hero; colours navy #0B2A4A, IEEE blue #00629B, sky #7FD1F2, amber #FFB547, paper #F3F6F9; fonts Bricolage Grotesque + Atkinson Hyperlegible; 2D canvas particle-swarm hero (pointer moves the goal, click scatters); editable JS arrays for events and team.

**UI UX Pro Max version (`ieee-cis-rec-uupm.html`):** generated design system "Research Lab / University Department": Swiss Modernism 2.0, 12-column grid, primary #1E3A5F, secondary #2563EB, accent #A16207, background #F8FAFC, text #0F172A; EB Garamond + Crimson Text; filterable event grid (All / Competitions / Talks / Workshops); GSAP stagger animation; neural-network SVG hero.

**Skill research summary:** UI UX Pro Max (~126k GitHub stars, MIT, premium tier exists) is best for data-driven design systems across many stacks; Anthropic Frontend Design is the lightest general pick; Taste Skill suits bold creative pages; Vercel skills cover accessibility/performance; LibreUIUX is overkill for a club site. For this project, the final site was built directly (no external skill needed in Claude.ai, which has a built-in frontend design skill).
