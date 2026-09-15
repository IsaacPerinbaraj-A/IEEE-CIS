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
