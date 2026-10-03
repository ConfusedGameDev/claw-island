export interface RunStats {
  seconds: number;
  attempts: number;
  targetsDelivered: number;
  decoysDropped: number;
  slips: number;
}

export interface ScoreBreakdown {
  base: number;
  timeBonus: number;
  attemptBonus: number;
  decoyPenalty: number;
  /** Booster multiplier applied to the total (1 = none). */
  multiplier: number;
  total: number;
  stars: 1 | 2 | 3;
}

export const PERFECT_ATTEMPTS = 4;

export function computeScore(s: RunStats, targetCount = 3, multiplier = 1): ScoreBreakdown {
  const base = 1000 * s.targetsDelivered;
  const timeBonus = Math.max(0, 1500 - Math.floor(s.seconds) * 10);
  const attemptBonus = Math.max(0, 1000 - 100 * Math.max(0, s.attempts - PERFECT_ATTEMPTS));
  const decoyPenalty = 100 * s.decoysDropped;
  const raw = Math.max(0, base + timeBonus + attemptBonus - decoyPenalty);
  const total = raw * multiplier;
  // Stars judge the play itself, not the booster.
  // Three stars needs the full treasure haul plus 1500 of bonuses; two needs the haul.
  const full = 1000 * targetCount;
  const stars: 1 | 2 | 3 = raw >= full + 1500 ? 3 : raw >= full ? 2 : 1;
  return { base, timeBonus, attemptBonus, decoyPenalty, multiplier, total, stars };
}
