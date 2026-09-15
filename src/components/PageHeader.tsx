import type { ReactNode } from "react";
import HeaderParticles, { type HeaderShape } from "./particles/HeaderParticles";
import { RevealWords } from "./Motion";

export default function PageHeader({ title, children, aside, below, shape = "sphere" }: { title: string; children?: ReactNode; aside?: ReactNode; below?: ReactNode; shape?: HeaderShape }) {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div aria-hidden className="pointer-events-none absolute -right-32 -top-40 h-[440px] w-[440px] rounded-full bg-violet/25 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute bottom-[-40%] right-[22%] h-[320px] w-[320px] rounded-full bg-[#DB2777]/15 blur-[120px]" />
      <HeaderParticles shape={shape} />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(15,10,28,.92)_0%,rgba(15,10,28,.6)_45%,rgba(15,10,28,0)_70%)] max-md:bg-[linear-gradient(90deg,rgba(15,10,28,.85)_0%,rgba(15,10,28,.35)_100%)]" />
      <div className="wrap relative flex min-h-[330px] flex-col justify-end gap-8 py-16 md:min-h-[380px] md:flex-row md:items-end md:justify-between md:py-20">
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
