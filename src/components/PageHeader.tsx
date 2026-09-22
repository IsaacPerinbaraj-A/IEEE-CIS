import type { ReactNode } from "react";
import HeaderParticles, { type HeaderShape } from "./particles/HeaderParticles";
import { RevealWords } from "./Motion";

// Phones: the violet glow is drawn as a radial gradient instead of a 120px blur filter, which is costly to paint on a
// phone GPU. The stops follow the alpha profile of the 440px disc blurred by 120px, and the 1000px circle keeps the
// same centre (92px in from the right edge, 60px below the top), so it looks the same.
const PHONE_GLOW = "max-sm:-right-[408px] max-sm:-top-[440px] max-sm:h-[1000px] max-sm:w-[1000px] max-sm:bg-transparent max-sm:filter-none " +
  "max-sm:bg-[radial-gradient(circle,rgba(139,92,246,.2)_0,rgba(139,92,246,.186)_80px,rgba(139,92,246,.14)_160px,rgba(139,92,246,.082)_240px,rgba(139,92,246,.036)_320px,rgba(139,92,246,.011)_400px,rgba(139,92,246,0)_500px)]";

export default function PageHeader({ title, children, aside, below, shape = "sphere" }: { title: string; children?: ReactNode; aside?: ReactNode; below?: ReactNode; shape?: HeaderShape }) {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div aria-hidden className={`pointer-events-none absolute -right-32 -top-40 h-[440px] w-[440px] rounded-full bg-violet/25 blur-[120px] ${PHONE_GLOW}`} />
      <div aria-hidden className="pointer-events-none absolute bottom-[-40%] right-[22%] h-[320px] w-[320px] rounded-full bg-[#DB2777]/15 blur-[120px] max-sm:hidden" />
      <HeaderParticles shape={shape} />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(15,10,28,.92)_0%,rgba(15,10,28,.6)_45%,rgba(15,10,28,0)_70%)] max-md:bg-[linear-gradient(90deg,rgba(15,10,28,.85)_0%,rgba(15,10,28,.35)_100%)]" />
      {/* Phones: a compact header (about 190px) so the page content starts on the first screen */}
      <div className="wrap relative flex min-h-[330px] flex-col justify-end gap-8 py-16 max-sm:min-h-0 max-sm:gap-6 max-sm:pb-8 max-sm:pt-10 md:min-h-[380px] md:flex-row md:items-end md:justify-between md:py-20">
        <div className="page-title">
          <RevealWords as="h1" text={title} className="h-page" />
          {children && <div className="lede mt-4">{children}</div>}
          {below && <div className="mt-6">{below}</div>}
        </div>
        {aside}
      </div>
    </section>
  );
}
