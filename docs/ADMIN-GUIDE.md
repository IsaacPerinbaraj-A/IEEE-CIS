# Admin guide

For office bearers who update the website, and for the web lead who looks after it. Setting the admin up for the
first time is in [SETUP.md](SETUP.md).

## Opening the admin

Go to **`<site address>/admin`** on a phone or laptop.

After a quiet spell you'll see **"Waking the server (up to a minute)"**. The free admin server sleeps after 15
minutes without use; wait and it continues on its own. Visitors to the website are never affected by this.

## Signing in

- Everyone has their own **username and passphrase**. There's no sign-up page: the web lead sends you a one-time
  invite link. Open it within 72 hours, choose your passphrase, and you're signed in.
- **Passphrase:** at least 15 characters. A few random words ("mango lantern orbit seven") are easy to type and hard
  to guess. Passphrases that have appeared in known data leaks, or that are built from words like ieee, cis, rec,
  rajalakshmi or admin, are refused. A password manager can remember it for you; pasting is fine.
- **Forgot it?** Ask the web lead for a reset link. Your old passphrase keeps working until you use the link.
- **Change it:** **Change passphrase** in the admin. Your other signed-in devices are signed out.
- After several wrong tries the admin makes you wait before trying again (a few minutes at most). It never locks you
  out for good.
- You're signed out after **60 minutes without activity** or **12 hours** in total. Your unpublished changes stay on
  the device; sign in again to continue.

## Editing

- Pick a section in the sidebar: **Events**, **Team**, **Milestones**, **Site settings**, **Join page**, **FAQs**,
  **Resources** or **Home page**. Each form shows a live preview.
- **Your changes save on this device automatically**, for your account in this browser, until you publish. Other
  editors don't see them, and they don't carry over to your other devices. Don't clear the browser's data before you
  publish.
- A note such as "Priya is editing Events" tells you someone else has that section open. You can still edit: when you
  both publish, changes to different items are combined.
- **Photos** are prepared in your browser before upload: member photos are framed as a square (drag and zoom) and
  saved at 480 × 480; posters are resized to 900 px wide.
- **Home page:** the hero (the first screen), About the Society and What We Do. What We Do needs at least 6 items,
  because the Home scroll story shows the first six, one shape each.
- **Team:** the first academic year is the one the Team page shows. **New academic year** copies the team names and
  faculty so you only change the people.
- Forms check your entries after the first time you save, and tell you in plain words what to fix.

## Publishing

1. Open **Publish** (or **Review and publish**). It lists what you changed, for example "1 event added, 2 members
   edited".
2. Add a short note if it helps others ("Added the ANALYTICA poster") and press **Publish**.
3. You see "Saved as release #14", then **"Rebuilding the site (1–3 min)"**, then **"Live"**. Visitors see the
   change once it says Live.

**If someone else published while you were editing:**
- Changes to *different* items (another event, another member) are combined automatically. Nothing to do.
- If you both changed the *same* item, the admin shows who changed it and when, and offers:
  - **Load theirs:** take their version of those items and keep all your other changes. Check, then publish again.
  - **Publish mine anyway:** your version of those items goes live; their changes to other items are kept.

  Both are safe, because every release is kept in History.

**"Saved as release #N but the rebuild didn't start":** your changes are saved. Press **Try again**. If it keeps
failing, tell the web lead.

## History and undo

**History** lists every release: its number, who published it, when, and what changed.

- **Make it live** makes an old release live again, all sections.
- **Restore this section** brings back just one section (for example Events) from an old release.

Either way the admin creates a *new* release. Nothing is ever erased, so an undo can be undone too.

An old release that breaks today's content rules (for example a link that isn't a full link) can't be made live
again: the site build would refuse it. The admin lists what breaks the rules; fix those items in the editor and
publish instead.

## Messages you might see

| Message | What it means | What to do |
|---|---|---|
| Waking the server (up to a minute) | The free admin server was asleep | Wait |
| The database is paused | The database sleeps after 30 days without use | Ask the web lead to resume it (below). Your unpublished changes stay on the device |
| Your session has ended. Sign in again | 60 minutes idle or 12 hours in total | Sign in; your changes are still there |
| That username and passphrase don't match | Wrong username or passphrase (the message never says which) | Check both; ask for a reset link if needed |
| Too many attempts | Several wrong passphrases in a row | Wait the time shown |
| The rebuild didn't start | Saved, but Vercel wasn't reached | Press Try again |

---

## For the web lead (owner)

There is one owner account. It can do everything editors can, plus the **Accounts** page.

### Accounts

- **Invite someone:** username (what they type to sign in, for example `priya.s`) and name (shown in History) →
  **Create invite link**. Send the link privately (a direct message, not a group). It works once and expires after
  72 hours. New accounts are always editors.
- **Reset link:** for someone who forgot their passphrase. Same rules as an invite.
- **Deactivate:** for someone who has left. It signs them out everywhere and cancels their links. **Reactivate**
  undoes it. Accounts are never deleted, so History keeps their name.
- **Activity log:** sign-ins, failed sign-ins, publishes, undos, invites, uploads and backups, kept for a year.
  Failed sign-ins show the account's username, or "(unknown username)" when the name typed isn't an account, so a
  passphrase typed into the wrong box is never saved.

### Backups (monthly, and at every handover)

The free database has **no automatic backups**. Once a month, and whenever the team changes:

1. **Accounts** → **Backups** → **Download backup**. The file holds every release and every photo (not accounts or
   passphrases).
2. Save it to the club Drive, in a "Website backups" folder, with its date in the name.

The admin reminds you when the last backup is more than 30 days old.

**Import a backup** makes the content that was live in that backup live again, as a new release. It adds the
backup's photos and removes nothing. If the backup's content breaks today's rules, the admin lists what to fix:
fix it in the editors and publish. The site isn't rebuilt until that publish.

### When something is down

| Situation | What visitors see | What to do |
|---|---|---|
| **Database paused** (Atlas pauses the free cluster after 30 days with no use, for example over the holidays, and emails the club address 7 days before) | Nothing changes: the site keeps working | Sign in at <https://cloud.mongodb.com> → the project → the `cis` cluster → **Resume**. It takes a few minutes |
| **A rebuild didn't start** | The previous content | **Try again** in the admin, or Vercel → **Deployments** → **Redeploy** |
| **A build failed** | The previous site stays online | Vercel → **Deployments** → the failed one → **Build Logs**. Lines starting with `fetch-content:` say what is wrong, for example a link that isn't a full link. Fix it in the admin and publish again |
| **The admin server is down** | Nothing changes | Render dashboard → the service → **Logs** and **Events**. **Manual Deploy** → **Deploy latest commit** restarts it |

If a build can't reach the admin server, it rebuilds with the content that is live right now. That lets code
changes go out, and content never goes back to old files. A new publish goes live at the next build that can reach
the server.

### Free plan limits worth knowing

- **Render:** the server sleeps after 15 minutes idle; 750 hours a month is enough for one service. Never set up a
  "keep awake" ping.
- **Atlas:** 512 MB (the content and photos are a few MB). No automatic backups; pauses after 30 days unused.
- **Vercel:** 100 GB of traffic a month; non-commercial use only (no ads or ticket sales on the site).

### Removing a photo completely

Removing a photo in the admin takes it off the site at the next rebuild. Old releases and backups still contain it,
so it can be restored. Photos from the starting copy are also files in the repository (`frontend/public/images`); if someone
asks for their photo to be taken down for good, also delete that file from the repository.

### Yearly handover checklist

- [ ] Download a backup and save it to the club Drive.
- [ ] Give the next web lead the club email, the password manager, and the Render and Vercel logins (club accounts).
- [ ] Atlas: add them as **Project Owner** (**Access Manager**), then remove people who have left.
- [ ] GitHub: give them access to the repository.
- [ ] **Hand over the owner account:** add a new `SETUP_TOKEN` in Render → **Environment**. The new web lead opens
      `<site>/admin/setup/owner#<that token>` and chooses their own passphrase. The old passphrase stops working and
      its sessions end. Then remove `SETUP_TOKEN` from Render.
- [ ] Deactivate the accounts of office bearers who have left, and invite the new ones.
- [ ] If someone leaving knew the secrets, change them (the "Changing a secret" note in [SETUP.md](SETUP.md)).
- [ ] Add the new academic year in **Team** (**New academic year**) and publish.
- [ ] Check that Render, Vercel and Atlas still offer the free plans described here.
