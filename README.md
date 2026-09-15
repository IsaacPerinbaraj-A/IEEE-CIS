# IEEE CIS REC website

The website of the IEEE Computational Intelligence Society student chapter at Rajalakshmi Engineering College.
Built with React, TypeScript, Vite and Tailwind CSS.

## Run it on your computer

You need Node.js 20 or newer.

```bash
npm install
npm run dev       # opens a live preview at http://localhost:5173
npm run build     # makes the final site in the dist/ folder
```

## Put it online

**Netlify or Vercel (recommended):** connect this GitHub repository. Build command `npm run build`, output folder `dist`.
The files `public/_redirects` (Netlify) and `vercel.json` (Vercel) are already set up so links like `/events/rewired` work.

**GitHub Pages:** it can't handle page links on its own. In `src/App.tsx`, change `BrowserRouter` to `HashRouter`
(both in the import line and in the JSX). Links will then look like `/#/events`.

After that, every change pushed to GitHub redeploys the site automatically. Nobody needs a login or an admin page.

---

## Admin page (the easy way to update the site)

Open **`/admin`** on the live site (for example `https://your-site.netlify.app/admin`). From there you can add and edit
events and posters, update the team (names, roles, photos, links, new academic years), achievements, site settings,
FAQs and resources. Every form shows a live preview. **Nothing changes on the site until you press Publish**, which
saves everything to GitHub in one update; the host then rebuilds the site in a minute or two.

Photos are processed in your browser before upload: member photos are framed as a square (drag and zoom) and saved as
480 × 480 WebP, posters are resized to 900 px wide. A 5 MB phone photo ends up around 20–60 KB.

### One-time setup (web lead)

1. Put this project in a GitHub repository and connect it to Netlify or Vercel (see "Put it online").
2. In `src/data/admin.json`, set `"repo"` to the repository, for example `"ieee-cis-rec/website"`, and `"branch"`
   to the branch the host deploys (usually `main`). Commit and push.
3. Add each office bearer who should edit the site as a collaborator on the repository
   (GitHub repository → Settings → Collaborators → Add people, with Write access).

### Signing in (each editor)

Each editor creates their own **fine-grained personal access token** on GitHub:
Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token →
Repository access: *Only select repositories* (pick the website) → Permissions: **Contents: Read and write** → Generate.
Paste it on the `/admin` sign-in screen. The token stays in that browser tab (or on that device if you tick
"Keep me signed in"). It is never part of the website's code. Remove someone's access by removing them as a
collaborator, or they can delete their token on GitHub.

### Other ways to use the admin

- **Local mode:** when you run `npm run dev`, `/admin` offers "Edit the files on this computer". Changes save
  straight into `src/data/` and `public/images/`; commit and push them with Git. (This is handled by
  `admin-local-backend.ts`, which only exists in the dev server, never in the built site.)
- **Offline mode:** "Continue without signing in" lets anyone draft changes; Publish then downloads the changed
  files so someone with access can upload them to the same folders in GitHub.

### Good to know

- If someone else published while you were editing, the admin warns you before replacing their changes.
- Closing the tab with unpublished changes asks for confirmation. Drafts are not saved anywhere until you publish.
- Replaced photos and posters stay in the repository as old files; delete them in GitHub if you want to tidy up.
- The admin is excluded from search engines (`robots.txt` and a `noindex` tag) and is loaded separately, so
  visitors never download it.

## Updating the site by hand

All content lives in `src/data/`. The admin page edits these same files for you; this section is for people who
prefer editing them directly. You only edit these files, never the design code.
After editing, check it with `npm run dev`, then push to GitHub.

### Add an event: `src/data/events.json`

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

### Update the team: `src/data/team.json`

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
- `achievements.json` holds wins, papers and awards. It's empty now; once you add one entry, an "Achievements" link appears in the menu.
  Example: `{ "title": "SIH 2025 finalists", "year": "2025", "people": "Team names", "description": "...", "link": "" }`
- `faqs.json` holds the questions on the Join page.
- `resources.json` holds the learning links on the Resources page.

## Images

Large photos make the site slow on mobile data. Before adding images:

- **Team photos:** square, about 480 × 480 px, face in the middle. Save as `.webp` in `public/images/team/`.
- **Posters:** at most 900 px wide, `.webp`, in `public/images/events/`.
- Aim for under 150 KB each. Free tool: https://squoosh.app

Use lowercase file names with dashes, and no spaces.

## Layout on different screens

The home page and page headers are fully responsive. The home page switches between **side by side** (text left,
3D shape right) and **stacked** (shape above the text) using one media query that lives in two places and must stay
identical: `SIDE_QUERY` in `src/components/particles/layout.ts` and the matching `@media` block in `src/index.css`.
The 3D shapes measure the page's content column and use `fitShape()` to stay fully inside the free space, allowing
for perspective, so they never run off the screen edge or under the text.

## Where things are

```
src/data/                  content (edited by the admin, or by hand); admin.json = repository for the admin
src/pages/                 one file per page
src/components/            shared pieces: navbar, footer, cards, motion effects
src/components/particles/  3D engine, formations, home story, header particles, layout fitting
src/admin/                 the /admin page: sign-in, editors, GitHub/local/offline publishing, image processing
src/lib/                   data loading, date formatting, calendar files, icons
public/images/             team photos, posters, achievement photos
public/brand/              REC and IEEE CIS logos
admin-local-backend.ts     dev-server-only file access for the admin's local mode
```

## Animations and 3D effects

The site runs a small custom 3D engine (`src/components/particles/`, written directly in WebGL, no three.js).

**Landing page** (`ParticleStory.tsx`)
1. **Intro**: plays every time the home page is loaded or refreshed (not when you come back to it from another page
   of the site). A scattered cloud gathers into "IEEE CIS REC", holds with the society name underneath, then bursts
   into the hero globe. The cursor does not affect the particles during the intro. Visitors can press **Skip intro** or Esc.
2. **Scroll story**: the particles change shape for each of the six "What We Do" items (Technical Learning through
   Industry & Professional Development). The shapes are abstract decoration; the text comes from `src/data/home.json`.
3. **Cursor**: particles swirl out of the way around the pointer like a vortex, and the shape tilts toward it.
   **Clicking** empty space sends a gold shockwave ring through the particles.

**Every other page** gets its own formation in the header (`HeaderParticles.tsx`), which assembles from a scattered
cloud when the page opens and reacts to the cursor and clicks the same way. Change it with the `shape` prop on
`PageHeader`: `"rings"` (Events), `"constellation"` (Team, one cluster per team sized by real member counts),
`"sphere"` (About), `"helix"` (Resources), `"swarm"` (Join), `"ripple"` (Contact), `"fuzzy"` (Achievements),
plus `"neural"` and `"chaos"`.

**Across the site** (`src/components/Motion.tsx`): pages rise in when opened, sections reveal as you scroll
(`Reveal`), posters, team photos and cards tilt in 3D with a light glare (`Tilt`), event names race sideways with
your scroll (`Marquee`), a custom cursor with a gold dot, trailing ring and stardust trail grows over links, shows
a label over anything with `data-cursor="..."` (posters say "View"), bursts into sparks on click and turns into a
golden halo during the intro (`CursorAura`, mouse only; text fields keep the normal text cursor), and a
**back-to-top button** appears after scrolling, with a ring showing how far down you are (`BackToTop`).

Performance and accessibility are built in: animations pause when off screen or in a background tab, phones get
fewer particles, visitors with reduced motion turned on get still versions with no intro, touch devices skip the
mouse effects, and browsers without WebGL simply show the pages without particles.

**Common tweaks** (in `src/components/particles/ParticleStory.tsx`):
- Change the intro text: edit `["IEEE CIS", "REC"]` (desktop) and `["IEEE", "CIS", "REC"]` (phones).
- Change colours: edit the `COLORS` and `GLOW` lists (one pair per formation).
- Turn the intro off completely: in `ParticleStory.tsx` set `const playIntro = false`, and remove the `<script>` block in `index.html`.
- Change the intro timing: `FORM` (gathering) and `HOLD` (how long the name stays), in milliseconds.
