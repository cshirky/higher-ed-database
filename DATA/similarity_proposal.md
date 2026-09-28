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
distance between any two of the ~4,000 in-scope institutions (see
`.claude/skills/institution-scope`) has to be computable **on demand**, not
looked up from a precomputed pairwise table. This document proposes:

1. every comparator we have data for, sorted into the three buckets the user
   named — **identities**, **characteristics**, **field mix**
2. how each bucket turns into a sub-distance
3. how the sub-distances combine, and what "weighting" can mean here
4. what to precompute so a live pairwise distance is cheap to compute for
   any two institutions, at any weight setting

This is a proposal, not an implementation — nothing here is wired into
`materialize.ts` or the schema yet.

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
- `pctAdmittedTotal` (admit rate), `yieldTotal`
- SAT/ACT 25th/50th/75th percentiles (reading, math, composite) — proposal:
  collapse to one or two selectivity comparators (e.g. SAT-equivalent
  composite at the 50th percentile) rather than feeding six-plus correlated
  percentile columns in as separate, redundant dimensions

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
undergrad/grad totals *within the institution_type cohort*. A map that
compares colleges to universities to grad schools needs one consistent
normalization basis across all ~4,000 institutions — see next section.

## Normalization basis: population-wide, not per-cohort

`peer_network` and `academic_similarity` both z-score within
`institution_type` (comparing a college only to other colleges). That's
correct for "find my peers," but wrong for "any pair of institutions" — a
z-score computed against a different population isn't comparable across
populations. **Proposal: compute every z-score against the full ~4,000-
institution population** (or whatever the current in-scope set is),
so that a college and a graduate school's characteristic vectors live on
the same scale. This is a deliberate departure from the existing two
tables' convention, needed specifically because the map removes the
same-cohort restriction.

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

1. **Three sliders (bucket-level)** — exactly the formula above. Cheapest
   to build and explain; matches the user's own three-way framing. Recommended v1.
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

Not every institution has every field (e.g. open-admission schools report
no SAT/ACT; some private institutions don't report all finance line items).
The existing `peer_network` SQL silently treats a missing value as
contributing 0 to the sum-of-squares (`coalesce(power(...), 0)`), which
quietly treats "unknown" as "exactly average" and doesn't reduce the
influence of that pair's other dimensions. Proposal for the new score: track,
per pair, how many of the *selected* fields were actually available for
*both* institutions, and average (rather than sum) the squared differences
over that count — so a pair missing three of ten fields is compared on the
other seven, not silently pulled toward "average" on the missing three. This
is a small but real correction worth making now rather than inheriting the
older shortcut.

## Storage & computation strategy

**Do not precompute pairwise distances** the way `peer_network` and
`academic_similarity` do — that bakes in one fixed weight setting, which
defeats the purpose of a *dynamic* map. Instead:

Precompute, per institution per year, in `materialize.ts`:
- one z-score per characteristic field (population-wide, per "Normalization
  basis" above)
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

Given only two similarity indexes exist today, `.claude/skills/academic-
similarity` deliberately deferred generalizing storage until a third index
existed ("rule of three"). This proposal *is* that third index — and it's
shaped differently enough (per-institution features instead of per-pair
distances) that it's a natural moment to reconsider that decision, not
necessarily to force all three into one schema. Worth a deliberate look
once this is built, not before.

## Scaling to ~4,000 institutions

At ~4,000 institutions, all pairs is ~8 million — cheap to compute in a
single pass server-side (a handful of arithmetic ops per pair, tens of
millions of flops total, sub-second in Node) whenever the user changes
weights, *if* the per-institution feature vectors are already precomputed
and fit in memory. Proposal: recompute full pairwise distances server-side
on weight change (not in the browser, not per-pair on demand), then return
only what the map actually renders:

- **top-k edges per node** (same pattern as `peer_network`'s top-12), so
  the map only ever draws each institution's nearest neighbors, or
- **a distance threshold**, so institutions with no sufficiently similar
  peer under the current weights render unlinked — which is explicitly the
  behavior the user wants for the long tail of the ~4,000.

Either approach avoids ever asking the browser to lay out 8 million edges;
only a bounded, sparse edge list per weight change reaches the client.

## Open questions for next discussion

1. Which sub-domain grouping (if any beyond the three top buckets) ships in
   v1 of the weighting UI?
2. Selectivity currently has 6+ correlated SAT/ACT percentile columns —
   collapse to one composite now, or carry more resolution into `materialize.ts`
   and decide later?
3. Where does the recomputed pairwise pass live — a Next.js API route
   computed server-side per weight change, or does it need caching (e.g.
   keyed by a hash of the weight vector) if weight changes turn out to be
   frequent enough to matter?
4. Confirm the exact set of identity/characteristic fields to ship in v1
   (this document proposes a superset; not all of it needs to land at once).
