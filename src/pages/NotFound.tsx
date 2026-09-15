import { Link } from "react-router-dom";
import { RevealWords } from "../components/Motion";
import { useTitle } from "../lib/useTitle";
import HeaderParticles from "../components/particles/HeaderParticles";
export default function NotFound() {
  useTitle("Page not found");
  return (
    <section className="relative overflow-hidden">
      <HeaderParticles shape="chaos" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(15,10,28,.9)_0%,rgba(15,10,28,.4)_60%,rgba(15,10,28,0)_100%)]" />
    <div className="wrap relative flex min-h-[70vh] flex-col items-start justify-center py-24">
      <p className="font-display text-7xl font-semibold text-violet-soft">404</p>
      <RevealWords as="h1" text="This page doesn't exist" className="h-page mt-6" />
      <p className="lede mt-4">The link may be old, or the page may have moved. Like these particles, it got scattered. Try one of these instead.</p>
      <div className="mt-8 flex flex-wrap gap-3"><Link to="/" className="btn-gold">Go to the home page</Link><Link to="/events" className="btn-ghost">See events</Link></div>
    </div>
    </section>
  );
}
