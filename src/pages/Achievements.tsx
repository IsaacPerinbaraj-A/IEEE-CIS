import { Link } from "react-router-dom";
import { Trophy } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { achievements } from "../lib/data";
import { useTitle } from "../lib/useTitle";

export default function Achievements() {
  useTitle("Achievements");
  return (
    <>
      <PageHeader title="Achievements" shape="fuzzy">Wins, papers and milestones from our members.</PageHeader>
      <div className="wrap mt-12">
        {achievements.length === 0
          ? (
            <div role="status" className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-violet-deep/40 via-panel to-ink p-8 sm:p-12">
              <div aria-hidden className="absolute -right-20 -top-20 h-64 w-64 rounded-full border-[22px] border-gold/60 sm:h-80 sm:w-80" />
              <div className="relative max-w-[56ch]">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-raised text-violet-soft"><Trophy size={22} aria-hidden /></span>
                <h2 className="mt-6 text-2xl font-semibold sm:text-3xl">Nothing listed yet</h2>
                <p className="mt-3 text-mute">Achievements are being added. Check back soon.</p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link className="btn-ghost" to="/events?tab=past">See past events</Link>
                  <Link className="btn-ghost" to="/team">Meet the team</Link>
                </div>
              </div>
            </div>
          )
          : <ol className="relative space-y-10 border-l border-line pl-8">
              {achievements.map(a => (
                <li key={a.title} className="relative">
                  <span aria-hidden className="absolute -left-[39px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-gold bg-ink" />
                  <p className="text-[15px] text-gold">{a.year}</p>
                  <h2 className="mt-1 text-xl font-semibold">{a.title}</h2>
                  {a.people && <p className="mt-1 text-[15px] text-violet-soft">{a.people}</p>}
                  <p className="mt-2 max-w-[62ch] text-mute">{a.description}</p>
                  {a.image && <img src={a.image} alt="" loading="lazy" className="mt-4 max-h-72 rounded-2xl border border-line object-cover" />}
                  {a.link && <a className="link mt-2 inline-block" href={a.link} target="_blank" rel="noopener">Read more</a>}
                </li>
              ))}
            </ol>}
      </div>
    </>
  );
}
