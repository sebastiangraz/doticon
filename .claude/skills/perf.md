# DotIcon Performance Overhaul

## Problem

With 10+ always-animated DotIcon instances on the page (thinking/loading states), CPU usage was extremely high. The root cause was the MotionValue event cascade architecture.

## Root Cause Analysis

The original architecture per DotIcon instance:

1. `useTime()` fires every frame
2. Time loop computes positions → calls `.set()` on 4 MotionValues per dot (cx, cy, r, opacity)
3. Each `.set()` fires a `change` event
4. `DotCircle` component subscribes via `useMotionValueEvent` → calls `.set()` or `.jump()` on its own spring MotionValues
5. Spring MotionValues feed into `<motion.circle>` which schedules WAAPI updates

For 10 instances × ~20 dots × 4 attributes = **~800 MotionValue mutations per frame**, each triggering event dispatch + spring operations = **~2,400 framework operations per frame at 60fps = ~144,000 operations/second** — continuously, even when nothing visually changes within a cycle.

## Changes

### 1. Eliminated MotionValue intermediary layer

Replaced the entire `motionValue()` → `DotCircle` → `useSpring` → `motion.circle` pipeline with direct DOM mutation via `element.setAttribute()` in the time loop. The time loop now writes straight to SVG circle elements — zero framework dispatch overhead.

**Before:** `useTime` → `motionValue.set()` → event → `DotCircle.useMotionValueEvent` → `spring.set()` → `motion.circle` → WAAPI
**After:** `useTime` → `element.setAttribute()`

### 2. Replaced `snapSize()` with `lerpSize()`

The original `snapSize()` used `Math.round()` to snap Z-depth values to discrete `DOT_SIZES` indices. This produced jarring size jumps during animated states, which were previously masked by per-dot `useSpring` hooks smoothing the radius. Removing the spring layer exposed these jumps.

`lerpSize()` linearly interpolates between adjacent `DOT_SIZES` entries, producing continuous size values. For integer Z values (dormant state) both functions are identical. For fractional Z values (animated states) lerpSize gives smooth sizes by construction — no per-dot spring needed.

### 3. Manual spring simulation for state transitions

Replaced Motion's `useSpring` (which kept springs permanently scheduled in Motion's internal animation loop) with a lightweight manual Euler integration spring that only runs during state transitions:

- On state change: capture current DOM positions, initialise spring state
- Each frame: `stepSpring()` advances position toward target using `force = -stiffness * (pos - target) - damping * velocity`
- Per-dot spring variation (stiffness/damping/mass scaled by dot index) preserved from original for spatial cascade effect
- Once all dots settle within threshold (0.05px), springs deactivate — **zero ongoing cost**

### 4. Spring blending for animated state transitions

Springs now activate for ALL state transitions, including transitions to animated states (thinking, loading). The animated time loop computes per-frame target positions and the spring layer blends from old positions toward those moving targets. Once caught up, springs auto-disable and the loop falls back to direct `setAttribute`.

### 5. Grid change reactivity

Added `config` to the state transition effect's dependency array. Previously, grid changes that didn't alter the dot count (e.g. grid 3↔4 in dormant, both 16 dots internally) silently failed to update positions, opacities, and sizes.

### 6. Removed DotCircle component

`DotCircle.tsx` is no longer imported. The main component renders plain `<circle>` elements and manages them directly. The file remains on disk but is dead code.

## Result

- **Animated states:** 1 `setAttribute` call per attribute per dot per frame. No event dispatch, no spring scheduling, no WAAPI overhead.
- **Non-animated states (settled):** Time loop early-returns. Zero per-frame cost.
- **State transitions:** Brief spring simulation (~0.3–0.5s) then auto-settles to zero cost.
