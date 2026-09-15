import PageHeader from "../components/PageHeader";
import resources from "../data/resources.json";
import { ExternalLink } from "lucide-react";
import { useTitle } from "../lib/useTitle";
import { Reveal, Tilt } from "../components/Motion";

export default function Resources() {
  useTitle("Resources");
  return (
    <>
      <PageHeader title="Resources" shape="helix">Free, trustworthy places to keep learning after a workshop, sorted by domain.</PageHeader>
      <div className="wrap mt-6">
        {resources.map(r => (
          <Reveal as="section" key={r.domain} className="grid gap-6 border-b border-line py-12 lg:grid-cols-[280px_1fr]">
            <h2 className="text-xl font-semibold">{r.domain}</h2>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {r.links.map(l => (
                <li key={l.url}>
                  <Tilt className="h-full rounded-2xl" max={7}><a href={l.url} target="_blank" rel="noopener" className="group flex h-full flex-col rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-violet-soft hover:bg-raised">
                    <span className="flex items-start justify-between gap-3 font-medium">{l.title}<ExternalLink size={16} className="mt-1 shrink-0 text-mute group-hover:text-violet-soft" /></span>
                    <span className="mt-2 text-[15px] text-mute">{l.note}</span>
                  </a></Tilt>
                </li>
              ))}
            </ul>
          </Reveal>
        ))}
      </div>
    </>
  );
}
