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
          ? <p className="text-mute">Achievements are being added. Check back soon.</p>
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
