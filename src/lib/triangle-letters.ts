// The three picks in the triangle comparison, kept apart from triangle.ts so
// the client-side picker does not bundle the CIP label tables.
export const LETTERS = ["A", "B", "C"] as const;
export type Letter = (typeof LETTERS)[number];

// Identity colors for the three picks — violet, orange, aqua, slots 7, 6 and 5
// of the categorical palette. Deliberately not slots 1–3, which mean College,
// University and Graduate school elsewhere (see .claude/skills/viz-color-conventions).
// Validated as a set in both modes; aqua is under 3:1 on the light surface,
// so a color always appears with its letter, never alone.
export const LETTER_COLORS: Record<Letter, string> = {
  A: "var(--series-7)",
  B: "var(--series-6)",
  C: "var(--series-5)",
};
