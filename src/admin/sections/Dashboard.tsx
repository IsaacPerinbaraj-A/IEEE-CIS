import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Users, Trophy, Settings, HelpCircle, BookOpen, UploadCloud, UserPlus, Home, History } from "lucide-react";
import { LIMITS, type PublishStatus } from "../../../shared/api.ts";
import { useAdmin } from "../context";
import { api, paths } from "../api";
import { ago, daysSince, dateTime } from "../format";
import { LiveLine } from "../LiveStatus";
import { Notice, PageTitle } from "../ui";
import { isUpcoming } from "../../lib/data";

export default function Dashboard() {
  const { content, dirty, live, me, owner, initialised } = useAdmin();
  const [status, setStatus] = useState<PublishStatus | null>(null);
  useEffect(() => {
    if (!initialised) return;
    const ctrl = new AbortController();
    api<PublishStatus>(paths.publishStatus, { signal: ctrl.signal }).then(setStatus).catch(() => { /* the card falls back to what the content said */ });
    return () => ctrl.abort();
  }, [initialised, live.release]);

  const upcoming = content.events.filter(isUpcoming).length, people = content.team.sessions[0]?.groups.reduce((n, g) => n + g.members.length, 0) || 0;
  const cards = [
    { to: "home", Icon: Home, title: "Home page", text: `Hero, About and ${content.home.whatWeDo.items.length} What We Do items` },
    { to: "events", Icon: CalendarDays, title: "Events", text: `${upcoming} upcoming, ${content.events.length - upcoming} past` },
    { to: "team", Icon: Users, title: "Team", text: `${people} members in ${content.team.sessions[0]?.label || "the latest year"}` },
    { to: "achievements", Icon: Trophy, title: "Milestones", text: content.achievements.length ? `${content.achievements.length} listed` : "None yet" },
    { to: "site", Icon: Settings, title: "Site settings", text: "Email, social links, membership form" },
    { to: "join", Icon: UserPlus, title: "Join page", text: `${content.join.steps.length} steps, ${content.join.benefits.length} benefits` },
    { to: "faqs", Icon: HelpCircle, title: "FAQs", text: `${content.faqs.length} questions` },
    { to: "resources", Icon: BookOpen, title: "Resources", text: `${content.resources.reduce((n, r) => n + r.links.length, 0)} links` },
  ];
  const latest = status && status.release >= live.release ? status : null;
  const release = latest?.release ?? live.release, by = latest?.publishedBy ?? live.publishedBy, at = latest?.publishedAt ?? live.publishedAt;
  const backupDays = owner ? daysSince(owner.lastBackupAt) : 0;

  return (
    <>
      <PageTitle title={`Welcome back, ${me.name.split(" ")[0] || me.name}`}>Edit anything below. Nothing changes on the live site until you publish.</PageTitle>

      {owner?.setupTokenActive && (
        <Notice tone="warn" className="mb-6" title="Remove the setup token">
          SETUP_TOKEN is still set in the admin server's settings on Render. Your account is set up, so delete it there. You can add a new one later if you ever need to reset your own passphrase.
        </Notice>
      )}
      {owner && initialised && backupDays > LIMITS.backupReminderDays && (
        <Notice tone="warn" className="mb-6" title={owner.lastBackupAt ? `The last backup was ${ago(owner.lastBackupAt)}` : "No backup downloaded yet"}
          actions={<Link to="/admin/accounts" className="btn-ghost btn-sm min-h-[44px] sm:min-h-[38px]">Go to backups</Link>}>
          The free database has no automatic backups. Download one from Accounts and save it to the club's Drive once a month.
        </Notice>
      )}

      {!initialised ? (
        <div className="adm-card mb-6 text-[15px] text-mute">
          <p className="font-medium text-cream">Nothing is published yet</p>
          <p className="mt-2">{me.role === "owner"
            ? <>Open <Link to="/admin/accounts" className="link">Accounts</Link> and choose Import starting content. It loads the site's current content as release #1, and then everyone can start editing.</>
            : "Ask the web lead to import the starting content. Then reload this page."}</p>
        </div>
      ) : (
        <>
          {dirty.length > 0 && (
            <Link to="publish" className="mb-6 flex items-center gap-4 rounded-2xl border border-gold/50 bg-gold/10 p-5 transition-colors hover:bg-gold/15">
              <UploadCloud className="shrink-0 text-gold" />
              <span className="flex-1"><span className="block font-medium">You have unpublished changes</span><span className="text-[15px] text-mute">{dirty.length} {dirty.length === 1 ? "section" : "sections"} changed. They're saved on this device until you publish.</span></span>
            </Link>
          )}
          <div className="adm-card mb-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">Last publish: release #{release}</p>
                <p className="text-[15px] text-mute">{[by && `by ${by}`, at && `${ago(at)} (${dateTime(at)})`].filter(Boolean).join(", ")}</p>
              </div>
              <Link to="/admin/history" className="btn-ghost btn-sm min-h-[44px] sm:min-h-[38px]"><History size={15} /> History</Link>
            </div>
            <LiveLine key={`${release}:${latest?.deploy?.at ?? ""}`} release={release} deploy={latest?.deploy ?? null} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map(({ to, Icon, title, text }) => (
              <Link key={to} to={to} className="adm-card group transition-colors hover:border-violet-soft hover:bg-raised">
                <Icon className="text-violet-soft" />
                <span className="mt-4 block font-display text-lg font-semibold">{title}</span>
                <span className="mt-1 block text-[15px] text-mute">{text}</span>
              </Link>
            ))}
          </div>
        </>
      )}
      <div className="adm-card mt-8 text-[15px] text-mute">
        <p className="font-medium text-cream">How publishing works</p>
        <p className="mt-2">Your edits are saved on this device until you publish. Publishing saves them as a new numbered release, then the site rebuilds, which takes one to three minutes. If someone else published in the meantime, changes to different items are combined. Every release stays in History, so an earlier one can be made live again.</p>
      </div>
    </>
  );
}
