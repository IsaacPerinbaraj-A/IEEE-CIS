# IEEE CIS REC website

Website for IEEE CIS REC, the student chapter of the IEEE Computational Intelligence Society at
Rajalakshmi Engineering College, Chennai. React 18 + TypeScript + Vite 7 + Tailwind 3 + React Router 6.
Full history, data sources, open questions and pending work: `docs/HANDOFF.md` (read it when context is needed).

## Priorities from the club

- UI quality matters most. The look is dark purple (REC purple) with REC gold, vibrant particle effects,
  3D motion and scroll animation. Keep new work consistent with that identity.
- Content is edited by rotating student office bearers, so content must stay in `src/data/*.json`, never hardcoded in pages.
  After go-live the database is the source of truth: every Vercel build overwrites `src/data/*.json` (and adds photos to
  `public/images`) with the published content, so the repo copy is only the starting copy and for local development.
- Home hero, About the Society and What We Do copy live in `src/data/home.json` (`**bold**` supported via `richText`).
  The Home scroll story shows the first six What We Do items, one particle formation each (`STEPS = 6` in
  `ParticleStory.tsx`). The four CI ideas (neural networks, fuzzy systems, evolutionary computation, swarm intelligence)
  were removed from visible content at the club's request; particle shape names in code are just abstract shapes.
- The admin lives at `/admin` (`src/admin/`, lazy-loaded) and is database-backed. The browser calls `/api/*` on the
  site's own origin; Vercel rewrites it to the admin server on Render (`server/`, Express 5 + the `mongodb` driver),
  which stores accounts, sessions, every release, photos and the activity log in MongoDB Atlas (M0). Publish saves a
  numbered release, then calls Vercel's Deploy Hook; the build pulls the release (`scripts/fetch-content.ts`). GitHub
  holds only code: the admin never uses GitHub tokens or makes commits. Setup: `docs/SETUP.md`; editors: `docs/ADMIN-GUIDE.md`.
- Sign-in is username + passphrase, checked only on the server, with an HttpOnly session cookie. One owner (the web
  lead: Accounts, backups, import) and editors. Never add client-side auth checks, passwords or secrets in the browser,
  or `VITE_` secrets (the old site's admin leaked its password this way). Secrets live only in Render and Vercel
  environment variables (listed in `.env.example`; local values go in `.env.local`, never committed).

## Commands

- `npm run dev` for local preview (proxies `/api` to the admin server on 127.0.0.1:8787), `npm run build` (runs the
  `prebuild` content pull, then `tsc -b` and Vite), `npm run lint` (must stay clean).
- `npm run server` starts the admin server (reads `.env.local`; without `MONGODB_URI` it runs but database routes
  answer 503). `npm run test:server` runs the node:test suites in `shared/`, `server/` and `scripts/` (no database).
- `scripts/fetch-content.ts` does nothing without `CONTENT_EXPORT_URL`, so local builds use `src/data` as it is. With
  it set it overwrites `src/data/*.json`; don't commit that output.
- Test the home intro with a hard refresh on `/`. It does not replay when navigating to Home inside the site.

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
- Admin: forms validate live only after the first save attempt. Publishing merges item by item against the release the
  editor started from (`shared/merge.ts`); only same-item clashes go back to the editor ("Load theirs" / "Publish mine
  anyway"). Keep that flow if you change publishing.
- Content rules live once, in `shared/validate.ts`, and run in the admin, on the server at publish, and in the build.
  The build stops on any rule break, so tightening a rule can fail every build until the live content is fixed:
  check the published content against a new rule first.
- Code layout: `shared/` is used by the admin, the server and the build, so it must not use Node-only or browser-only
  APIs; `src/` never imports `server/`, and `server/` never imports `src/` (ESLint enforces all three). Node runs
  `server/` and `scripts/` TypeScript directly: erasable syntax only, relative imports end in `.ts`, `import type` for types.
- `/admin` is served from `dist/admin.html` (index.html without inline scripts, made by the `adminHtml` plugin in
  `vite.config.ts`) under a strict CSP in `vercel.json` (`script-src 'self'`, `connect-src 'self'`). Never add inline
  scripts or third-party requests to the admin. Links from the admin to the public site must be full page loads
  (plain `<a href>`), or the public pages would run under the admin's CSP.

- `tsconfig.app.json` has `erasableSyntaxOnly`: no constructor parameter properties; declare fields and assign them.
- ESLint `react-refresh/only-export-components`: component files may only export components. Shared constants
  and icon maps live in `src/lib/` (e.g. `src/lib/icons.ts`).
- Keep `lucide-react` at 0.294.x. Newer versions removed the LinkedIn/GitHub/Instagram brand icons used here.
- The intro depends on three places staying in sync: `public/intro.js` (loaded by a blocking `<script src>` at the
  start of `<body>` in `index.html`; sets `body[data-intro="on"]` before first paint on `/`; a file, not inline, so the
  admin's CSP allows it), `src/components/particles/ParticleStory.tsx`, and the `body[data-intro]` rules in
  `src/index.css` (states `on` / `leaving` / `done`). Any fallback path must set
  `done`, or the header and hero stay hidden.
- The intro flag `introPlayedThisLoad` is set only when the intro finishes (React StrictMode mounts twice in dev).
  `openedOnHome` limits the intro to page loads on `/`.
- During the intro the particle field has `interactive = false` so the cursor never disturbs the chapter name.
- Particle engine (`src/components/particles/engine.ts`) is raw WebGL1, no three.js. Shapes are `ShapeSpec`
  objects (`positions`, `colors`, `offset`, `scale`, `spin`, `sway`, `flutter`, `size`). Don't add three.js;
  the old site's three.js/Vanta setup was ~700 KB and was removed on purpose.
- Every animation must respect `prefers-reduced-motion` and pause when off screen or in a hidden tab.
  The custom cursor only runs for fine pointers and must leave text inputs with a normal text cursor.
- Routing is `BrowserRouter`; `vercel.json` handles deep links (SPA fallback, after the `/api` rewrite and the
  `/admin` → `admin.html` rewrites). Hosting is Vercel (site) + Render (admin server); Netlify isn't used.
- Events are upcoming or past based on their date at runtime; undated events count as past and are grouped by `session`.
- Team shows `sessions[0]` by default. A new academic year goes at the top (the admin's "New academic year" does this).
- Images: team photos 480x480 WebP with the face centred; posters max 900 px wide WebP; lowercase-dash filenames.
  Admin uploads are stored in MongoDB under `/images/<folder>/<name>-<10 hex of sha256>.<webp|jpg>` (paths never change,
  no `?v=`) and copied into `public/images` at build time. Logos (`public/brand`) stay in the code.

## Open items (details in docs/HANDOFF.md)

Unconfirmed: SIH date (site uses 18 Sept, per poster), LLM Tuned year (assumed 2025), chapter email, name
spellings, 2026–27 team, faculty coordinator, membership form link (`site.json` → `memberForm`), ANALYTICA and
Resume Hack dates/posters, achievements. Five team profile links in the starting copy aren't full links and must be
fixed in the admin before Team can be published. The database admin hasn't been tested against real Atlas, Render and
Vercel yet (`docs/SETUP.md`); `vercel.json`'s `/api` destination is a placeholder until go-live. Not yet tested on real
phones/laptops.
