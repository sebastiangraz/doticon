## DotIcon — a state-machine icon built on a native 3D coordinate system, rendered as SVG.

## Core concept:

Dot grid (defaulting to 16 dots) treated as vertices in a full cartesian coordinate space (`Vec3`). All three axes share the same integer coordinate space defined by `GRID` (see source), centered on `GRID.center`. Dots are uniform in the backend — size is derived purely from Z-depth at render time via orthographic projection. Uses `fill="currentColor"` so color is controlled externally.

## 3D engine:

Orthographic projection — drops Z, maps X/Y linearly into the SVG viewBox sized by `VIEW_SIZE` with horizontal/vertical padding `SVG_SPAN` derived from `SVG_PAD`. No perspective division; if all vertices of a full 3D volume were populated, the viewer would only see the frontmost layer in XY. Coordinates accept decimals for smooth morphing between layouts.

Z → dot size: Z maps into the discrete `DOT_SIZES` chart via `snapSize()`. Dot radius uses `snapSize(z) / 2` and is then smoothed at render time by per-dot Motion springs (so bucket changes ease instead of “popping”). The chart is a const for tuning.

Paint order: there’s currently **no depth-based paint ordering** (no Z-sort). SVG circles render in stable index order. If Z sorting is desired, it can be added by sorting render order based on projected `z` each frame.

3D math: `rotateY` is the primary rotation (more axes are straightforward to add). Uses standard cos/sin matrix multiplication.

## State system:

Each entry in `STATES` has: `label`, `layout(angle?)`, `opacities`, `animated`, optional `layoutSpeed`, optional `opacitySpeed`.

Layout functions return `Vec3[]` — pure 3D positions, no SVG or size info. Projection and size snapping happen at render time. Opacities are per-state: either a static `number[]` or a function `(angle?) → number[]` for animated opacity patterns. `resolveOpacities()` normalizes both forms.

Three states exist; more can be added by registering one `STATES` entry plus a layout + opacity definition:

**Dormant** — static 4×4 grid on Z≈0. The inner 2×2 block uses a higher Z than the outer ring (see `INNER` and `dormantLayout` in source), which drives size via `snapSize` and gives a depth hierarchy. Uses `DEFAULT_OPACITIES`.

**Thinking** — Fibonacci sphere (`SPHERE_BASE`) scaled and centered using `GRID.center` for all three axes. While active, `layoutAngle` and `opacityAngle` advance with Motion time using `layoutSpeed` and `opacitySpeed`. Z-depth controls dot size (via `snapSize`) and thus dot radius.

**Loading** — 4×4 grid “fill” animation with a trailing fade. While active, the layout/opacity phase advances with Motion time using `layoutSpeed`.

## Animation architecture:

Motion-only “follow springs” model (no `requestAnimationFrame` loop):

- A stable set of per-dot target `MotionValue`s (`cx`, `cy`, `r`, `opacity`) is updated on Motion’s internal frame loop using `useTime()` + `useMotionValueEvent(time, "change", ...)`.
- Each rendered dot uses `useSpring` for `cx`, `cy`, `r`, and `opacity`, and simply follows the continuously-updated targets.
- Result: rapid state switching feels like a spring chasing a moving target (no queued transitions to “finish”), while still producing smooth morphs between states.

Stagger in this model is achieved by varying spring response per dot (later dots are slightly heavier/softer), creating a cascade without explicit delays.

## Props:

`size` (px, default in component), `state` (`StateKey`, default `"dormant"`), `color`, `style`.

State is controlled externally via the `state` prop. `StateKey`, `STATE_KEYS`, and `getStateLabel` are exported for parent components.

## Dependencies:

`motion/react` (Motion) — used for the internal time driver (`useTime`), target updates (`useMotionValueEvent`), MotionValues, and per-dot `useSpring` following. All 3D math and projection are custom; animation scheduling is handled by Motion.
