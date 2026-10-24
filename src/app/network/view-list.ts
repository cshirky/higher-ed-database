// The five ways of drawing a college network. Each is its own diagram over the
// same data (getCollegeNetwork); the slug is the URL segment.
export const VIEWS = [
  {
    slug: "culture",
    name: "Petri dish",
    tagline: "Schools grow as cells. Cells that beat your school in the same ways clump into colonies.",
  },
  {
    slug: "quest",
    name: "Quest tree",
    tagline: "A video-game skill tree: every level up is one more thing a school does better.",
  },
  {
    slug: "transit",
    name: "Transit map",
    tagline: "Ride the Yield, Graduation, or Cost line out from your school. Interchanges beat it on several.",
  },
  {
    slug: "stars",
    name: "Star chart",
    tagline: "Distance in the sky is distance in majors. Constellations join schools that beat yours the same way.",
  },
  {
    slug: "city",
    name: "Campus city",
    tagline: "A tiny city where building height is student body size, and each district is better in its own way.",
  },
] as const;

export type ViewSlug = (typeof VIEWS)[number]["slug"];

export function isViewSlug(s: string): s is ViewSlug {
  return VIEWS.some((v) => v.slug === s);
}
