---
name: grid prop dynamic config
overview: Add a `grid` prop to `DotIcon` that makes the dot count and coordinate system dynamic, replacing all hardcoded `4×4` / `DOT_COUNT = 16` constants with values derived from a single clamped grid setting (3–12).
todos:
  - id: cfg-memo
    content: Add `grid` prop (default 4, clamped 3–12) and derive a `cfg` useMemo object (g, dotCount, gridDef) as the single source of truth
    status: completed
  - id: refactor-helpers
    content: Refactor all module-level helpers and constants that close over GRID/DOT_COUNT (snapSize, project, identity, sortByZ, SPHERE_BASE, thinkingOpacities) to accept cfg or be recomputed inside the component
    status: completed
  - id: layout-fns
    content: Refactor thinkingLayout, loadingLayout, and loadingOpacities to use dynamic dotCount and gridDef
    status: completed
  - id: loading-sequences
    content: Replace hardcoded LOADING_FILL_ORDER / LOADING_DOT_RANK with makeLoadingFillOrder factory derived from g
    status: completed
  - id: default-opacities
    content: Replace hardcoded DEFAULT_OPACITIES array with makeDefaultOpacities(g) factory
    status: completed
  - id: mvs-reinit
    content: Reinitialize mvsRef and reset animation state when grid (cfg) changes, so MotionValue count stays in sync
    status: completed
  - id: robots-doc
    content: Update robots.md to reflect the new dynamic grid prop and remove hardcoded 4×4 / 16-dot references
    status: completed
isProject: false
---

# Grid Prop — Dynamic Grid Configuration

Add a `grid` prop to `DotIcon` that controls the N×N dot grid, replacing all hardcoded assumptions about a 4×4 layout.

## Affected file

- `[src/components/DotIcon/DotIcon.tsx](src/components/DotIcon/DotIcon.tsx)`

## Key constants that become dynamic

All of the following are currently hardcoded to a 4×4 grid and must be derived from `grid` at runtime:

- `GRID` — `{ min: 0, max: grid - 1, center: (grid - 1) / 2 }`
- `DOT_COUNT` — `grid * grid`
- `DOT_SIZES` — stays a fixed lookup chart, but `snapSize` already maps via `GRID.min/max` so it adapts automatically
- `DEFAULT_OPACITIES` — must be generated for N² dots; current hardcoded 16-element array becomes a factory
- `LOADING_FILL_ORDER` / `LOADING_DOT_RANK` — currently a hardcoded column-fill sequence; must be computed for an N×N grid
- `LOADING_CYCLE`, `LOADING_TRAIL_STEPS` — derived from `DOT_COUNT`, already formulaic
- `SPHERE_BASE` — already uses `DOT_COUNT` in its generator, adapts automatically
- `thinkingOpacities` — already uses `DOT_COUNT` in its generator, adapts automatically
- `identity()` — already uses `DOT_COUNT`, adapts automatically

## Prop API

```tsx
<DotIcon size={32} state="thinking" grid={5} />
```

- `grid?: number` — default `4`, clamped internally to `[3, 12]`
- Clamping: `const g = Math.min(12, Math.max(3, Math.round(grid ?? 4)))`

## Architecture approach

Because `grid` changes `DOT_COUNT`, all `MotionValue` arrays (`mvsRef`) and state-machine data are sized to `dotCount`. The cleanest approach is to treat a `grid` change the same way a full remount would behave — reinitialize `mvsRef` when `grid` changes.

Use a `useMemo`-derived config object as the single source of truth:

```ts
const cfg = useMemo(() => {
  const g = Math.min(12, Math.max(3, Math.round(grid ?? 4)));
  const dotCount = g * g;
  const gridDef = { min: 0, max: g - 1, center: (g - 1) / 2 };
  return { g, dotCount, gridDef };
}, [grid]);
```

All layout functions (`dormantLayout`, `thinkingLayout`, `loadingLayout`) and helpers (`identity`, `snapSize`, `project`, `thinkingOpacities`, etc.) that currently close over the module-level `GRID` / `DOT_COUNT` constants need to be refactored to accept or close over `cfg` instead. The cleanest path is to move them inside the component or into a factory function that takes `cfg`.

## `DEFAULT_OPACITIES` generalization

The current 16-element pattern uses a hand-tuned array. For arbitrary N, generate a similar corner-dimmed pattern:

```ts
const makeDefaultOpacities = (g: number): number[] =>
  Array.from({ length: g * g }, (_, i) => {
    const col = i % g;
    const row = Math.floor(i / g);
    const isCorner =
      (col === 0 || col === g - 1) && (row === 0 || row === g - 1);
    return isCorner ? 0.12 : col % 2 === row % 2 ? 1 : 0.45;
  });
```

## `LOADING_FILL_ORDER` generalization

Current order is column-by-column, bottom-to-top. Generalize:

```ts
const makeLoadingFillOrder = (g: number): number[] => {
  const order: number[] = [];
  for (let col = 0; col < g; col++)
    for (let row = g - 1; row >= 0; row--) order.push(row * g + col);
  return order;
};
```

## `robots.md` update

The doc currently states "defaulting to 16 dots" and "4×4 grid" — update those references to reflect the new dynamic grid.
