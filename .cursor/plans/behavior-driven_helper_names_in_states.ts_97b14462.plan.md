---
name: Behavior-driven helper names in states.ts
overview: Rename internal helper functions in `states.ts` so names describe behavior (not which state happens to use them), while keeping existing state-prefixed constants unchanged. Produce a consistent naming scheme and an execution checklist to refactor safely across the file and any cross-file imports.
todos:
  - id: inventory-helpers
    content: Inventory all helper functions in `src/components/DotIcon/states.ts` and draft an old→new rename map grouped by behavior buckets.
    status: pending
  - id: resolve-collisions
    content: Decide and document how to handle shared concepts (e.g. unify `pingTent`/`tent` vs keep separate with clearer names).
    status: pending
  - id: apply-renames
    content: Rename helpers and update all call sites (file-local + any cross-file references found).
    status: pending
  - id: validate
    content: Run typecheck/build/tests used by the repo to ensure the rename refactor is safe.
    status: pending
isProject: false
---

### Goal

Make helper/function names in `src/components/DotIcon/states.ts` describe _what they do_ (e.g. ring ripple intensity, S-path pulse ranks, cube surface sampling) instead of which state currently uses them (since states were refactored and helpers got reused in surprising places, e.g. `thinking` using `hoverOpacities`).

### Constraints and conventions

- **Only functions/helpers get behavior-driven renames.** Keep constants state-prefixed (e.g. `HOVER_*`, `THINKING_*`).
- **Prefer noun-phrase helper names** (minimal verbs) while staying readable and consistent.
- Keep public exports stable unless there’s a strong reason (current exports: `buildStates`, `resolveOpacities`, `STATE_KEYS`, `getStateLabel`, `getStateUsage`).

### What we’ll rename (inventory → behavior buckets)

In `src/components/DotIcon/states.ts`, identify helpers that are state-named but behavior-reused, then rename by behavior bucket:

- **Master-pattern resampling**
  - `sample7x7Master` → something like `nearestResample7x7` (generic; not “success”).
- **Static grid/pattern builders**
  - `buildDormantOpacities` → `dormantPatternOpacities`-style _behavior noun_ (but avoid state name); prefer describing the concept (e.g. `logomarkOpacitiesByGrid`).
  - `buildSuccessOpacities`, `buildSuccessZ` → similarly behavior/concept driven (e.g. `checkmarkOpacitiesByGrid`, `checkmarkZByGrid`) if they really represent a checkmark pattern.
- **3D primitives / geometry**
  - `buildSphereBase` (already behavior-ish) → consider noun-phrase like `fibonacciSpherePoints`.
  - `buildThinkingCubeBase` (misleading) → `cubeCornersAndFaceCenters` (used by organizing dice-5 too).
  - `buildOrganizingCubeSurface` → `cubeSurfacePointsKSampled` or similar.
  - `rotateOrganizing`, `axisAngles` → `cubeSpinAxisAngles`, `cubeSpinRotatePoint` (behavior).
- **Column fill / trail**
  - `buildLoadingRanks`, `loadingAge` → `columnMajorRanks`, `rankedAgeInCycle` (behavior).
- **S-path hover pulse (currently reused by thinking)**
  - `buildHoverRanks` → `spathRanks` / `spathArcRanks`.
  - `hoverPulse` → `spathPulse`.
  - `hoverLayout`, `hoverOpacities` → `spathPulseLayout`, `spathPulseOpacities`.
  - This directly fixes the confusing call site:
    - `thinking.layout` currently calls `hoverLayout(...)`
    - `thinking.opacities` currently calls `hoverOpacities(...)`
- **Ping + ring ripple**
  - `buildPingRingDists` → `ringDistances`.
  - `pingTent` → `parabolicTent` (shared concept).
  - `pingIntensity` → `twoPassRingDipIntensity` (or similar).
  - `pingLayout`/`pingOpacities` → `twoPassRingDipLayout`/`twoPassRingDipOpacities`.
  - `hoverRingIntensity`, `hoverRingLayout`, `hoverRingOpacities` → `loopingRingRippleIntensity`, `loopingRingRippleLayout`, `loopingRingRippleOpacities`.
- **Error ripple (X mask + staggered rings)**
  - `buildErrorData` → `xMaskRippleData`.
  - `tent` → avoid collision with the above; unify to one `parabolicTent` and parameterize tail width _or_ keep two but name specifically (e.g. `errorTent`).
  - `errorLayout`, `errorOpacities` → `xRippleLayout`, `xRippleOpacities`.
- **Indexing sequence**
  - `buildIndexingSequence` (already fine) → noun-phrase like `indexingSequence` if desired.
  - `indexingLayout`, `indexingOpacities` → already behavior-ish; optional minor tweaks.

### Plan of attack (safe refactor)

- **1) Build a rename map (single source of truth)**
  - Create a list of all non-exported helpers in `states.ts`.
  - For each, assign a behavior bucket and propose a new name.
  - Ensure names are consistent:
    - `*Layout` returns `Vec3[]`
    - `*Opacities` returns `number[]`
    - `*Intensity` returns `number`
    - `*Ranks` / `*Distances` / `*Sequence` return arrays/structs

- **2) Resolve “shared concept” collisions intentionally**
  - Decide whether to unify `pingTent` and `tent` into one `parabolicTent(d, tail)`.
  - If unifying, verify both call sites match semantics (ping tail vs error tail) and that signatures stay simple.

- **3) Apply renames mechanically**
  - Rename helpers first, then update all references inside `states.ts`.
  - Keep constants unchanged (per your choice).
  - Run a repo-wide search for any imports of renamed helpers (ideally none since helpers are file-local). If any exist, update those call sites too.

- **4) Validate correctness**
  - Typecheck / build (or run the existing test/build command) to confirm no missing references.
  - Smoke-check the key states (especially `thinking`, `hover`, `ping`) to ensure behavior didn’t change (renames only).

### Suggested concrete rename examples (high-signal)

- `buildHoverRanks` → `spathArcRanks`
- `hoverLayout` → `spathPulseLayout`
- `hoverOpacities` → `spathPulseOpacities`
- `buildThinkingCubeBase` → `cubeCornersAndFaceCenters`
- `sample7x7Master` → `nearestResample7x7`

### Files to touch

- Primary: `[src/components/DotIcon/states.ts](src/components/DotIcon/states.ts)`
- Secondary (only if helpers are imported elsewhere): any files referencing the renamed identifiers
