/**
 * Colours for the generated cover an event gets while it has no poster (src/components/EventCards.tsx).
 * The pair is chosen from the event's own name, so a cover always looks the same for the same event but different
 * from its neighbours in a list. Every pair stays inside the site's palette (violet, pink, cyan, gold on ink).
 */
export type Cover = { background: string; ring: string; tilt: number };

const PAIRS: { from: string; via: string; ring: string }[] = [
  { from: "#2A1B4D", via: "#181128", ring: "rgba(242,181,68,.7)" },   // violet into ink, gold ring
  { from: "#1E2A4D", via: "#141726", ring: "rgba(34,211,238,.55)" },  // deep blue, cyan ring
  { from: "#3A1740", via: "#1A1026", ring: "rgba(244,114,182,.55)" }, // plum, pink ring
  { from: "#132B33", via: "#101B22", ring: "rgba(196,181,253,.55)" }, // teal, violet ring
  { from: "#33204A", via: "#15101F", ring: "rgba(242,181,68,.55)" },  // purple, gold ring
];

/** Stable small number from a string (the event's slug), so the same event always gets the same cover. */
const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

export function coverOf(key: string): Cover {
  const h = hash(key || "event");
  const p = PAIRS[h % PAIRS.length];
  return {
    background: `linear-gradient(135deg, ${p.from} 0%, ${p.via} 55%, #0F0A1C 100%)`,
    ring: p.ring,
    tilt: (h >> 3) % 40,
  };
}
