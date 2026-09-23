import { Link } from "react-router-dom";
import { RevealWords } from "../components/Motion";
import { useTitle } from "../lib/useTitle";
import { useMediaQuery, PHONE } from "../lib/useMediaQuery";
import HeaderParticles from "../components/particles/HeaderParticles";

const TITLE = "This page doesn't exist";
const TEXT = "The link may be old, or the page may have moved. Like these particles, it got scattered. Try one of these instead.";

export default function NotFound() {
  useTitle("Page not found", undefined, true);
  const phone = useMediaQuery(PHONE);
  return (
    <section className="relative overflow-hidden">
      <HeaderParticles shape="chaos" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(15,10,28,.9)_0%,rgba(15,10,28,.4)_60%,rgba(15,10,28,0)_100%)]" />
    {phone ? (
      // Phones: one full screen under the header, with the ways out at the bottom, within thumb reach
      <div className="wrap relative flex min-h-[calc(100svh-68px)] flex-col pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-10">
        <div className="my-auto py-6">
          <p className="font-display text-[88px] font-semibold leading-none text-violet-soft">404</p>
          <RevealWords as="h1" text={TITLE} className="h-page mt-5" />
          <p className="lede mt-4">{TEXT}</p>
        </div>
        <div className="flex flex-col gap-3">
          <Link to="/" className="btn-gold min-h-[48px] w-full">Go to the home page</Link>
          <Link to="/events" className="btn-ghost min-h-[48px] w-full bg-ink/40">See events</Link>
        </div>
        <nav aria-label="Other pages" className="mt-4 flex gap-2">
          <Link to="/team" className="chip min-h-[44px] flex-1 justify-center bg-ink/40">Team</Link>
          <Link to="/join" className="chip min-h-[44px] flex-1 justify-center bg-ink/40">Join</Link>
          <Link to="/contact" className="chip min-h-[44px] flex-1 justify-center bg-ink/40">Contact</Link>
        </nav>
      </div>
    ) : (
    <div className="wrap relative flex min-h-[70vh] flex-col items-start justify-center py-24">
      <p className="font-display text-7xl font-semibold text-violet-soft">404</p>
      <RevealWords as="h1" text={TITLE} className="h-page mt-6" />
      <p className="lede mt-4">{TEXT}</p>
      <div className="mt-8 flex flex-wrap gap-3"><Link to="/" className="btn-gold">Go to the home page</Link><Link to="/events" className="btn-ghost">See events</Link></div>
    </div>
    )}
    </section>
  );
}
