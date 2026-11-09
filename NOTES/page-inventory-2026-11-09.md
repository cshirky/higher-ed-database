# Page inventory: five tools to merge (draft)

2026-11-09. Companion to `central-data-store-memo-2026-11-09.md`.

**How this was made:** I read page titles, headings and the first lines of each
page (for `college-dashboard`, from the GitHub `main` branch, because the local
clone in `~/claude_projects/college-database` is on the old `Scatterplot`
branch). I did not run any app. "Proposed" dispositions are my guesses for you
to overrule: **Keep** (port as a page of the merged app), **Merge** (fold into
another page or component), **Defer** (park until the data layer exists),
**Drop** (retire).

## college-dashboard (Observable Framework, 13 pages)

| Page | What it does | Data it reads | Proposed |
|---|---|---|---|
| `index` | Explorer with filters by Carnegie category and CIP program; links to Compare and Twins | institutions.csv, programs.csv | Merge into the Explore home |
| `intro` ("Find Your College") | Guided start showing a sample school card | institutions.csv | Keep: front door of Discover |
| `school-card` ("How to Read a School Card") | Explains the card, using a sample school | institutions.csv | Merge into `intro` as a help panel |
| `landscape` | Stub: "This page is coming soon" | none | Drop (or write it) |
| `vibe` | Questionnaire about what you want | vibe-questions.json | Keep: Discover step 1 |
| `academics` | Questionnaire about your interests | academic-questions.json | Keep: Discover step 2 |
| `twins` | Three-question matcher, results sorted by selectivity | institutions.csv, programs.csv | Keep: result of Discover |
| `deck` ("My Deck") | Saved schools in tiers (definitely / probably / maybe) | institutions.csv, programs.csv, browser storage | Keep, unify with `my-deck` |
| `my-deck` | Second deck page, built on the scatterplot card | good_schools.csv, programs.csv, us-states.json | Merge into `deck` (duplicate) |
| `schools` ("School Profile", `?id=`) | Profile for one school | institutions.csv, programs.csv | Merge with the institution detail page of `higher-ed-database` |
| `compare` | Define up to three school categories, choose axes, compare | institutions.csv | Keep: Compare section |
| `scatterplot` ("The Landscape of American Colleges") | Filterable scatterplot with card tray | institutions.csv | Keep: Explore section |
| `3d` | Same landscape in 3D | institutions.csv | Keep or Defer (3D view of the same data) |

Duplication inside this repo: two deck pages, two card components
(`collegeCard.js`, `scatterCard.js`), and several overlapping datasets
(`institutions.csv`, `all_schools.csv`, `good_schools.csv`). The project review
notes the same duplicates.

## higher-ed-database (Next.js + Neon, 4 pages)

| Page | What it does | Proposed |
|---|---|---|
| `/` | Search home | Merge: becomes the merged app's home |
| `/institutions` | Searchable institution list | Keep |
| `/institutions/[unitid]` | Detail page with time series: enrollment, admissions, SAT/ACT, and more | Keep: the profile page; absorb `schools` |
| `/compare` | "Nationwide comparison": counts and enrollment by institution type over time | Keep: Trends section |

The database also has `peer_network` and `academic_similarity` tables. I did
not check whether any page uses them yet.

## comparator_vercel (1 page + API)

| Page | What it does | Proposed |
|---|---|---|
| `index.html` "College Comparator" | Side-by-side school comparison; the Python API (`api/compare.py`) serves `schools.json` and `programs.json` | Keep the idea, rebuild on the DB; drop the separate API and JSON files |

## school_comparisons (3 pages)

| Page | What it does | Proposed |
|---|---|---|
| `index.html` | Landing for the IPEDS custom comparison groups | Drop (replaced by the merged nav) |
| `school_network.html` (2023) | Network graph of comparison groups | Merge: one network page with a year selector |
| `school_network_2024.html` | Same, for 2024 | Merge (same page, different year) |

## scratch (3 pages, AAUP faculty-employment charts, 1975–2011)

| Page | What it does | Proposed |
|---|---|---|
| `AAUP_FacultyRoles_BarStep` | Step chart of faculty roles | Keep one version |
| `AAUP_Trends_BarAnimation` | Animated bars of instructional-staff employment | Defer or Drop |
| `AAUP_Trends_Colored` | Static colored trend chart | Merge with the kept version |

These three show the same data in different ways. Their data comes from AAUP,
not IPEDS, so it needs its own source table before it can live in the database.

## What the merged app could look like

| Section | Pages |
|---|---|
| **Discover** | intro, vibe, academics, twins, deck |
| **Explore** | institutions list, institution profile (with school card), landscape scatterplot, 3D |
| **Compare** | category compare, side-by-side comparator, peer network (year selector) |
| **Trends** | nationwide comparison, faculty employment |

That is roughly 16 pages from today's ~24, with the three duplicate pairs
(decks, cards, network years) resolved.

## Decisions (2026-11-09)
1. Discover flow (intro, vibe, academics, twins, deck) is the main entrance; search becomes part of Explore.
2. Keep the 3D view.
3. Merge the faculty-employment charts into the app (Trends).
4. No page is precious; anything can be reverted from git.
