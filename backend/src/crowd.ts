import type { CrowdLevel } from "./types";

export function crowdLevelForHeadCount(headCount: number): CrowdLevel {
  if (headCount <= 21) return "LOW";
  if (headCount <= 100) return "MEDIUM";
  return "HIGH";
}

export function isLessCrowded(from: CrowdLevel, to: CrowdLevel): boolean {
  const rank: Record<CrowdLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  return rank[to] < rank[from];
}
