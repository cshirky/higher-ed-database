# Similarity proposal: a dynamic institution network map

## Purpose

Today the project has two precomputed, fixed-weight similarity indexes:
`peer_network` (institutional profile: enrollment, admit rate, tuition,
instruction spend — see `.claude/skills/precompute-over-live-query`) and
`academic_similarity` (subject/degree mix — see
`.claude/skills/academic-similarity`). Both store a *distance number per
pair*, baked in at ETL time with fixed, equal-ish weighting, and both
restrict comparisons to institutions of the same `institution_type` cohort.

The network map is a different product: the user picks the weights, so the
distance between any two in-scope institutions (1,718 for 2024 -- see "Scope"
below, and `.claude/skills/institution-scope`) has to be computable **on
demand**, not looked up from a precomputed pairwise table. This document
covers:

1. every comparator we have data for, sorted into the three buckets the user
   named — **identities**, **characteristics**, **field mix**
2. how each bucket turns into a sub-distance
3. how the sub-distances combine, and what "weighting" can mean here
4. what to precompute so a live pairwise distance is cheap to compute for
   any two institutions, at any weight setting

**Status.** The map itself is still unbuilt -- no new table or route exists
yet. But this is no longer purely a proposal: the scope, weighting UI,
selectivity resolution, field set, normalization basis and computation
strategy are all now decided (see "Decisions"), and two of its
recommendations have shipped into the existing `peer_network` -- the
missing-data correction in `71e66f5` and a one-year fallback in `b0a01f6`.
Four questions remain genuinely open, one of which is a product call rather
than a technical one (see "Still open").

## Scope: bachelor's-granting institutions with a reported admit rate

Decided. The audience is high-school students and their parents comparing
undergraduate options, which fixes the in-scope set far more tightly than
"all degree-granting institutions":

| scope | n (2024) |
|---|---|
| full `institution_years` cohort | 4,090 |
| grants bachelor's degrees | 2,370 |
| **grants bachelor's AND has an admit rate** | **1,718** |
| + admit rate < 100% | 1,631 |
| + admit rate <= 75% | 796 |

**The gate is "has a reported admit rate," not a selectivity threshold.**
Reporting an admit rate at all is what signals an admissions process; a hard
cut at 75% would drop ~900 legitimate options. Selectivity belongs in the UI
as a filter over the map, not as a scope boundary that silently deletes
institutions.

This scoping is load-bearing for the rest of the document. Field coverage
inside the 1,718 bears almost no resemblance to coverage across all 4,090 --
see "Handling missing data" -- and it is what makes the normalization basis
question answerable.

## The three comparator buckets

### 1. Identities — things a school has or doesn't have

These are categorical/binary fields. Two institutions either match or they
don't; there's no "how much" (with one exception, noted below).

| Field | Source table | Values | Notes |
|---|---|---|---|
| `control` | `institution_years` | 1 public / 2 private nonprofit / 3 private for-profit | Already a named color dimension — see `.claude/skills/viz-color-conventions` |
| `institution_type` | `institution_years` | college / university / graduate_school | Our own derived label (undergrad-only / grad-only / both) |
| `hbcu` | `institution_years` | yes/no | IPEDS flag |
| `tribal` | `institution_years` | yes/no | IPEDS flag |
| `iclevel` | `institution_years` | 1 four-year+ / 2 two-to-four-year / 3 less-than-two-year | Program-length tier |
| `locale` | `institution_years` | 12 IPEDS codes: city/suburb/town/rural × large/mid/small-or-fringe/distant/remote | **Ordinal**, not nominal — see below |
| `highestOffering` (HLOFFER) | `institution_years` | 1–9, degree levels map to {3,5,7,9} per institution-scope | Overlaps heavily with `institution_type` and with the field-mix award-level distribution — see "avoiding double-counting" below |

Not proposed as identity dimensions, with reasoning:

- **`sector`** — a finer IPEDS cross of `control` × `iclevel` × distance-ed
  status. Including it alongside `control` and `iclevel` separately would
  double-weight the same underlying facts. Skip it.
- **`accountingStandard`** (gasb/fasb/fasb_forprofit) — deterministic
  function of `control`. Redundant, skip.
- **`state`, `city`, `latitude`/`longitude`** — geography isn't an academic
  or student-body similarity signal (two academically near-identical
  liberal arts colleges can be on opposite coasts), so it shouldn't feed
  the *distance* score. It's still useful as a map-rendering/filter
  dimension (e.g. "show me my region"), just orthogonal to similarity.
  Proposal: keep it out of the weighted distance, expose it separately as a
  map filter if/when the map has real geography.

**Locale is ordinal, not nominal.** The 12 codes form a real urbanicity
spectrum (large city → remote rural). Treating a City/Rural mismatch the
same as a City/Suburb mismatch (as a plain nominal match/no-match would)
throws away information. Proposal: map the 12 codes to a 1–12 urbanicity
scale and treat it as a *characteristic* (bucket 2, z-scored), not an
identity match/mismatch.

**Avoiding double-counting `institution_type` / `HLOFFER` / field mix.**
All three of these encode "what degree levels does this school grant,"
at increasing resolution:  `institution_type` (3 buckets) <
`highestOffering` (top level only) < the full award-level distribution
already inside the field-mix size distance (bucket 3). Using more than one
of these at once would weight "grants graduate degrees" three times over.
Proposal: use `institution_type` as the one coarse identity flag, and let
bucket 3 carry the actual degree-level granularity. Drop `highestOffering`
as a separate input.

### 2. Characteristics — single-valued comparators

Everything below is a continuous or count field we have for most in-scope
institutions, grouped by domain. All become z-scores (see "Normalization
basis" below) before combining.

**Size / demographics** (`enrollment`)
- `total`, `fte`, `undergradTotal`, `gradTotal`
- `pctWomen`, `pctWhite`, `pctBlack`, `pctHispanic`, `pctAsian`,
  `pctAmIndianAkNative`, `pctNativeHawaiianPacific`, `pctTwoOrMoreRaces`,
  `pctNonresident`
- `pctExclusivelyDistanceEd`

**Selectivity** (`admissions`)
- `pctAdmittedTotal` (admit rate), `yieldTotal` -- both 100% covered in scope
- **Decided: collapse SAT/ACT to a single composite.** The six-plus percentile
  columns carry roughly one dimension of real information: within 2024, SAT
  math and reading at the 50th percentile correlate at **0.950**, and SAT
  against ACT composite at **0.906**. Carrying more resolution forward would
  multiply a redundant signal. Note the composite is the weakest-covered field
  in the whole v1 set at **59%** even inside scope, because test-optional
  institutions stopped reporting -- so it depends on the missing-data handling
  below rather than being a dimension that can be assumed present.

**Price & aid** (`pricing`, `financial_aid`)
- `tuitionFeesInState`, `inStateTotalOnCampus`, `outStateTotalOnCampus`
- `pctAwardedAnyGrant`, `avgGrantAidAmount`

**Finance & faculty** (`finance`, `faculty`)
- `tuitionRevenuePerFte`, `instructionExpensePerFte`,
  `instructionExpensePct`, `researchExpensePct`, `endowmentPerFte`,
  `equityRatio`
- `avgSalaryAllRanks`
- derived: **student/faculty ratio** = `enrollment.fte / faculty.fteInstructional`
  (not a raw column, computed at feature-build time)

**Outcomes** (`graduationRates`)
- `gradRateTotal`, `transferOutRateTotal`, `bachelor6yrRateTotal`,
  `pellGradRateTotal`
- (the race/gender-specific grad-rate columns are more useful for
  equity-gap analysis than for a similarity axis — proposal: leave them out
  of the distance score, they're highly collinear with the demographic
  `pct*` fields already included under Size/demographics)

**Locale (ordinal)** — the 1–12 urbanicity mapping described above lives
here, not in bucket 1.

This is a *superset* — a first pass, not everything above needs to ship in
weighting UI v1. See "Weighting strategies" for how to make this tractable.

### 3. Field comparators — subject/degree mix

This is exactly what `.claude/skills/academic-similarity` already
specifies, and it should be reused rather than reinvented:

- **Composition distance**: cosine distance between two institutions'
  share vectors over `(cip_code, award_level)` from `completions_by_field`
  (6-digit CIP, first-major-only, leaf award levels only).
- **Size distance**: z-scored undergrad-total / grad-total completions,
  `sqrt(zUndergrad² + zGrad²)`.

One change for the network-map use case: the existing formula z-scores
undergrad/grad totals *within the institution_type cohort*. Scope excludes
graduate schools, but colleges and universities both remain in it, so a
cohort-relative basis would still make their vectors incomparable. The map
needs one consistent basis across the in-scope set — see next section.

## Normalization basis: the audience scope, not the full cohort

`peer_network` and `academic_similarity` both z-score within
`institution_type` (comparing a college only to other colleges). That is
correct for "find my peers" but wrong for "any pair of institutions" -- a
z-score computed against a different population is not comparable across
populations. An earlier draft of this document proposed fixing that by
normalizing against the full ~4,000-institution cohort. **That was the right
instinct with the wrong population.**

Normalize against the in-scope 1,718, measured 2024:

| | all 4,090 | audience (1,718) |
|---|---|---|
| mean tuition | $17,769 | $26,563 |
| mean bachelor 6yr rate | 51.3% | 55.3% |

What that does to individual tuition z-scores:

| institution | tuition | z (all 4,090) | z (audience) |
|---|---|---|---|
| Northwestern | $65,997 | 2.95 | 2.25 |
| Harvard | $59,076 | 2.53 | 1.85 |
| UT Austin | $11,678 | -0.37 | **-0.85** |
| Wisconsin-Madison | $11,205 | -0.40 | **-0.88** |
| Buffalo | $10,782 | -0.43 | **-0.90** |

The full-cohort basis makes public flagships look merely average-priced,
because the population is padded with thousands of low-tuition, non-selective
institutions this audience will never see; against the audience their distance
from the mean more than doubles. Elite private tuition simultaneously stops
looking as extreme, which is also correct -- inside this set, $60k is ordinary.
So per-cohort is wrong (college-vs-university comparability still matters),
full-cohort is wrong (wrong population), audience-scoped is right.

**Fix the basis at materialize time; let user filters subset the map without
recomputing z-scores.** If the basis floated with whatever filter were active,
distances would shift underneath the user as they filtered, and every cache
entry would be invalidated on each filter change.

## Combining the three buckets

Each bucket produces its own sub-distance, on its own natural scale:

- **Identity distance** — mismatch rate across the chosen identity fields
  (0 = identical on every flag, 1 = differs on all of them). Simple
  Hamming-style average: `identityDistance = (# mismatched fields) / (# fields compared)`.
- **Characteristic distance** — Euclidean over z-scores:
  `sqrt(Σ (z_a,i − z_b,i)²)` over the chosen characteristic fields.
- **Field distance** — `academicDistance` exactly as defined in
  `.claude/skills/academic-similarity` (composition + size, combined via
  `sqrt(compositionDistance² + sizeDistance²)`).

These three numbers are **not naturally on the same scale** — identity
distance is bounded [0,1], characteristic distance grows with the number of
fields (roughly √n for n independent z-scored fields), and field distance
is bounded [0, √2]. Combining them with raw weights would make the weights
mean different things depending on how many characteristic fields happen to
be selected. Proposal: rescale each bucket distance to a comparable range
before weighting — divide characteristic distance by its own population
median (or normalize by dividing by `√n` fields), so all three land in a
roughly 0–1-ish "typical difference" range. Then:

```
distance(a, b) = sqrt(
  w_identity       * identityDistance(a, b)²        +
  w_characteristic * characteristicDistance(a, b)²  +
  w_field          * fieldDistance(a, b)²
)
```

with `w_identity + w_characteristic + w_field` not required to sum to 1
(only their *relative* size matters), so the UI can expose them as three
independent sliders.

**Default weights, before user weighting ships**: equal weight
(`w = 1` each) is the honest "we don't have an opinion yet" starting point,
consistent with how `academic_similarity`'s own composition/size split
starts equal-ish per its skill doc. Don't hand-tune defaults without a
reason to.

## Weighting strategies (increasing complexity)

1. **Three sliders (bucket-level)** -- exactly the formula above. Cheapest
   to build and explain; matches the three-way framing. **Decided for v1.**
2. **Sub-domain sliders** — split "characteristic" into its five domains
   (size/demographics, selectivity, price, finance/faculty, outcomes) as
   separate weights, each contributing its own z-scored Euclidean
   sub-distance, combined the same way as the top-level formula. More
   expressive, still a manageable number of sliders (~7 total incl. identity
   and field). Reasonable v2.
3. **Per-field sliders** — every single comparator gets its own weight.
   Maximally flexible, but ~30+ sliders is not a usable UI on its own; would
   need a "simple mode / advanced mode" split. Don't build this first.

## Handling missing data

**Status: the core correction is shipped.** The `coalesce(power(...), 0)`
shortcut this section originally criticised -- which treats "unknown" as
"exactly average" -- was fixed in `peer_network` in commit `71e66f5`. It now
takes the root mean square over only the dimensions both institutions report,
exactly as proposed here. The new score should reuse that approach rather than
reinvent it.

Two things have been learned since, both of which change this section.

### A one-year fallback now precedes the availability test

Commit `b0a01f6` added a general rule: when a dimension has no value for the
current year, fall back one year; if it is absent there too, treat it as
genuinely empty. IPEDS provisional releases ship survey components piecemeal,
so the newest year routinely lacks an entire survey while the prior year is
complete -- the provisional 2024-25 release contains no IC component at all,
which left pricing empty for every institution and silently removed tuition
from the comparison. The fallback restored it for 3,307 institutions.

One year only, deliberately: a figure two years stale misleads more than an
absent one. **"Available for both institutions" should therefore be evaluated
on post-fallback values**, not raw current-year ones.

### Averaging alone is not sufficient at 30-plus fields

Averaging over shared dimensions was enough at four dimensions. At 31 it is
not. A benchmark over the full 4,090-institution cohort returned these as
Harvard's nearest matches, all at distance 0.000:

| institution | dimensions present (of 6 sampled) |
|---|---|
| The University of America | 0 |
| Rensselaer at Hartford | 0 |
| Pontifex University | 0 |

Each shares one or two incidental fields with Harvard, matches on them by
coincidence, and the average over shared dimensions is therefore zero. **A
minimum-shared-fields floor is required**, not optional: a pair below the
floor should be ineligible rather than scored.

### Scoping defuses most of this

The 146 institutions reporting neither an admit rate nor instructional spend
are enumerated in `DATA/no_admit_no_spend.md`. Of those, **127 granted no
degrees at all in 2024** -- they clear `DEGGRANT = 1` but conferred nothing --
and only **8 granted bachelor's degrees**, of which 6 remain blind after the
fallback and only Pennsylvania College of Technology has meaningful scale.

So the scope decision does most of the work a floor would have done: inside
the 1,718, coverage runs 95-100% for every v1 field except the test composite
(59%) and transfer-out rate (64%, dropped from v1 for that reason). Keep the
floor as a cheap guard, but it is no longer a prerequisite for shipping.

## Storage & computation strategy

**Do not precompute pairwise distances** the way `peer_network` and
`academic_similarity` do — that bakes in one fixed weight setting, which
defeats the purpose of a *dynamic* map. Instead:

Precompute, per institution per year, in `materialize.ts`:
- one z-score per characteristic field, computed against the in-scope
  audience and fixed at materialize time, per "Normalization basis" above
- the raw codes/flags for each identity field
- the sparse `(cip_code, award_level) → share` vector and its L2 norm
  (already computed in `materialize.ts` for `academic_similarity` — just
  needs to be persisted instead of thrown away after use)
- the undergrad/grad completion z-scores (already computed for the same
  reason)

Proposed new table, tentatively `institution_similarity_features`
(name TBD): one row per `(unitid, year)`, columns for each identity
code, a `doublePrecision` per characteristic z-score, and a `jsonb` column
for the sparse field-share vector + norm. This is the "make pairwise
distance easy to count" part of the ask: computing `distance(a, b)` for any
two institutions becomes reading two rows and doing arithmetic — no joins,
no re-deriving z-scores, no re-walking `completions_by_field`.

On whether to generalize storage across all three indexes, see "Still open" --
`.claude/skills/academic-similarity` deferred that until a third index existed,
and this is it.

## Computation: measured, not estimated

This section previously estimated "sub-second" for a full pairwise pass. That
estimate has now been benchmarked against real data -- 4,090 institutions x 31
fields, averaging over shared dimensions, top-12 per node:

| step | time |
|---|---|
| load feature matrix from Neon | **2,661 ms** |
| build z-scores | 54 ms |
| full pairwise pass (8.36M pairs) | **880 ms** |
| **single institution vs all (ego)** | **4 ms** |
| feature matrix in memory | 1.1 MB |

Three conclusions, which together answer where the pairwise pass lives:

**1. The database load dominates, so cache the feature matrix, not primarily
the pairwise results.** Memoizing pairwise output saves 880 ms; keeping the
1.1 MB matrix resident saves 2,661 ms. It changes only when the ETL runs.

**2. An ego network needs no cache at all.** One institution against all
others is 4 ms -- faster than the network round trip, so it can be recomputed
on every slider drag. Only rendering the *global* graph needs the 880 ms pass.
Confirm which the product actually requires before building a cache for it.

**3. If the global graph is cached, quantize and normalize the weight vector
before using it as a key.** With continuous sliders every request is a unique
key and the hit rate is approximately zero. Quantize to the slider's own step
(11 positions each gives 1,331 combinations), then exploit the fact that only
*relative* weights matter: normalize so the largest is 1, collapsing (2,4,6)
onto (1,2,3). That leaves a few hundred genuinely distinct maps, which warms
up quickly.

Cache in Postgres rather than in process: on Vercel, in-process memory dies
with each cold start and is not shared across instances, so a lazily-filled
in-memory cache would keep re-paying the 2.6 s load. A table keyed by
weight-hash also matches house style.

**This feature is a deliberate exception to
`.claude/skills/precompute-over-live-query`**, and the only one so far.
Precomputing pairwise distances is exactly what that skill would prescribe and
exactly what defeats a user-weighted map. Worth stating there explicitly so
this does not later read as a violation.

## Decisions

1. **Weighting UI v1** -- three bucket-level sliders (identity, characteristic,
   field). Sub-domain sliders are a v2 consideration; per-field is not planned.
2. **Selectivity resolution** -- collapse SAT/ACT to one composite. The columns
   correlate at 0.906-0.950, so the extra resolution is redundant.
3. **Where the pairwise pass lives** -- benchmark-driven, see "Computation"
   above: hold the feature matrix resident, compute ego networks live at 4 ms,
   and cache only the global graph, keyed by a quantized and normalized weight
   vector, in Postgres.
4. **Scope and field set** -- bachelor's-granting with a reported admit rate
   (1,718 institutions for 2024). v1 fields: enrollment and undergrad total;
   admit rate, yield, one test composite; tuition, total cost on campus,
   percent awarded grant aid, average grant; bachelor 6yr rate, grad rate, Pell
   grad rate; locale as 1-12 urbanicity; instruction spend per FTE and
   student-faculty ratio. Identity flags reduce to control, HBCU and tribal.
   Dropped from v1: transfer-out rate (64% coverage, not a comparison families
   make) and the institutional-finance internals -- endowment per FTE, equity
   ratio, research expense percent, tuition revenue per FTE -- which are analyst
   fields rather than applicant-facing ones. Note `institution_type` becomes
   near-dead weight as an identity flag once scope excludes graduate schools.
5. **Normalization basis** -- z-score against the in-scope 1,718, fixed at
   materialize time. See "Normalization basis" for the evidence.

## Still open

1. **Do the race and ethnicity percentages belong in the distance at all?**
   This is a product decision, not a data one -- they are well covered and
   would pass any coverage test. But making racial composition a *similarity
   axis* in a tool recommending colleges to teenagers means "show me schools
   whose demographic makeup resembles this one," which is a different product
   from the one described and carries an obvious risk of steering applicants by
   race. Recommendation: keep them out of the weighted distance and show them
   as profile data on an institution's page. `pctWomen` is less fraught but is
   better handled as a women's-college identity flag than a continuous axis.
   Flagged rather than defaulted either way.
2. **Does the product need the global graph, or only ego networks?** This
   decides whether any pairwise cache gets built. See "Computation" point 2.
3. **Where the minimum-shared-fields floor is set.** Required in principle;
   scoping defuses the urgency. Needs a number once the v1 field set is frozen.
4. **Whether to generalize storage across all three indexes.** Unchanged from
   the original note: this proposal is the third index and is shaped differently
   (per-institution features, not per-pair distances), so it is a natural moment
   to reconsider -- deliberately, once this is built, not before.
