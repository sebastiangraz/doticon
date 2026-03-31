---
name: Unify DotIcon animations with Motion
overview: Remove the custom requestAnimationFrame loop and custom blend-spring, and drive DotIcon’s animated states solely via Motion values (time/transforms/springs) so all animation logic uses one API.
todos:
  - id: review-current-animation-paths
    content: Map current rAF loop responsibilities to Motion equivalents (time, blend spring, smoothing).
    status: completed
  - id: implement-motion-time-driver
    content: Add Motion time/angle derivations with per-state phase reset.
    status: completed
  - id: replace-blend-spring
    content: Replace `stepBlend` + `elapsed` staggering with per-dot `blend` MotionValues animated via Motion springs.
    status: completed
  - id: derive-dot-motion-values
    content: Compute `cx/cy/r/opacity` as derived MotionValues (mix snapshot → target), optionally springing radius/values.
    status: completed
  - id: remove-raf-and-cleanup
    content: Delete rAF refs/loop code and unused helpers; ensure no imperative per-frame `.set()` remains.
    status: completed
  - id: validate-states
    content: Manually verify transitions and continuous behavior for `dormant`, `thinking`, `loading`.
    status: completed
isProject: false
---

# Unify DotIcon animations with Motion

## Goal

- Eliminate `requestAnimationFrame` usage (`startLoop`/`stopLoop`) and the in-loop custom solver (`stepBlend`).
- Keep behavior/visuals: animated states (`thinking`, `loading`) continuously evolve; transitions into them still “morph” from current pose with stagger.
- Use Motion’s optimized frame loop + MotionValue graph: `time → angle → layout/opacities → projected targets → (blend + springs) → SVG`.

## Current architecture (what we’re replacing)

- `src/components/DotIcon/DotIcon.tsx`
  - Animated states run a manual `requestAnimationFrame` loop that:
    - Integrates `layoutAngleRef` and `opacityAngleRef`
    - Computes target layout/opacities each frame
    - Blends from a snapshot via `lerp()` and a custom spring step `stepBlend()`
    - Writes into `MotionValue`s via `.set()`
  - Static transitions use `animate(mv, target, SPRING)`.

Key code to remove/replace:

- `rafRef`, `tRef`, `layoutAngleRef`, `opacityAngleRef`
- `startLoop()`, `stopLoop()`
- `stepBlend()`
- Per-frame `.set()` updates of `cx/cy/r/opacity`

## Proposed Motion-only design

### 1) Introduce a single time driver

- Add `const time = useTime()` (from `motion/react`) inside `DotIcon`.
  - This yields a MotionValue that Motion updates using its internal scheduler.
- Derive angles from time:
  - `layoutAngle = useTransform(time, (ms) => (ms / 1000) * layoutSpeed)`
  - `opacityAngle = useTransform(time, (ms) => (ms / 1000) * opacitySpeed)`
- On state change, reset phase by storing a `timeOffset` MotionValue (or a ref) so each state starts at 0 (preserves today’s behavior where angles reset in the effect):
  - `phaseTime = useTransform(time, (ms) => ms - phaseStartMsRef.current)`
  - Then compute angles from `phaseTime`.

### 2) Replace “animated state morph-in” blend spring with Motion springs

- On transition **into** an animated state:
  - Snapshot the current rendered pose (same data as today’s `Snapshot`).
  - Create per-dot `blend` MotionValues initialized to 0.
  - Animate each `blend[i]` to 1 using `animate(blend[i], 1, { ...SPRING, delay: i*STAGGER })`.
  - This replaces `stepBlend()` entirely.
- On transition **out of** an animated state into a static one:
  - Stop any running `animate(blend[i])` controls.
  - Use the existing `morphTo()` (or migrate it to the same derived-value pipeline for consistency).

### 3) Compute targets from Motion transforms instead of an imperative loop

- For animated states, compute per-dot target values as derived MotionValues.
- Conceptually per dot:
  - `targetProjected[i] = project(def.layout(layoutAngle).at(i))`
  - `targetOpacity[i] = resolveOpacities(def.opacities, opacityAngle)[i]`
- Then apply blend against the snapshot:
  - `mixedCx = mix(src.sx, target.sx, blend)`
  - `mixedCy = mix(src.sy, target.sy, blend)`
  - `mixedR = mix(src.r, target.size/2, blend)`
  - `mixedOpacity = mix(src.opacity, targetOpacity, blend)`

Implementation notes to keep it idiomatic:

- Use Motion’s `useTransform` with multiple inputs (`useTransform([layoutAngle, blendMV], ([a,b]) => ...)`) to create derived MotionValues.
- Use Motion’s `mix` helper if available in your Motion version; otherwise keep a tiny `lerp()` helper for numeric mixing (this is not “animation logic”, just arithmetic).

### 4) Use `useSpring` to replace radius smoothing and optionally smooth positions

- Replace `RADIUS_SMOOTH_TAU_S` exponential smoothing with a spring layer:
  - `smoothedR = useSpring(mixedR, { stiffness, damping, mass })`
- Optionally also spring `cx/cy/opacity` if you want the same feel as `morphTo()` during the blend-in (often you can leave `cx/cy/opacity` unsprung during continuous animation and only spring the blend MV; we’ll match current feel by testing both).

### 5) Rendering & paint order

- Today, circles are rendered in index order; `robots.md` mentions sorting by Z, but the component doesn’t currently sort.
- As part of this refactor, decide one of these (pick based on desired behavior):
  - **Keep as-is** (lowest risk): keep stable index ordering.
  - **Implement Z ordering** (align with docs): compute per-frame ordering key from the same angle-derived layout and render in sorted order.

Given the user request is “eliminate rAF”, not “change rendering semantics”, the plan defaults to **keep as-is** unless you explicitly want Z-sort.

## Concrete file-level steps

### A) Refactor `DotIcon.tsx`

- In `src/components/DotIcon/DotIcon.tsx`:
  - **Remove**: `rafRef`, `layoutAngleRef`, `opacityAngleRef`, `tRef`, `startLoop`, `stopLoop`, `stepBlend`, `RADIUS_SMOOTH_TAU_S` smoothing logic.
  - **Add**:
    - `useTime`, `useTransform`, `useSpring` imports from `motion/react`.
    - `phaseStartMsRef` (ref) set on each `state` change to reset phase to 0.
    - `blend` MotionValues (array) managed in a ref so we can reuse/stop their animations.
    - `sources` snapshot stored in a ref when entering an animated state.
  - **Replace** the state transition effect:
    - If `def.animated`:
      - capture snapshot
      - set phase start
      - start blend animations via `animate(blend[i], 1, …)`
      - rely on derived MotionValues for continuous updates (no loop)
    - Else:
      - call `morphTo()` (or implement the static state as constant targets)

### B) Keep/adjust layout & opacity functions

- Leave `dormantLayout`, `thinkingLayout`, `loadingLayout`, `thinkingOpacities`, `loadingOpacities` mostly unchanged.
- `lerp()` can remain for geometry computations, but all _animation easing/smoothing_ will be via `useSpring`/`animate`.

### C) Verify behavior against existing states

- **Dormant → Thinking**: morph-in stagger, then continuous spin + opacity wave.
- **Dormant → Loading**: morph-in stagger, then continuous fill/trail cycling.
- **Thinking/Loading → Dormant**: no continuous updates; spring morph to grid.

## Test plan

- In a dev page/story that toggles `state`:
  - Rapidly toggle between `dormant`, `thinking`, `loading`.
  - Confirm no runaway timers (no rAF loop) and no stale animations after state changes.
  - Confirm motion feels at least as smooth as before.

## Rollout strategy

- Do the refactor in one PR but keep changes scoped to `DotIcon.tsx`.
- If you want a safer rollout: temporarily keep `morphTo()` for static transitions unchanged and only migrate animated states first.
