import { useSearchParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import MemberCard from "../components/MemberCard";
import { Reveal } from "../components/Motion";
import { sessions } from "../lib/data";
import { useTitle } from "../lib/useTitle";
import { revealChip } from "../lib/motion";

export default function Team() {
  useTitle("Team");
  const [params, setParams] = useSearchParams();
  const session = sessions.find(s => s.id === params.get("year")) || sessions[0];
  const domain = params.get("domain") || "all";
  const groups = session.groups.filter(g => domain === "all" || g.slug === domain);
  const count = session.groups.reduce((n, g) => n + g.members.length, 0);
  const set = (k: string, v: string) => setParams(p => {
    if (v) p.set(k, v); else p.delete(k);
    if (k === "year") p.delete("domain");
    return p;
  }, { replace: true });

  return (
    <>
      <PageHeader
        title="Team"
        shape="constellation"
        below={sessions.length > 1 && (
          <label className="inline-flex items-center gap-3 text-[14px] text-mute">
            Academic year
            <select value={session.id} onChange={e => set("year", e.target.value === sessions[0].id ? "" : e.target.value)}
              className="min-h-[46px] rounded-full border border-line bg-panel px-5 pr-10 text-[15px] text-cream">
              {sessions.map(s => <option key={s.id} value={s.id}>{s.label}{s === sessions[0] ? " (latest)" : ""}</option>)}
            </select>
          </label>
        )}>
        {session.note || `${count} students across ${session.groups.length} teams run the chapter in ${session.label}.`}
      </PageHeader>

      <div className="wrap mt-10">
        {session.groups.length > 1 && (
          // One sideways-scrolling row on phones so member photos start on the first screen; wraps from sm up
          <div className="snap-row snap-row-fade flex gap-2 sm:flex-wrap" role="group" aria-label="Filter by team">
            <button aria-pressed={domain === "all"} className={`chip gap-1.5 ${domain === "all" ? "chip-on" : ""}`} onClick={e => { set("domain", ""); revealChip(e.currentTarget); }}>
              Everyone <span className="tabular-nums opacity-70">({count})</span>
            </button>
            {session.groups.map(g => (
              <button key={g.slug} aria-pressed={domain === g.slug} className={`chip gap-1.5 ${domain === g.slug ? "chip-on" : ""}`} onClick={e => { set("domain", g.slug); revealChip(e.currentTarget); }}>
                {g.domain} <span className="tabular-nums opacity-70">({g.members.length})</span>
              </button>
            ))}
          </div>
        )}

        {session.faculty.length > 0 && domain === "all" && (
          <section className="mt-14">
            <h2 className="mb-6 text-xl font-semibold">Faculty</h2>
            <div className="flex flex-wrap gap-4">
              {session.faculty.map(f => (
                <div key={f.name} className="rounded-2xl border border-line bg-panel px-6 py-4"><p className="font-semibold">{f.name}</p><p className="text-[15px] text-mute">{f.role}</p></div>
              ))}
            </div>
          </section>
        )}

        {groups.map(g => {
          const lead = g.slug === "management";
          return (
            <section key={g.slug} className="mt-16">
              <div className="mb-8 flex items-baseline gap-4 border-b border-line pb-4">
                <h2 className="text-2xl font-semibold">{g.domain}</h2>
                <span className="text-mute">{g.members.length}</span>
              </div>
              <div className={`grid gap-x-6 gap-y-10 ${lead ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"}`}>
                {g.members.map((m, i) => <Reveal key={m.name} delay={(i % 5) * 80}><MemberCard m={m} large={lead} /></Reveal>)}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
