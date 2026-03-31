## DotIcon — a state-machine icon built on a native 3D coordinate system, rendered as SVG.

## Core concept:

Dot grid (defaulting to 16 dots) treated as vertices in a full cartesian coordinate space (`Vec3`). All three axes share the same integer coordinate space defined by `GRID` (see source), centered on `GRID.center`. Dots are uniform in the backend — size is derived purely from Z-depth at render time via orthographic projection. Uses `fill="currentColor"` so color is controlled externally.

## 3D engine:

Orthographic projection — drops Z, maps X/Y linearly into the SVG viewBox sized by `VIEW_SIZE` with horizontal/vertical padding `SVG_SPAN` derived from `SVG_PAD`. No perspective division; if all vertices of a full 3D volume were populated, the viewer would only see the frontmost layer in XY. Coordinates accept decimals for smooth morphing between layouts.

Z → dot size: Z maps into the discrete `DOT_SIZES` chart via `snapSize()`. Dots render at one of the discrete sizes in that array, not arbitrary pixel values. The chart is a const for tuning.

Z → paint order: circles are sorted back-to-front each frame so frontmost dots render on top.

3D math: `rotateY` is the primary rotation (more axes are straightforward to add). Uses standard cos/sin matrix multiplication.

## State system:

Each entry in `STATES` has: `label`, `layout(angle?)`, `opacities`, `animated`, optional `speed`.

Layout functions return `Vec3[]` — pure 3D positions, no SVG or size info. Projection and size snapping happen at render time. Opacities are per-state: either a static `number[]` or a function `(angle?) → number[]` for animated opacity patterns. `resolveOpacities()` normalizes both forms.

Two states exist; more can be added by registering one `STATES` entry plus a layout function:

**Dormant** — static 4×4 grid on Z≈0. The inner 2×2 block uses a higher Z than the outer ring (see `INNER` and `dormantLayout` in source), which drives size via `snapSize` and gives a depth hierarchy. Uses `DEFAULT_OPACITIES`.

**Thinking** — Fibonacci sphere (`SPHERE_BASE`) scaled and centered using `GRID.center` for all three axes. While active, the layout angle advances each animation frame using that state’s `speed` (radians per second; integrated in the `requestAnimationFrame` loop). Z-depth controls both dot size and paint order. Uses `THINKING_OPACITIES`.

## Animation architecture:

Two transition paths depending on whether the target state is `animated`:

→ **Animated state** (e.g. Dormant→Thinking): snapshots current `MotionValue` positions, starts the rAF loop, and blends from the snapshot toward the rotating target using per-dot spring factors computed in-loop (`stepBlend` — semi-implicit Euler, same `dt` as the rotation). The morph and the spin are one unified motion. Each dot’s blend start is staggered by `STAGGER`. Once a blend reaches completion, lerping becomes identity and the loop runs at full speed for that dot.

→ **Static state** (e.g. Thinking→Dormant): stops the rAF loop, then `morphTo()` spring-animates each `MotionValue` (`cx`, `cy`, `r`, `opacity`) toward the target via Motion’s `animate()` with staggered delays from `STAGGER`.

The blend spring solver (`stepBlend`) uses the `SPRING` config and runs inside the rAF tick so frame scheduling stays consistent with `requestAnimationFrame`.

## Props:

`size` (px, default in component), `state` (`StateKey`, default `"dormant"`), `color`, `style`.

State is controlled externally via the `state` prop. `StateKey`, `STATE_KEYS`, and `getStateLabel` are exported for parent components.

## Dependencies:

`motion/react` (Motion) — used for `morphTo` spring animations on static transitions and `MotionValue` bindings on SVG attributes. All 3D math, projection, blend springs, and the rAF loop are custom.
