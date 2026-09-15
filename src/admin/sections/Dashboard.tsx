import { Link } from "react-router-dom";
import { CalendarDays, Users, Trophy, Settings, HelpCircle, BookOpen, UploadCloud } from "lucide-react";
import { useAdmin } from "../context";
import { PageTitle } from "../ui";
import { isUpcoming } from "../../lib/data";

export default function Dashboard() {
  const { content, dirty, images, backend } = useAdmin();
  const upcoming = content.events.filter(isUpcoming).length, people = content.team.sessions[0]?.groups.reduce((n, g) => n + g.members.length, 0) || 0;
  const pending = dirty.length + Object.keys(images).length;
  const cards = [
    { to: "events", Icon: CalendarDays, title: "Events", text: `${upcoming} upcoming, ${content.events.length - upcoming} past` },
    { to: "team", Icon: Users, title: "Team", text: `${people} members in ${content.team.sessions[0]?.label || "the latest year"}` },
    { to: "achievements", Icon: Trophy, title: "Achievements", text: content.achievements.length ? `${content.achievements.length} listed` : "None yet" },
    { to: "site", Icon: Settings, title: "Site settings", text: "Email, social links, membership form" },
    { to: "faqs", Icon: HelpCircle, title: "FAQs", text: `${content.faqs.length} questions` },
    { to: "resources", Icon: BookOpen, title: "Resources", text: `${content.resources.reduce((n, r) => n + r.links.length, 0)} links` },
  ];
  return (
    <>
      <PageTitle title="Welcome back">Edit anything below. Nothing changes on the live site until you publish.</PageTitle>
      {pending > 0 && (
        <Link to="publish" className="mb-6 flex items-center gap-4 rounded-2xl border border-gold/50 bg-gold/10 p-5 transition-colors hover:bg-gold/15">
          <UploadCloud className="shrink-0 text-gold" />
          <span className="flex-1"><span className="block font-medium">You have unpublished changes</span><span className="text-[15px] text-mute">{pending} {pending === 1 ? "item" : "items"} waiting. Review and publish them when you're ready.</span></span>
        </Link>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ to, Icon, title, text }) => (
          <Link key={to} to={to} className="adm-card group transition-colors hover:border-violet-soft hover:bg-raised">
            <Icon className="text-violet-soft" />
            <span className="mt-4 block font-display text-lg font-semibold">{title}</span>
            <span className="mt-1 block text-[15px] text-mute">{text}</span>
          </Link>
        ))}
      </div>
      <div className="adm-card mt-8 text-[15px] text-mute">
        <p className="font-medium text-cream">How publishing works</p>
        <p className="mt-2">{backend.kind === "github"
          ? "Publishing saves your changes to the site's GitHub repository in a single update. The hosting service then rebuilds the site, which usually takes a minute or two."
          : backend.kind === "local"
            ? "You're editing the project files on this computer. Publishing writes the files; commit and push them with Git to put them online."
            : "You're offline. Publishing downloads the changed files so someone with repository access can upload them."}</p>
      </div>
    </>
  );
}
