---
name: institution-scope
description: >-
  Defines which IPEDS institutions belong in this project and how to classify
  them as College/University/Graduate school. Use whenever writing or
  reviewing ETL/classification/filtering logic touching institution_type,
  HLOFFER, DEGGRANT, UGOFFER, or GROFFER, or when a query result includes
  unexpected certificate-only or non-degree-granting institutions.
---

# Institution scope

This project is only concerned with colleges and universities in the US,
defined as institutions that grant Associate's, Bachelor's, Master's, or
Doctoral degrees. **Institutions granting only certificates are not to be
included.**

## The three project-specific categories

These labels are our own vocabulary, not IPEDS's — see the `institution_type`
column on `institution_years`:

- **College** — grants Associate's and/or Bachelor's degrees only (no graduate
  degrees).
- **Graduate school** — grants Master's and/or Doctoral degrees only (no
  undergraduate degrees).
- **University** — grants both undergraduate and graduate degrees.

Anything that doesn't clear the degree-granting bar at all (certificate-only
schools) is **out of scope for this project** — not "College," not any other
bucket. It should be excluded, not miscategorized as "other."

## The IPEDS fields that matter, and how they differ

IPEDS's `HD{year}` table carries several fields that look like they answer
this question but don't, on their own:

- `UGOFFER` / `GROFFER` (1 = yes, 2 = no) — whether an institution offers
  *any* undergraduate/graduate-level programs. **This flag is too broad**: an
  institution offering only sub-1-year or 1–2-year certificates still has
  `UGOFFER = 1`, even though it grants no degree at all.
- `HLOFFER` — highest level of offering. Values `3` (Associate's), `5`
  (Bachelor's), `7` (Master's), and `9` (Doctor's) are real degrees. Values
  `1`, `2`, `4`, `6`, `8` are certificate/non-degree awards (including
  postbac/post-master's certificates, which sit *above* a real degree level
  numerically but are still not degrees themselves).
- `DEGGRANT` — degree-granting status. **This is the flag to gate scope on**:
  `1` = "Degree-granting", `2` = "Nondegree-granting, primarily
  postsecondary". An institution with `DEGGRANT = 2` should never appear
  anywhere in this project's data, regardless of its `UGOFFER`/`GROFFER`
  values.

### Scope gate: fixed 2026-07-23 (commit 05febbb)

`scripts/etl/load-year.ts` now gates on `DEGGRANT = 1`, building a
`degreeGrantingUnitids` set from `HD{year}` and filtering **every** fact table
through it, not just `institution_years`. `institutionType()` still reads
`UGOFFER`/`GROFFER`, which is correct now that scope is gated first: those
flags only decide *which* of the three categories a degree-granting
institution lands in, never whether it's in scope at all.

For context on why this mattered — the spot check that prompted the fix found
that of 5,306 institutions previously classified as "college" in 2010 data,
only 2,313 had an `HLOFFER` of Associate's or Bachelor's. The other ~2,700
were certificate-only vocational schools being counted as colleges.

Standing rule: a change to the scope gate alters historical row counts, not
just going-forward loads. Truncate (`scripts/etl/truncate-all.ts`), re-run
`load-year.ts` for every loaded year, then `materialize.ts` — `load-year.ts`
upserts but never deletes, so a narrowed scope leaves orphaned rows behind
otherwise.

## When this applies

Load this skill (or at least re-read this file) before:
- Changing anything in `scripts/etl/load-year.ts` related to
  `institutionType`, `HLOFFER`, `DEGGRANT`, `UGOFFER`, or `GROFFER`.
- Adding new queries or pages that filter/group by institution type.
- Explaining or debugging why an institution count on `/compare` or
  `/institutions` looks larger or smaller than expected — check whether
  certificate-only institutions are leaking into the counts before assuming
  the data itself is wrong.
