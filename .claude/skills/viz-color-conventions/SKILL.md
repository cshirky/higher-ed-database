---
name: viz-color-conventions
description: >-
  Fixed color mappings for the categorical dimensions used across this
  project's charts, lists, and legends — institution_type and control. Use
  whenever adding or reviewing a chart, table, badge, or legend that colors
  institutions by type or by control, or any view where both dimensions
  might appear together.
---

# Visualization color conventions

This project has two distinct categorical dimensions that get color-coded.
They must be kept visually distinct and never conflated — same institution,
two different orthogonal facets (a "college" can be Public, Private
nonprofit, or Private for-profit; control doesn't imply institution_type or
vice versa).

## `institution_type` (College / University / Graduate school)

Implemented in `src/lib/institution-types.ts` (`INSTITUTION_TYPE_COLORS`),
used on `/compare` today:

- College → `var(--series-1)` (blue)
- University → `var(--series-2)` (green)
- Graduate school → `var(--series-3)` (magenta)

## `control` (Public / Private nonprofit / Private for-profit)

**New requirement, not yet implemented:** any chart, list, or badge that
breaks institutions down by `control` (the `CONTROL` field: 1=Public,
2=Private nonprofit, 3=Private for-profit — see `CONTROL_LABELS` in
`src/lib/institution-types.ts`) should use:

- Public → **light blue**
- Private nonprofit → **light green**
- Private for-profit → **light orange**

To implement: add a `CONTROL_COLORS` constant next to `CONTROL_LABELS`,
following the same pattern as `INSTITUTION_TYPE_COLORS`. Pick concrete hex
values for the "light" tints and **validate them with the `dataviz` skill's
`scripts/validate_palette.js`** before shipping (light tints tend to fail the
lightness-band/contrast checks if picked by eye) — don't reuse
`INSTITUTION_TYPE_COLORS`' hexes even though both start with blue/green,
since those are saturated categorical slots, not light tints, and the two
dimensions need to read as visually distinct systems.

## Why these stay separate

Don't let a chart facet by `control` while also coloring by `institution_type`
(or vice versa) using these two mappings interchangeably — pick one dimension
per chart. If a future view genuinely needs both at once (e.g. small
multiples faceted by `control`, colored by `institution_type` within each
facet), that's a fresh design decision to make deliberately, not an automatic
composition of these two palettes.
