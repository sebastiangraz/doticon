---
name: Unify Z to 0–3 integers
overview: Refactor Z coordinates from the current float/signed system (centered at 0, range ±1.5) to use the same 0–3 integer space as X and Y, eliminating Z_EXTENT entirely. All Z values are expressed relative to GRID to make a future dynamic grid size feature (4x4x4 → 3x3x3 based on size prop) a localized change.
todos:
  - id: remove-z-extent
    content: Remove Z_EXTENT constant
    status: completed
  - id: fix-snapsize
    content: Update snapSize to use GRID-based normalization
    status: completed
  - id: fix-dormant
    content: Update dormantLayout Z values relative to GRID (GRID.max - 1 / GRID.max - 2)
    status: completed
  - id: fix-thinking
    content: Update thinkingLayout to use GRID.center for all three axes
    status: completed
  - id: fix-loading
    content: Update loadingLayout Z lerp endpoints relative to GRID (GRID.max / GRID.max - 2)
    status: completed
  - id: fix-comment
    content: Fix stale Z snap zones comment on line 10
    status: completed
isProject: false
---

# Unify Z Axis to 0–3 Integer Space

All changes are in `[src/components/DotIcon/DotIcon.tsx](src/components/DotIcon/DotIcon.tsx)`. The output is visually identical — only the coordinate representation changes.

## Remove Z_EXTENT

Delete line 12:

```
const Z_EXTENT = 1.5;
```

`GRID.center` (1.5) replaces it everywhere.

## Update snapSize (line 52)

```ts
// Before
const t = (z + Z_EXTENT) / (2 * Z_EXTENT);

// After — identical normalization to the XY projection
const t = (z - GRID.min) / (GRID.max - GRID.min);
```

## Update dormantLayout (line 105)

```ts
// Before
z: INNER.has(i) ? 0.5 : -0.5,

// After — expressed relative to GRID so it adapts when grid size changes
z: INNER.has(i) ? GRID.max - 1 : GRID.max - 2,
```

For the current 4x4 grid: `GRID.max - 1 = 2`, `GRID.max - 2 = 1`.
For a future 3x3 grid: `GRID.max - 1 = 1`, `GRID.max - 2 = 0`.

## Update thinkingLayout (lines 112–114)

All three axes become symmetric:

```ts
// Before
x: GRID.center + r.x * Z_EXTENT,
y: GRID.center + r.y * Z_EXTENT,
z: r.z * Z_EXTENT,

// After — z now uses the same formula as x and y
x: GRID.center + r.x * GRID.center,
y: GRID.center + r.y * GRID.center,
z: GRID.center + r.z * GRID.center,
```

## Update loadingLayout (line 150)

```ts
// Before
z: age < DOT_COUNT ? lerp(Z_EXTENT, -0.5, trailT) : -0.5,

// After — expressed relative to GRID
z: age < DOT_COUNT ? lerp(GRID.max, GRID.max - 2, trailT) : GRID.max - 2,
```

For the current 4x4 grid: `lerp(3, 1, trailT) : 1`.

## Fix the stale comment (line 10)

```ts
// Before (wrong sizes, stale from prior DOT_SIZES)
// Z snap zones: z < -1 → 4px, [-1,0) → 5px, [0,1) → 7px, ≥ 1 → 8px

// After
// Z snap zones: 0 → 6px, 1 → 8px, 2 → 10px, 3 → 12px
```

## Verification

Each mapping produces the same snapSize index as before:

- Dormant inner: `0.5 → idx 2` = `GRID.max - 1 (2) → idx 2` (size 10)
- Dormant outer: `-0.5 → idx 1` = `GRID.max - 2 (1) → idx 1` (size 8)
- Loading peak: `1.5 → idx 3` = `GRID.max (3) → idx 3` (size 12)
- Loading settled: `-0.5 → idx 1` = `GRID.max - 2 (1) → idx 1` (size 8)
- Sphere back: `-1.5 → idx 0` = `0 → idx 0` (size 6)
- Sphere front: `1.5 → idx 3` = `3 → idx 3` (size 12)

## Out of scope (future dynamic grid feature)

When the `size`-based grid switching is implemented, the following will also need to change — but this plan deliberately leaves them untouched:

- `DOT_COUNT` becomes derived from grid size (N²)
- `INNER` set is recalculated per grid size
- `DOT_SIZES` needs a 3-element variant for 3x3x3
- `SPHERE_BASE` generates N² points
- `LOADING_FILL_ORDER` / `LOADING_DOT_RANK` are derived from grid size
- `GRID` becomes a computed variable rather than a constant
