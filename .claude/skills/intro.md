## DotIcon — a state-machine icon built on a dynamic 3D coordinate system, rendered as SVG.

## Core concept:

An N×N dot grid (controlled by the `grid` prop, default 4) treated as vertices in a cartesian coordinate space (`Vec3`). `buildGridConfig(n)` produces a `GridConfig` containing `n`, `dotCount` (n²), and `grid: { min: 0, max: n-1, center: (n-1)/2 }`. `GridConfig` is a pure coordinate-system description — it carries no state-specific data. Adding or removing a state never requires changing it. Dots use `fill="currentColor"` so color is controlled externally.

## 3D engine:

Orthographic projection — drops Z, maps X/Y linearly into the SVG viewBox sized by `VIEW_SIZE` (100) with padding `SVG_PAD` (14). `SVG_SPAN = VIEW_SIZE - 2 * SVG_PAD`. No perspective division. Coordinates accept decimals for smooth morphing between layouts.

Z → dot size: `DOT_SIZES = [6, 8, 12, 16]` (back → front, independent of grid size). Z lives in `[0, DOT_SIZES.length - 1]` — the same index space as `DOT_SIZES` itself, decoupled from the XY grid range. `snapSize(z)` normalises Z over `[0, DOT_SIZES.length - 1]` and rounds to the nearest size index. Dot radius = `snapSize(z) / 2`, then smoothed at render time by per-dot Motion springs.

**`gridBaseZ(config)`** — inverse grid-density sizing. Smaller grids → higher Z (larger dots), larger grids → lower Z (smaller dots). Returns a direct `DOT_SIZES` index: `step = Math.max(0, n - 3)`, `baseZ = max(0, DOT_SIZES.length - 1 - step)`. No back-solve needed since Z and DOT_SIZES share the same index space. This keeps dots visually proportional regardless of grid resolution.

Paint order: no depth-based paint ordering (no Z-sort). SVG circles render in stable index order.

3D math: `rotateY` is the primary rotation — standard cos/sin matrix multiplication.

## State system:

`buildStates(config)` returns `Record<StateKey, StateDef>`, rebuilt whenever `GridConfig` changes. State-specific precomputed data (sphere points, loading order, dormant opacities) is closed over inside `buildStates` — private to each state, invisible to `GridConfig`.

`StateDef` has: `label`, `layout(angle?) → Vec3[]`, `opacities: number[] | ((ctx: OpacitySolveCtx) => number[])`, `animated`, `projConfig: GridConfig` (the coordinate space used to project this state's layout into SVG — may differ from the component's base config), optional `layoutSpeed` (rad/s for 3D spin), optional `opacitySpeed` (rad/s for opacity phase; defaults to `layoutSpeed` when omitted).

`OpacitySolveCtx = { layoutAngle, opacityAngle }` — two independent phase angles passed to functional opacities. `resolveOpacities()` normalises both static arrays and functions.

Three states exist (`StateKey = "dormant" | "thinking" | "loading"`); more can be added by registering one entry in `buildStates` plus layout/opacity definitions:

**Dormant** — static logotype pattern. A 7×7 master grid (`DORMANT_MASTER`) encodes dim (0.12), half (0.45), and full (1) opacities in a diagonal motif. Any grid size other than 7 is derived via nearest-neighbour downsampling from this master (`buildDormantOpacities`). Two sizes have full hand-crafted overrides: `DORMANT_4x4_OPACITIES`/`DORMANT_4x4_Z` for grid=4 (the default), and `DORMANT_3x3_OPACITIES`/`DORMANT_3x3_Z` for grid=3 (the small tier). **Size-tier mental model: 3×3 = small, 4×4 = default, 5×5+ = custom.** Despite the "3×3" label, `DORMANT_3x3_*` arrays each hold 16 values because Dormant at grid=3 renders internally as 4×4 (16 dots) — `buildStates` computes `dormantProjConfig = buildGridConfig(4)` when `config.n === 3` and sets it as the state's `projConfig`. All other states at grid=3 continue to use a genuine 3×3 (9 dots). Switching between dormant (16 dots) and another state (9 dots) at grid=3 triggers a full target rebuild, identical to a grid prop change. All other sizes place every dot at `gridBaseZ(config)`. Not animated.

**Thinking** — Fibonacci sphere. `buildSphereBase(config)` distributes `dotCount` points on a unit sphere. While active, the sphere is rotated by `layoutAngle` via `rotateY`. Z is mapped onto `[0, baseZ]` with `baseZ * (0.5 + 0.5 * r.z)` so front dots match the grid's target size and size variation scales down with grid density. Opacities combine a sine wave along the spiral index (phased by `opacityAngle`) with a back-face depth fade from `rotateY(sphereBase[i], layoutAngle).z`. `layoutSpeed = 3`, `opacitySpeed = 4`.

**Loading** — column-major fill animation. `buildLoadingOrder(config)` produces a fill sequence (x 0→n-1, y n-1→0) and an inverse rank map. Fill front sits at `baseZ`; the trail falls to `max(grid.min, baseZ - 2)` over `dotCount - 1` steps. `LOADING_PAUSE = 2` adds dead ticks per cycle. Opacity: 1 at fill, fading to 0.12 along the trail; unfilled dots fixed at 0.12. `layoutSpeed = 12`.

## Animation architecture:

Motion-only "follow springs" model (no `requestAnimationFrame` loop):

- A stable set of per-dot target `MotionValue`s (`cx`, `cy`, `r`, `opacity`) is updated on Motion's internal frame loop using `useTime()` + `useMotionValueEvent(time, "change", ...)`.
- Each rendered `DotCircle` uses `useSpring` for `cx`, `cy`, `r`, and `opacity`, and simply follows the continuously-updated targets.
- Result: rapid state switching feels like a spring chasing a moving target (no queued transitions to "finish"), while still producing smooth morphs between states.

Stagger: per-dot spring variation (later dots are slightly heavier/softer) creates a spatial cascade without explicit delays.

**Opacity crossfade on state change**: `OPACITY_STAGGER_MS = 12`, `OPACITY_CROSSFADE_MS = 160`. When state changes, a per-dot staggered linear blend runs from the old opacity snapshot to the new state's target opacity. This prevents abrupt opacity jumps. Once the last dot finishes blending, the crossfade math is disabled and the handler falls back to direct assignment.

**Grid changes**: when the `grid` prop changes, the target `MotionValue` array is rebuilt from scratch (dot count changes — no continuity is possible). The opacity transition ref is also reset.

## Props:

`size` (px, default 200), `state` (`StateKey`, default `"dormant"`), `grid` (integer N for N×N, default 4; note: when `state="dormant"` and `grid=3` the internal layout is 4×4 — see Dormant size-tier model above), `color`, `style`.

Exports: `StateKey`, `STATE_KEYS`, `getStateLabel`.

## Demo page (index route):

Grid slider (range 2–13), state toggle buttons, and an `ExposeProps` gallery showing multiple grid sizes (3–7) at each state.

## Dependencies:

`motion/react` (Motion) — used for the internal time driver (`useTime`), target updates (`useMotionValueEvent`), MotionValues, and per-dot `useSpring` following. All 3D math and projection are custom; animation scheduling is handled by Motion.
