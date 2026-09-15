
/** Small line drawings for the four areas of computational intelligence. Gold marks "the best": the output, the fittest, the goal. */
export function AreaGlyph({ kind }: { kind: "neural" | "fuzzy" | "evolution" | "swarm" }) {
  const common = { viewBox: "0 0 64 64", className: "h-14 w-14 text-violet-soft", "aria-hidden": true } as const;
  if (kind === "neural") return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 18 32 10M10 18 32 32M10 18 32 54M10 46 32 10M10 46 32 32M10 46 32 54M32 10 54 32M32 32 54 32M32 54 54 32" strokeOpacity=".45" />
      {[[10, 18], [10, 46], [32, 10], [32, 32], [32, 54]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="5" fill="#0F0A1C" />)}
      <circle cx="54" cy="32" r="5" fill="#F2B544" stroke="#F2B544" />
    </svg>);
  if (kind === "fuzzy") return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M4 52H60" strokeOpacity=".45" /><path d="M4 52 18 14 32 52" /><path d="M18 52 32 14 46 52" stroke="#F2B544" /><path d="M32 52 46 14 60 52" />
    </svg>);
  if (kind === "evolution") return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M32 58V38M32 38 16 24M32 38 48 24M16 24 9 10M16 24 23 10M48 24 41 10M48 24 55 10" />
      {[9, 23, 55].map(x => <circle key={x} cx={x} cy="8" r="3.5" fill="#0F0A1C" />)}
      <circle cx="41" cy="8" r="3.5" fill="#F2B544" stroke="#F2B544" />
    </svg>);
  return (
    <svg {...common} fill="currentColor">
      {[[8, 50], [16, 38], [12, 24], [26, 46], [28, 30], [38, 40], [24, 16], [38, 24]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="3" />)}
      <circle cx="50" cy="14" r="7" fill="none" stroke="#F2B544" strokeWidth="2.5" /><circle cx="50" cy="14" r="2.5" fill="#F2B544" />
    </svg>);
}
