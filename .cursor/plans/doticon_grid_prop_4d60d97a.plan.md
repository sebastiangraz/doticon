---
name: DotIcon Grid Prop
overview: Add a `grid` prop to `DotIcon` that controls the NxN dot grid (e.g. 3, 4, 5…), making `DOT_COUNT` and all derived constants dynamic via a single `GridConfig` factory.
todos:
  - id: grid-config-factory
    content: Add pure GridConfig type (n, dotCount, grid bounds, dotSizes, defaultOpacities) and buildGridConfig(n) factory
    status: completed
  - id: refactor-geometry
    content: Refactor project, snapSize, and all layout/opacity functions to accept GridConfig
    status: completed
  - id: build-states
    content: Replace module-level STATES const with buildStates(config); move innerSet/sphereBase/loadingOrder as private closures inside each state builder
    status: completed
  - id: dotcircle-dotcount
    content: Add dotCount prop to DotCircle, replacing bare DOT_COUNT reference
    status: completed
  - id: doticon-grid-prop
    content: Add grid prop to DotIcon, memoize GridConfig, handle grid changes by reinitializing targetsRef
    status: completed
isProject: false
---

# DotIcon Grid Prop

## Goal

`<DotIcon size={32} state="thinking" grid={5} />` — the `grid` prop (default `4`) becomes the single source of truth for everything that is currently hardcoded to a 4×4 layout.

## What is currently hardcoded to 4

All of the following live in `[src/components/DotIcon/DotIcon.tsx](src/components/DotIcon/DotIcon.tsx)` and assume a 4×4 grid:

- `GRID = { min: 0, max: 3, center: 1.5 }` — coordinate bounds
- `DOT_COUNT = 16` — total dots
- `DOT_SIZES = [6, 8, 10, 12]` — one size per Z level (4 levels)
- `DEFAULT_OPACITIES` — flat 16-value artistic pattern
- `INNER = new Set([6, 9])` — anti-diagonal indices for dormant depth
- `dormantLayout` — uses `i % 4` and `Math.floor(i / 4)`
- `SPHERE_BASE` — sized by `DOT_COUNT`
- `thinkingOpacities` — uses `DOT_COUNT`
- `LOADING_FILL_ORDER` — hardcoded 16-element column-major array
- `LOADING_DOT_RANK` / `LOADING_CYCLE` / `LOADING_TRAIL_STEPS` — all derived from `DOT_COUNT`
- `loadingLayout` — uses `i % 4`
- `loadingOpacities` — iterates `DOT_COUNT`
- `DotCircle` — uses `DOT_COUNT` for stagger `t = i / (DOT_COUNT - 1)`

## Approach: `GridConfig` + `buildStates` separation

### `GridConfig` — pure coordinate system

`GridConfig` describes only the geometry of the grid, with no knowledge of any state. Adding or removing a state never requires changing this type.

```typescript
type GridConfig = {
  n: number; // grid dimension
  dotCount: number; // n * n
  grid: { min: 0; max: number; center: number };
  dotSizes: readonly number[]; // n entries, e.g. [6,8,10,12] for n=4
  defaultOpacities: number[];
};
```

### `buildGridConfig(n)` derived values

- `grid` → `{ min: 0, max: n-1, center: (n-1)/2 }`
- `dotSizes` → `n` steps from 6 up by 2 each: `[6, 8, …, 6+(n-1)*2]`
- `defaultOpacities` → generative rule matching the existing 4×4 artistic pattern:
  - `(col+row) % 2 === 1` → `1.0`; otherwise `0.45`
  - top-left `(0,0)` and bottom-right `(n-1,n-1)` → `0.12`

### State-specific precomputed data lives inside `buildStates`

`innerSet`, `sphereBase`, `loadingFillOrder`, and `loadingDotRank` are each private to the state that needs them. `buildStates(config)` is the only place they are computed, closed over by each state's layout function:

```typescript
const buildStates = (config: GridConfig): Record<StateKey, StateDef> => {
  // dormant-only
  const innerSet = buildInnerSet(config);
  // thinking-only
  const sphereBase = buildSphereBase(config);
  // loading-only
  const { fillOrder, dotRank } = buildLoadingOrder(config);

  return {
    dormant:  { layout: () => dormantLayout(config, innerSet), ... },
    thinking: { layout: (a) => thinkingLayout(config, sphereBase, a), ... },
    loading:  { layout: (a) => loadingLayout(config, dotRank, a), ... },
  };
};
```

Each builder (`buildInnerSet`, `buildSphereBase`, `buildLoadingOrder`) is a small pure function that takes a `GridConfig` and returns only what its state needs.

### Refactored shared geometry functions

- `project(v, config)` — uses `config.grid`, `config.dotSizes`
- `snapSize(z, config)` — uses `config.grid`, `config.dotSizes`
- `thinkingOpacities(dotCount, angle)` — only needs dot count, not full config

### `DotCircle` change

Add `dotCount: number` prop; replace the bare `DOT_COUNT` reference in the stagger formula:

```typescript
const t = dotCount <= 1 ? 0 : i / (dotCount - 1);
```

### `DotIcon` component

1. Accept `grid?: number` (default `4`)
2. Build (and memoize with `useMemo`) a `GridConfig` from `grid`
3. Pass `config` into all layout/state calls
4. Pass `config.dotCount` into each `<DotCircle />`
5. Handle `grid` changes: detect in render that `grid !== gridRef.current`, rebuild `targetsRef` with the new dot count, and update `gridRef` — React naturally adds/removes `<DotCircle>` elements since they are keyed by index and the array length changes

```typescript
// Reinitialize motion values when grid changes
if (gridRef.current !== grid) {
  gridRef.current = grid;
  const def = states[state];
  const proj = def.layout().map((v) => projectWithConfig(v, config));
  const opa = resolveOpacities(def.opacities, 0);
  targetsRef.current = proj.map((p, i) => ({
    cx: motionValue(p.sx),
    cy: motionValue(p.sy),
    r: motionValue(p.size / 2),
    opacity: motionValue(opa[i]),
  }));
}
```

> Note: changing `grid` at runtime reinitializes all motion values (no continuity across different dot counts). This is expected — the dot topology changes fundamentally.

## Files changed

- `[src/components/DotIcon/DotIcon.tsx](src/components/DotIcon/DotIcon.tsx)` — only file that needs editing
