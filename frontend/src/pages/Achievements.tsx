import { Link } from "react-router-dom";
import { Trophy } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { achievements } from "../lib/data";
import { useTitle } from "../lib/useTitle";
import { useMediaQuery, PHONE } from "../lib/useMediaQuery";
import { Reveal } from "../components/Motion";

export default function Achievements() {
  useTitle("Milestones", "Wins, papers and milestones from IEEE CIS REC members.");
  const phone = useMediaQuery(PHONE);
  const empty = (
    <div role="status" className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-violet-deep/40 via-panel to-ink p-8 max-sm:p-5 sm:p-12">
      <div aria-hidden className="absolute -right-20 -top-20 h-64 w-64 rounded-full border-[22px] border-gold/60 sm:h-80 sm:w-80" />
      <div className="relative max-w-[56ch]">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-raised text-violet-soft"><Trophy size={22} aria-hidden /></span>
        <h2 className="mt-6 text-2xl font-semibold sm:text-3xl">Nothing listed yet</h2>
        <p className="mt-3 text-mute">Milestones are being added. Check back soon.</p>
        {/* Phones: two equal buttons side by side, full width one above the other where both labels don't fit in a row */}
        <div className="mt-7 flex flex-wrap gap-3 max-sm:grid max-sm:grid-cols-2 max-sm:gap-2 max-[389px]:grid-cols-1">
          <Link className="btn-ghost max-sm:min-h-[48px] max-sm:whitespace-nowrap max-sm:px-3" to="/events?tab=past">See past events</Link>
          <Link className="btn-ghost max-sm:min-h-[48px] max-sm:whitespace-nowrap max-sm:px-3" to="/team">Meet the team</Link>
        </div>
      </div>
    </div>
  );
  return (
    <>
      <PageHeader title="Milestones" shape="fuzzy">Wins, papers and milestones from our members.</PageHeader>
      <div className="wrap mt-12 max-sm:mt-8">
        {achievements.length === 0
          ? (phone ? <Reveal>{empty}</Reveal> : empty)
          : <ol className="relative space-y-10 border-l border-line pl-8">
              {achievements.map((a, i) => {
                // Phones: images keep a 16:9 box while they load, and "Read more" is a full-size tap target
                const body = (<>
                  <span aria-hidden className="absolute -left-[39px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-gold bg-ink" />
                  <p className="text-[15px] text-gold">{a.year}</p>
                  <h2 className="mt-1 text-xl font-semibold">{a.title}</h2>
                  {a.people && <p className="mt-1 text-[15px] text-violet-soft">{a.people}</p>}
                  <p className="mt-2 max-w-[62ch] text-mute">{a.description}</p>
                  {a.image && <img src={a.image} alt="" loading="lazy" onError={ev => { ev.currentTarget.hidden = true; }} className="mt-4 max-h-72 rounded-2xl border border-line object-cover max-sm:aspect-video max-sm:max-h-none max-sm:w-full" />}
                  {a.link && <a className="link mt-2 inline-block max-sm:inline-flex max-sm:min-h-[44px] max-sm:items-center" href={a.link} target="_blank" rel="noopener">Read more</a>}
                </>);
                return phone
                  ? <Reveal as="li" key={a.title} delay={Math.min(i, 2) * 80} className="relative">{body}</Reveal>
                  : <li key={a.title} className="relative">{body}</li>;
              })}
            </ol>}
      </div>
    </>
  );
}
