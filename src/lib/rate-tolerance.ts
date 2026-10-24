// Kept apart from triangle.ts so client components can import it without
// bundling the CIP label tables.

/** Rates closer than this many percentage points count as the same. */
export const RATE_TOLERANCE = 4;
