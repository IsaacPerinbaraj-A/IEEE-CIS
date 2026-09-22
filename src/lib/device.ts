/**
 * Rough device capability, used to scale the particle effects (idea from the second version's device tiering).
 * "low": data saver on, or 2 or fewer CPU cores / 2 GB or less memory. "high": 8+ cores and 8 GB+. Everything else "mid".
 * Browsers that don't report cores or memory count as "mid".
 */
export type DeviceTier = "low" | "mid" | "high";

export function deviceTier(): DeviceTier {
  if (typeof navigator === "undefined") return "mid";
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const cores = nav.hardwareConcurrency || 4, memory = nav.deviceMemory || 4;
  if (nav.connection?.saveData || cores <= 2 || memory <= 2) return "low";
  if (cores >= 8 && memory >= 8) return "high";
  return "mid";
}

export type ParticleBudget = { count: number; maxDpr: number };

/**
 * Particle budgets on phones (below 640px): how many particles, and the highest pixel ratio the canvas renders at.
 * Larger screens keep their own budgets in the particle components.
 */
export const PHONE_BUDGET: Record<"story" | "header", Record<DeviceTier, ParticleBudget>> = {
  story: { high: { count: 2600, maxDpr: 1.5 }, mid: { count: 2000, maxDpr: 1.25 }, low: { count: 1300, maxDpr: 1 } },
  header: { high: { count: 1000, maxDpr: 1.25 }, mid: { count: 900, maxDpr: 1.25 }, low: { count: 600, maxDpr: 1 } },
};
