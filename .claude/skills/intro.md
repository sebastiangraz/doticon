## DotIcon — a state-machine icon built on a dynamic 3D coordinate system, rendered as SVG.

## Core concept:

An N×N dot grid (controlled by the `grid` prop, default 4) treated as vertices in a cartesian coordinate space (`Vec3`). `buildGridConfig(n)` produces a `GridConfig` containing `n`, `dotCount` (n²), and `grid: { min: 0, max: n-1, center: (n-1)/2 }`. `GridConfig` is a pure coordinate-system description — it carries no state-specific data. Adding or removing a state never requires changing it. Dots use `fill="currentColor"` so color is controlled externally.

## 3D engine:

Orthographic projection — drops Z, maps X/Y linearly into the SVG viewBox sized by `VIEW_SIZE` (100) with padding `SVG_PAD` (14). `SVG_SPAN = VIEW_SIZE - 2 * SVG_PAD`. No perspective division. Coordinates accept decimals for smooth morphing between layouts.

Z → dot size: `DOT_SIZES = [6, 8, 12, 16, 20]` (back → front, 5 tiers, independent of grid size). Z lives in `[0, DOT_SIZES.length - 1]` — the same index space as `DOT_SIZES` itself, decoupled from the XY grid range. `lerpSize(z)` normalises Z over `[0, DOT_SIZES.length - 1]`, linearly interpolates between adjacent `DOT_SIZES` entries, and returns a continuous size value. For integer Z it matches a discrete tier; for fractional Z it blends between adjacent tiers — smooth by construction, no per-dot spring needed for size. Dot radius = `lerpSize(z) / 2`.

**`gridBaseZ(config)`** — inverse grid-density sizing. Smaller grids → higher Z (larger dots), larger grids → lower Z (smaller dots). Returns a direct `DOT_SIZES` index: `step = Math.max(0, n - 3)`, `baseZ = max(0, DOT_SIZES.length - 1 - step)`. No back-solve needed since Z and DOT_SIZES share the same index space. This keeps dots visually proportional regardless of grid resolution.

Paint order: no depth-based paint ordering (no Z-sort). SVG circles render in stable index order.

3D math: `rotateY` is the primary rotation — standard cos/sin matrix multiplication.

## State system:

`buildStates(config)` returns `Record<StateKey, StateDef>`, rebuilt whenever `GridConfig` changes. State-specific precomputed data (sphere points, loading order, dormant opacities) is closed over inside `buildStates` — private to each state, invisible to `GridConfig`.

`StateDef` has: `label`, `layout(angle?) → Vec3[]`, `opacities: number[] | ((ctx: OpacitySolveCtx) => number[])`, `animated`, `projConfig: GridConfig` (the coordinate space used to project this state's layout into SVG — may differ from the component's base config), optional `layoutSpeed` (rad/s for 3D spin), optional `opacitySpeed` (rad/s for opacity phase; defaults to `layoutSpeed` when omitted).

`OpacitySolveCtx = { layoutAngle, opacityAngle }` — two independent phase angles passed to functional opacities. `resolveOpacities()` normalises both static arrays and functions.

Four states exist (`StateKey = "dormant" | "thinking" | "loading" | "dev"`); more can be added by registering one entry in `buildStates` plus layout/opacity definitions. The `dev` state is only visible when `isDevDotIconStateEnabled` is true (localhost / `VITE_ENABLE_DEV_DOTICON_STATE=true`); when disabled, `state="dev"` falls back to `"dormant"`.

**Dev** — flat grid, all dots at `gridBaseZ`, all opacities 1. Not animated. Uses the base `config` as projConfig.

**Dormant** — static logotype pattern. A 7×7 master grid (`DORMANT_MASTER`) encodes dim (0.12), half (0.45), and full (1) opacities in a diagonal motif. Any grid size other than 7 is derived via nearest-neighbour downsampling from this master (`buildDormantOpacities`). Two sizes have full hand-crafted overrides: `DORMANT_4x4_OPACITIES`/`DORMANT_4x4_Z` for grid=4 (the default), and `DORMANT_3x3_OPACITIES`/`DORMANT_3x3_Z` for grid=3 (the small tier). **Size-tier mental model: 3×3 = small, 4×4 = default, 5×5+ = custom.** Despite the "3×3" label, `DORMANT_3x3_*` arrays each hold 16 values because Dormant at grid=3 renders internally as 4×4 (16 dots) — `buildStates` computes `dormantProjConfig = buildGridConfig(4)` when `config.n === 3` and sets it as the state's `projConfig`. All other states at grid=3 continue to use a genuine 3×3 (9 dots). Switching between dormant (16 dots) and another state (9 dots) at grid=3 triggers a full target rebuild, identical to a grid prop change. All other sizes place every dot at `gridBaseZ(config)`. Not animated.

**Thinking** — Fibonacci sphere. `buildSphereBase(config)` distributes `dotCount` points on a unit sphere. While active, the sphere is rotated by `layoutAngle` via `rotateY`. Z is mapped onto `[0, baseZ]` with `baseZ * (0.5 + 0.6 * r.z)` so front dots match the grid's target size and size variation scales down with grid density. `THINKING_OVERSHOOT = 1.1` scales the sphere's XY radius slightly beyond the grid center so dots can extend past grid bounds. Opacities combine a sine wave along the spiral index (phased by `opacityAngle`) with a back-face depth fade from `rotateY(sphereBase[i], layoutAngle).z`. `layoutSpeed = 2.5`, `opacitySpeed = 4`.

**Loading** — column-major fill animation. `buildLoadingRanks(config)` produces a fill sequence (x 0→n-1, y n-1→0) and an inverse rank map. Fill front sits at `baseZ`; the trail falls to `max(0, baseZ - 2)` over `dotCount - 1` steps. `LOADING_PAUSE = 3` adds dead ticks per cycle. Opacity: 1 at fill, fading to 0.12 along the trail; unfilled dots fixed at 0.12. `layoutSpeed = 12`.

## Animation architecture:

Direct DOM mutation with manual Euler-integration springs — no MotionValue intermediary, no per-dot React components.

### Time loop

`useTime()` from Motion provides the frame clock. `useMotionValueEvent(time, "change", callback)` fires the main loop every `requestAnimationFrame`. The loop:

1. Reads the current `StateDef` and dot count from refs (updated during render).
2. **Early exit**: if `!def.animated && !hasSprings && !hasOpaTr` — non-animated state with no active springs or opacity transitions → zero per-frame cost.
3. Computes `layoutAngle` / `opacityAngle` from elapsed time and state speed constants.
4. Evaluates `def.layout(layoutAngle)` and `resolveOpacities(...)` for target positions/opacities.
5. For each dot: projects Vec3 → SVG coordinates, applies spring blending or direct `setAttribute`, computes opacity crossfade, writes to DOM.

### Manual spring system (`spring.ts`)

Replaces Motion's `useSpring`. A `DotSpring` holds `cx, cy, r` positions and `vx, vy, vr` velocities. `stepSpring()` uses Euler integration: `force = -stiffness * (pos - target) - damping * velocity`, applied per axis per frame.

Per-dot spring variation creates a spatial cascade effect: later dots (higher index) get lower stiffness and higher damping/mass, so they lag behind the leaders. Specifically: `stiffness = 240 * (1 - 0.35 * f)`, `damping = 25 * (1 + 0.24 * f)`, `mass = 0.8 * (1 + 0.6 * f)` where `f = i / (n - 1)`.

Settlement threshold: 0.05 across all axes and velocities. Once settled, a spring snaps exactly to target and zeroes velocity. When ALL dots settle, `springActiveRef` is set to false — the spring layer deactivates globally, leaving zero ongoing cost.

### State / grid transitions

Both `useLayoutEffect` hooks — spring init runs synchronously after DOM commit, before any animation frame, preventing a race where the time loop could jump dots to targets before springs are ready.

1. **Circle init** (`useLayoutEffect([dotCount])`): When dot count changes, newly-created `<circle>` elements (no `cx` attribute yet) are positioned at their state's target layout. A spring entry is created for each with `settled: true`. The springs array is truncated to `dotCount` (handles shrink). Existing circles are skipped.

2. **Transition init** (`useLayoutEffect([effectiveState, config, time, dotCount])`): On any state or config change — resets `phaseStartMsRef` (animation clock), snapshots current fill-opacities for crossfade, reads current DOM positions into spring entries, zeroes velocities, marks all as unsettled, and sets `springActiveRef = true`.

For animated state transitions, the time loop computes per-frame target positions and the spring layer blends from old positions toward those moving targets. Once caught up, springs auto-disable and the loop falls back to direct `setAttribute`.

### Opacity crossfade

`OPACITY_STAGGER_MS = 10`, `OPACITY_CROSSFADE_MS = 120`. On state/grid change, a per-dot staggered linear blend runs from the snapshotted old opacity to the new state's target opacity. Once the last dot finishes, the crossfade ref is nulled and the loop falls back to direct opacity assignment.

### Outgoing dots (grid shrink)

When dot count decreases, the component snapshots the positions/sizes/opacities of the excess circles (those about to be removed) during the render phase. These are rendered as separate `<circle>` elements and fade out via Motion's `animate()` over `OUTGOING_FADE_S = 0.2s`, then removed from state.

### Grid changes

When the `grid` prop changes, `config` and `states` are rebuilt via `useMemo`. If `dotCount` changes (it always does when grid changes except dormant 3↔4), React re-renders with a different number of `<circle>` elements. The circle-init `useLayoutEffect` handles new elements; the transition `useLayoutEffect` re-initialises springs for the full set.

## Props:

`size` (px, default 200), `state` (`StateKey`, default `"dormant"`), `grid` (integer N for N×N, default 4; note: when `state="dormant"` and `grid=3` the internal layout is 4×4 — see Dormant size-tier model above), `color`, `style`.

Exports: `StateKey`, `STATE_KEYS`, `getStateLabel`.

## Demo page (index route):

Grid slider (3 discrete options: 3, 4, 7 — mapped to a 0–2 range input), state toggle buttons, a "COPY" button that serialises the current SVG to clipboard, and an `ExposeProps` gallery showing multiple grid sizes (3–7) at each state. The grid slider uses a 140ms debounce (`gridSizeInput` updates immediately for the label; `gridSize` updates after a 140ms timeout) to prevent excessive transitions during rapid dragging.

Also includes in-situ demo cards showing DotIcon in context: a button, a spreadsheet row, an AI chat bubble, and a social asset frame.

## Dependencies:

`motion/react` (Motion) — used for the time driver (`useTime`), the frame subscription (`useMotionValueEvent`), and the outgoing-dot fade animation (`animate`). All 3D math, projection, and spring simulation are custom.
