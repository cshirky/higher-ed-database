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
