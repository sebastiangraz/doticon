## DotIcon3D — a state-machine icon built on a native 3D coordinate system, rendered as SVG.

## Core concept:

16 dots treated as vertices in a full cartesian coordinate space (Vec3). The 4×4 grid sits at integer positions X,Y ∈ [0,3] on the Z=0 plane, centered at (1.5, 1.5, 0). Dots are uniform in the backend — size is derived purely from Z-depth at render time via orthographic projection. Uses fill="currentColor" so color is controlled externally.

## 3D engine:

Orthographic projection — drops Z, linearly maps X/Y to a 100×100 SVG viewBox with 18px padding. No perspective division; if all 64 vertices of a 4×4×4 cube were populated, the viewer would only see the front 16. Coordinates accept decimals (e.g. X3.83, Y2.23, Z-1.2) for smooth morphing between layouts.

Z → dot size: the Z axis maps to a clamped size chart DOT_SIZES = [6, 8, 10, 12] via snapSize(). Dots never render at fractional sizes — always one of those four values. The chart is a const for easy tuning.

Z → paint order: circles are sorted back-to-front each frame so frontmost dots render on top.

3D math: rotateY is the primary rotation (more axes trivial to add). Uses standard cos/sin matrix multiplication.

## State system:

Each state entry in STATES has: label, layout(angle?), opacities, animated, speed?

Layout functions return Vec3[] — pure 3D positions, no SVG or size info. Projection and size snapping happen at render time. Opacities are per-state: can be a static number[] or a function (angle?) → number[] for animated opacity patterns. resolveOpacities() normalizes both forms.

Two states exist, more can be added by registering one entry + one layout function:

Dormant — static 4×4 grid on Z≈0. Inner 2×2 dots (indices 5,6,9,10) sit at Z=0.5 (snaps to 10px), outer dots at Z=-0.5 (snaps to 8px), giving the grid visual depth hierarchy. Uses DEFAULT_OPACITIES.

Thinking — Fibonacci sphere (pre-computed unit sphere scaled by Z_EXTENT=1.5, centered on the grid). Continuously rotates around Y at 0.6 rad/s via rAF. Z-depth controls both dot size (6px back → 12px front) and paint order. Uses THINKING_OPACITIES.

## Animation architecture:

Two transition paths depending on whether the target state is animated:

→ animated state (e.g. Dormant→Thinking): snapshots current MotionValue positions, starts the rAF loop immediately, and blends from snapshot toward the rotating target using per-dot spring factors computed in-loop (stepBlend — semi-implicit Euler, same dt as the rotation). The morph and the spin happen as one unified motion. Each dot's blend is staggered by 35ms. Once blend reaches 1, lerp becomes identity and the loop runs at full speed.

→ static state (e.g. Thinking→Dormant): kills the rAF loop, then morphTo() spring-animates each MotionValue (cx, cy, r, opacity) to the target positions via Motion's animate() with staggered delays.

The blend spring solver (stepBlend) runs inside the rAF tick to avoid frame-scheduling conflicts between Motion's internal loop and requestAnimationFrame.

## Props:

size (px, default 200), state (StateKey, default "dormant"), color, style.

State is controlled externally via the state prop. StateKey, STATE_KEYS, and getStateLabel are exported for parent components.

## Dependencies:

motion/react (Motion) — used only for morphTo spring animations on static transitions and MotionValue bindings on SVG attributes. All 3D math, projection, blend springs, and the rAF loop are custom.
