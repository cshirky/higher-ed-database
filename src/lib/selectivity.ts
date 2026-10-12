// A single test score per institution, for showing beside admit rate.

// ACT composite → SAT total, from the 2018 ACT/College Board concordance. This
// is what puts a school that reports only ACT on the same scale as one that
// reports SAT.
const ACT_TO_SAT: Record<number, number> = {
  36: 1590, 35: 1540, 34: 1500, 33: 1460, 32: 1430, 31: 1400, 30: 1370,
  29: 1340, 28: 1310, 27: 1280, 26: 1240, 25: 1210, 24: 1180, 23: 1140,
  22: 1110, 21: 1080, 20: 1040, 19: 1010, 18: 970, 17: 930, 16: 890,
  15: 850, 14: 800, 13: 760, 12: 710, 11: 670, 10: 630, 9: 590,
};

export type TestScores = {
  satMath25: number | null;
  satMath50: number | null;
  satMath75: number | null;
  satReading25: number | null;
  satReading50: number | null;
  satReading75: number | null;
  actComposite25: number | null;
  actComposite50: number | null;
  actComposite75: number | null;
};

/** The median where IPEDS publishes one (2022 on), otherwise the middle of the 25th–75th range. */
function typical(p25: number | null, p50: number | null, p75: number | null): number | null {
  if (p50 != null) return p50;
  if (p25 != null && p75 != null) return (p25 + p75) / 2;
  return null;
}

/**
 * One test score on the SAT's 400–1600 scale: the SAT total, the ACT composite
 * converted to it, or the average of the two when a school reports both. Null
 * when it reports neither (test-blind schools, and most open-admission ones).
 */
export function satIndex(s: TestScores): number | null {
  const math = typical(s.satMath25, s.satMath50, s.satMath75);
  const reading = typical(s.satReading25, s.satReading50, s.satReading75);
  const sat = math != null && reading != null ? math + reading : null;

  const act = typical(s.actComposite25, s.actComposite50, s.actComposite75);
  const actAsSat = act != null ? (ACT_TO_SAT[Math.min(36, Math.max(9, Math.round(act)))] ?? null) : null;

  if (sat != null && actAsSat != null) return (sat + actAsSat) / 2;
  return sat ?? actAsSat;
}
