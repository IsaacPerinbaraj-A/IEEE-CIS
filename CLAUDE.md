# IEEE CIS REC website

Website for IEEE CIS REC, the student chapter of the IEEE Computational Intelligence Society at
Rajalakshmi Engineering College, Chennai. React 18 + TypeScript + Vite 7 + Tailwind 3 + React Router 6.
Full history, data sources, open questions and pending work: `docs/HANDOFF.md` (read it when context is needed).

## Priorities from the club

- UI quality matters most. The look is dark purple (REC purple) with REC gold, vibrant particle effects,
  3D motion and scroll animation. Keep new work consistent with that identity.
- Content is edited by rotating student office bearers, so content must stay in `src/data/*.json`, never hardcoded in pages.
- The admin lives at `/admin` (`src/admin/`, lazy-loaded). It is Git-based: editors sign in with their own
  fine-grained GitHub token (Contents: read/write on this repo), drafts stay in memory, and Publish makes one commit
  via the Git Data API. Never add passwords, client-side auth checks or `VITE_` secrets (the old site's admin leaked
  its password this way). Repository and branch come from `src/data/admin.json`.

## Commands

- `npm run dev` for local preview, `npm run build` (runs `tsc -b` then Vite), `npm run lint` (must stay clean).
- Test the home intro with a hard refresh on `/`. It does not replay when navigating to Home inside the site.
- `npm run dev` also enables the admin's local mode (`/admin` → "Edit the files on this computer"), served by
  `admin-local-backend.ts` (dev server only; writes only `src/data/*.json` and `public/images/{team,events,achievements}/`).

## Conventions

- Colours and fonts come from `tailwind.config.js` tokens (`ink`, `panel`, `raised`, `line`, `cream`, `mute`,
  `violet`, `gold`) and classes in `src/index.css` (`.wrap`, `.btn-gold`, `.btn-ghost`, `.chip`, `.h-page`,
  `.h-section`, `.lede`, `.link`). Gold is reserved for primary actions and "the goal/best" in visuals.
- Headings use Unbounded (`font-display`); body and member names use Geist (`font-sans`). Unbounded wraps badly for names.
- Pages start with `<PageHeader title shape="...">`. Each page has its own particle formation
  (Events `rings`, Team `constellation`, About `sphere`, Resources `helix`, Join `swarm`, Contact `ripple`,
  Achievements `fuzzy`, 404 `chaos`). New pages should get a distinct formation.
- Wrap new sections/cards in `Reveal` (with staggered `delay`) and interactive cards in `Tilt` from `components/Motion.tsx`.
- `data-cursor="Label"` on an element makes the custom cursor ring show that label (posters use "View").
- Writing style on the site: plain, specific, sentence case, no unverified claims or invented numbers.

## Pitfalls (these have bitten before)

- CSS grid items won't shrink below their longest unbroken line (e.g. `truncate` text, long emails). Single-column
  grids that contain truncated text need `grid-cols-1` / `minmax(0,1fr)` and `min-w-0`, or they overflow on phones.
- Home layout: side-by-side vs stacked is decided by one media query that must stay identical in
  `SIDE_QUERY` (`src/components/particles/layout.ts`) and the `@media` block in `src/index.css`.
  3D shapes are placed with `fitShape()` inside regions measured from the DOM (`.hero-wrap`, `.hero-copy`,
  `.step-card`, `.page-title`); never position shapes relative to the screen edge (perspective pushes them off screen).
- Admin: forms validate live only after the first save attempt. The admin checks for remote changes before publishing;
  keep that check if you change the publish flow.

- `tsconfig.app.json` has `erasableSyntaxOnly`: no constructor parameter properties; declare fields and assign them.
- ESLint `react-refresh/only-export-components`: component files may only export components. Shared constants
  and icon maps live in `src/lib/` (e.g. `src/lib/icons.ts`).
- Keep `lucide-react` at 0.294.x. Newer versions removed the LinkedIn/GitHub/Instagram brand icons used here.
- The intro depends on three places staying in sync: the inline script in `index.html` (sets
  `body[data-intro="on"]` before first paint on `/`), `src/components/particles/ParticleStory.tsx`, and the
  `body[data-intro]` rules in `src/index.css` (states `on` / `leaving` / `done`). Any fallback path must set
  `done`, or the header and hero stay hidden.
- The intro flag `introPlayedThisLoad` is set only when the intro finishes (React StrictMode mounts twice in dev).
  `openedOnHome` limits the intro to page loads on `/`.
- During the intro the particle field has `interactive = false` so the cursor never disturbs the chapter name.
- Particle engine (`src/components/particles/engine.ts`) is raw WebGL1, no three.js. Shapes are `ShapeSpec`
  objects (`positions`, `colors`, `offset`, `scale`, `spin`, `sway`, `flutter`, `size`). Don't add three.js;
  the old site's three.js/Vanta setup was ~700 KB and was removed on purpose.
- Every animation must respect `prefers-reduced-motion` and pause when off screen or in a hidden tab.
  The custom cursor only runs for fine pointers and must leave text inputs with a normal text cursor.
- Routing is `BrowserRouter`; `public/_redirects` (Netlify) and `vercel.json` handle deep links.
  GitHub Pages would need `HashRouter`.
- Events are upcoming or past based on their date at runtime; undated events count as past and are grouped by `session`.
- Team shows `sessions[0]` by default. Add a new academic year at the top of `team.json`.
- Images: team photos 480x480 WebP with the face centred; posters max 900 px wide WebP; lowercase-dash filenames.

## Open items (details in docs/HANDOFF.md)

Unconfirmed: SIH date (site uses 18 Sept, per poster), LLM Tuned year (assumed 2025), chapter email, name
spellings, 2026–27 team, faculty coordinator, membership form link (`site.json` → `memberForm`), ANALYTICA and
Resume Hack dates/posters, achievements, the real repository name in `src/data/admin.json`. Not yet tested
on real phones/laptops or against the real GitHub repository (tested against a simulated GitHub API).
