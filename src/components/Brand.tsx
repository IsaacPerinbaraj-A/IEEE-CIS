/** The CIS logo has black lettering, so it always sits on a light tile to stay readable on dark backgrounds. */
export function CisLogoTile({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-xl bg-cream px-3 py-2 ${className}`}>
      <img src="/brand/ieee-logo.svg" alt="IEEE Computational Intelligence Society" className="h-10 w-auto" width={150} height={40} />
    </span>
  );
}
export function RecMark({ className = "h-9 w-9" }: { className?: string }) {
  return <img src="/brand/rec-main-logo.png" alt="" className={`${className} object-contain`} width={36} height={36} />;
}
