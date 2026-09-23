# IEEE CIS REC website

The website of the IEEE Computational Intelligence Society student chapter at Rajalakshmi Engineering College.
Built with React, TypeScript, Vite and Tailwind CSS.

## Run it on your computer

You need Node.js 22.18 or newer (24 recommended).

```bash
npm install
npm run dev       # opens a live preview at http://localhost:5173
npm run build     # makes the final site in the frontend/dist/ folder
```

The admin needs its server too: `npm run server` in a second terminal (settings in `.env.local`, see
[docs/SETUP.md](docs/SETUP.md#running-everything-on-your-computer)). `npm run lint` and `npm run test:server` run the checks.

## Put it online

The site is set up for three free services (step by step in [docs/SETUP.md](docs/SETUP.md)):

- **Vercel** serves the website. `vercel.json` handles page links like `/events/rewired`, forwards `/api` to the
  admin server, and adds security headers to `/admin`.
- **Render** runs the admin server (`backend/`), described in `render.yaml`.
- **MongoDB Atlas** (free M0) stores the published content, its history, photos and admin accounts.

Code changes pushed to `main` on GitHub redeploy the site automatically. Content changes come from the admin.

---

## Admin page (the easy way to update the site)

Open **`/admin`** on the live site. From there office bearers edit events and posters, the team (names, roles,
photos, links, new academic years), achievements, the Home page (hero, About the Society, What We Do), the Join page,
FAQs, resources and site settings. Every form shows a live preview.

- **Sign-in:** each person has their own username and passphrase, checked on the admin server. The web lead invites
  people from the Accounts page; there is no public sign-up.
- **Unpublished changes** save on your device automatically until you press **Publish**.
- **Publish** saves a numbered release in the database and rebuilds the site (1–3 minutes). If someone else published
  in the meantime, changes to different items are combined; only edits to the same item ask you to choose.
- **History** keeps every release. Undo makes an old release, or one section of it, live again as a new release.
- **Photos** are processed in your browser before upload: member photos are framed as a square (drag and zoom) and
  saved as 480 × 480 WebP, posters are resized to 900 px wide. A 5 MB phone photo ends up around 20–60 KB.
- The admin is excluded from search engines and loaded separately, so visitors never download it.

The full guide for editors and the web lead (accounts, monthly backups, what to do when something is down, the yearly
handover) is [docs/ADMIN-GUIDE.md](docs/ADMIN-GUIDE.md).

## Updating the site by hand

Content lives in `frontend/src/data/`. **Once the admin is live, use the admin instead:** every build replaces these files
with the content published in the admin, so editing them in GitHub doesn't change the live site. They remain the
starting copy (imported into the admin once) and the content `npm run dev` shows on your computer. The formats
below are also what the admin stores.

### Add an event: `frontend/src/data/events.json`

Copy an existing event block and change it. Order doesn't matter; the site sorts by date.

```json
{
  "slug": "intro-to-machine-learning",
  "title": "Intro to Machine Learning",
  "type": "Workshop",
  "domain": "Machine Learning",
  "session": "2026-27",
  "date": "2026-10-15",
  "endDate": "",
  "time": "14:00-16:30",
  "venue": "Seminar Hall 2",
  "summary": "One sentence shown on cards.",
  "description": "A longer paragraph shown on the event page.",
  "poster": "/images/events/intro-to-machine-learning.webp",
  "register": "https://forms.gle/...",
  "coordinator": ""
}
```

- `slug` becomes the page address (`/events/intro-to-machine-learning`). Lowercase letters, numbers and dashes only, and unique.
- `type` can be anything, such as Workshop, Talk, Webinar, Training, Competition or Hackathon. Filter buttons appear automatically.
- `session` is the academic year, used to group past events.
- `date` uses the format `YYYY-MM-DD`. Leave it empty if unknown and the event shows under its academic year.
- `time` uses 24-hour `HH:MM-HH:MM`. It shows as "2:00 pm – 4:30 pm" and adds a proper time to calendar invites.
- **Upcoming and past are automatic.** An event counts as upcoming until the end of its last day, then moves to Past.
  The Register button and "Add to calendar" only show while it's upcoming.
- No poster yet? Leave `poster` empty and the site draws a clean title card instead.

### Update the team: `frontend/src/data/team.json`

The file holds one block per academic year in `sessions`. **The first block is shown by default**, so add
a new year at the top and older years stay available in the year switcher.

```json
{ "name": "Full Name", "role": "ML Head", "photo": "/images/team/full-name.webp",
  "linkedin": "https://www.linkedin.com/in/...", "github": "https://github.com/...", "instagram": "https://instagram.com/..." }
```

Leave any link empty (`""`) and its icon disappears. With no photo, initials are shown.
Team `slug` values power the filter and the icons, so keep them as they are.

### Other files

- `site.json` holds the email, LinkedIn, Instagram and the **membership form link** (`memberForm`, currently empty).
- `achievements.json` holds wins, papers and awards. It's empty now; once you add one entry, a "Milestones" link appears in the menu.
  Example: `{ "title": "SIH 2025 finalists", "year": "2025", "people": "Team names", "description": "...", "link": "" }`
- `faqs.json` holds the questions on the Join page.
- `resources.json` holds the learning links on the Resources page.

## Images

Large photos make the site slow on mobile data. Before adding images:

The admin prepares photos for you. For the starting copy and local work:

- **Team photos:** square, about 480 × 480 px, face in the middle. Save as `.webp` in `frontend/public/images/team/`.
- **Posters:** at most 900 px wide, `.webp`, in `frontend/public/images/events/`.
- Aim for under 150 KB each. Free tool: https://squoosh.app

Use lowercase file names with dashes, and no spaces.

## Layout on different screens

The home page and page headers are fully responsive. The home page switches between **side by side** (text left,
3D shape right) and **stacked** (shape above the text) using one media query that lives in two places and must stay
identical: `SIDE_QUERY` in `frontend/src/components/particles/layout.ts` and the matching `@media` block in `frontend/src/index.css`.
The 3D shapes measure the page's content column and use `fitShape()` to stay fully inside the free space, allowing
for perspective, so they never run off the screen edge or under the text.

## Where things are

The repository holds three projects (npm workspaces, so one `npm install` at the top installs all of them):

```
frontend/                  the website and the /admin page (React + Vite) — deployed to Vercel
  src/data/                content: the starting copy (each live build overwrites it with the published content)
  src/pages/               one file per page
  src/components/          shared pieces: navbar, footer, cards, motion effects
  src/components/particles/  3D engine, formations, home story, header particles, layout fitting
  src/admin/               the /admin page: sign-in, editors, publishing, history, accounts, image processing
  src/lib/                 data loading, date formatting, calendar files, icons
  scripts/                 fetch-content.ts: pulls the published content into src/data and public/images at build time
  public/images/           team photos, posters, achievement photos
  public/brand/            REC and IEEE CIS logos
  public/intro.js          hides the page chrome before first paint while the home intro plays
  index.html, vite.config.ts, tailwind.config.js

backend/                   the admin server (Render): Express + MongoDB, run by Node directly (no build step)

shared/                    content types, rules, merging and the API contract, used by all three

vercel.json, render.yaml   hosting settings for Vercel (site) and Render (admin server)
docs/                      SETUP.md (hosting setup), ADMIN-GUIDE.md (using the admin), HANDOFF.md (project history)
```

Every command below is run from the top folder; `npm run dev`, `npm run build` and `npm run server` know which
project to start.

## Animations and 3D effects

The site runs a small custom 3D engine (`frontend/src/components/particles/`, written directly in WebGL, no three.js).

**Landing page** (`ParticleStory.tsx`)
1. **Intro**: plays every time the home page is loaded or refreshed (not when you come back to it from another page
   of the site). A scattered cloud gathers into "IEEE CIS REC", holds with the society name underneath, then bursts
   into the hero globe. The cursor does not affect the particles during the intro. Visitors can press **Skip intro** or Esc.
2. **Scroll story**: the particles change shape for each of the six "What We Do" items (Technical Learning through
   Industry & Professional Development). The shapes are abstract decoration; the text comes from `frontend/src/data/home.json`.
3. **Cursor**: particles swirl out of the way around the pointer like a vortex, and the shape tilts toward it.
   **Clicking** empty space sends a gold shockwave ring through the particles.

**Every other page** gets its own formation in the header (`HeaderParticles.tsx`), which assembles from a scattered
cloud when the page opens and reacts to the cursor and clicks the same way. Change it with the `shape` prop on
`PageHeader`: `"rings"` (Events), `"constellation"` (Team, one cluster per team sized by real member counts),
`"sphere"` (About), `"helix"` (Resources), `"swarm"` (Join), `"ripple"` (Contact), `"fuzzy"` (Achievements),
plus `"neural"` and `"chaos"`.

**Across the site** (`frontend/src/components/Motion.tsx`): pages rise in when opened, sections reveal as you scroll
(`Reveal`), posters, team photos and cards tilt in 3D with a light glare (`Tilt`), event names race sideways with
your scroll (`Marquee`), a custom cursor with a gold dot, trailing ring and stardust trail grows over links, shows
a label over anything with `data-cursor="..."` (posters say "View"), bursts into sparks on click and turns into a
golden halo during the intro (`CursorAura`, mouse only; text fields keep the normal text cursor), and a
**back-to-top button** appears after scrolling, with a ring showing how far down you are (`BackToTop`).

Performance and accessibility are built in: animations pause when off screen or in a background tab, phones get
fewer particles, visitors with reduced motion turned on get still versions with no intro, touch devices skip the
mouse effects, and browsers without WebGL simply show the pages without particles.

**Common tweaks** (in `frontend/src/components/particles/ParticleStory.tsx`):
- Change the intro text: edit `["IEEE CIS", "REC"]` (desktop) and `["IEEE", "CIS", "REC"]` (phones).
- Change colours: edit the `COLORS` and `GLOW` lists (one pair per formation).
- Turn the intro off completely: in `ParticleStory.tsx` set `const playIntro = false`, and remove the `<script src="/intro.js">` line in `index.html`.
- Change the intro timing: `FORM` (gathering) and `HOLD` (how long the name stays), in milliseconds.
