// Project-specific classification (not IPEDS's own vocabulary): see memory `project-terminology`.
//   college          = grants Associate's/Bachelor's only
//   graduate_school  = grants Master's/Doctoral only
//   university       = grants both
export const INSTITUTION_TYPES = ["college", "university", "graduate_school", "other"] as const;
export type InstitutionType = (typeof INSTITUTION_TYPES)[number];

export const INSTITUTION_TYPE_LABELS: Record<InstitutionType, string> = {
  college: "College",
  university: "University",
  graduate_school: "Graduate school",
  other: "Other",
};

// Fixed identity color per institution type — same entity, same color, on every
// chart it appears on (never reassigned by index/rank). Slots 1-3 of the
// categorical palette, in the order the types are introduced in the app.
export const INSTITUTION_TYPE_COLORS: Record<InstitutionType, string> = {
  college: "var(--series-1)", // blue
  university: "var(--series-2)", // green
  graduate_school: "var(--series-3)", // magenta
  other: "var(--series-4)",
};

export const CONTROL_LABELS: Record<number, string> = {
  1: "Public",
  2: "Private nonprofit",
  3: "Private for-profit",
};

export const SECTOR_LEVEL_LABELS: Record<number, string> = {
  1: "4-year or above",
  2: "2-year",
  3: "Less than 2-year",
};
