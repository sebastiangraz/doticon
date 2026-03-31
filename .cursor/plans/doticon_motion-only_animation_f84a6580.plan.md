---
name: DotIcon Motion-only animation
overview: Refactor `DotIcon` to remove the custom `requestAnimationFrame` loop and custom spring/lerp blending, relying instead on Motion’s declarative `MotionValue` + `animate` + `useTransform` + `useSpring` so we use one animation system end-to-end.
todos:
  - id: extract-dot-component
    content: Create a per-dot child component that uses Motion hooks (`useTransform`, `useSpring`) and renders one `<motion.circle>`.
    status: pending
  - id: index-addressable-state-api
    content: Refactor `StateDef` to expose `pointAt(i, angle)` + `opacityAt(i, angle)` so targets can be computed cheaply per dot.
    status: pending
  - id: motion-driven-angles
    content: "Replace custom rAF loop with Motion `animate()` controls for `layoutAngle` and `opacityAngle` MotionValues (linear, repeat: Infinity)."
    status: pending
  - id: remove-custom-solver
    content: Delete/retire `lerp`, `stepBlend`, snapshot blending, and radius smoothing logic; rely on springs for continuous smoothing.
    status: pending
  - id: update-docs
    content: Update `robots.md` animation section to describe Motion-only approach and remove references to rAF/blend solver.
    status: pending
  - id: sanity-check
    content: Manually verify dormant/thinking/loading visuals and performance; ensure no direct `requestAnimationFrame` remains in the code.
    status: pending
isProject: false
---

## Goal

- Remove the bespoke frame loop (`requestAnimationFrame` / `cancelAnimationFrame`) and custom blending solver (`stepBlend`, `lerp`, `RADIUS_SMOOTH_TAU_S`) currently driving animated states.
- Keep animated states (`thinking`, `loading`) smooth **continuously** using Motion springs (as requested), while time progression is driven by Motion’s own animation engine (no explicit per-frame loop in our code).

## Current situation (what we’re replacing)

- The component runs its own rAF loop to advance angles and imperatively `set()` dot `MotionValue`s each frame:

```260:360:C:\Users\Sebastian\development\doticon\src\components\DotIcon\DotIcon.tsx
  const rafRef = useRef<number | null>(null);
  const layoutAngleRef = useRef(0);
  const opacityAngleRef = useRef(0);
  // ...
  const startLoop = useCallback(
    (key: StateKey, def: StateDef, sources?: Snapshot[]) => {
      // ...
      const tick = () => {
        // advances angles using dt
        layoutAngleRef.current += layoutSpeed * dt;
        opacityAngleRef.current += opacitySpeed * dt;
        // computes layout + opacities
        const proj = def.layout(layoutAngleRef.current).map(project);
        const opa = resolveOpacities(def.opacities, opacityAngleRef.current);
        // imperatively sets MotionValues per dot
        mvs[i].cx.set(...);
        // ...
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [mvs],
  );
```

- It also uses a custom spring step (`stepBlend`) and `lerp()` blending when entering animated states:

```213:228:C:\Users\Sebastian\development\doticon\src\components\DotIcon\DotIcon.tsx
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const stepBlend = (
  val: number,
  vel: number,
  dt: number,
): { val: number; vel: number } => {
  const force = -SPRING.stiffness * (val - 1) - SPRING.damping * vel;
  const nv = vel + (force / SPRING.mass) * dt;
  const np = val + nv * dt;
  if (Math.abs(np - 1) < 0.001 && Math.abs(nv) < 0.01)
    return { val: 1, vel: 0 };
  return { val: np, vel: nv };
};
```

## Proposed refactor (Motion-only)

### 1) Introduce shared time/angle MotionValues driven by Motion `animate()`

- In `DotIcon`, create MotionValues:
  - `layoutAngleMv = motionValue(0)`
  - `opacityAngleMv = motionValue(0)`
- When `state` is animated, start Motion animations:
  - `animate(layoutAngleMv, layoutAngleMv.get() + 2*Math.PI, { duration: (2*Math.PI)/layoutSpeed, ease: "linear", repeat: Infinity })`
  - `animate(opacityAngleMv, opacityAngleMv.get() + 2*Math.PI, { duration: (2*Math.PI)/opacitySpeed, ease: "linear", repeat: Infinity })`
- When `state` is not animated:
  - stop those controls and set both angles to 0.

This removes all explicit rAF scheduling while keeping time progression.

### 2) Make layouts/opacities index-addressable (to support per-dot transforms efficiently)

Right now layouts build a full `Vec3[]` for all dots each time. To avoid recomputing the whole array 16× per frame in child components, refactor `StateDef` to provide per-index getters:

- Change state definition shape from:
  - `layout: (angle?: number) => Vec3[]`
  - `opacities: number[] | ((angle?: number) => number[])`
- To something like:
  - `pointAt: (i: number, angle?: number) => Vec3`
  - `opacityAt: (i: number, angle?: number) => number`

Implementation notes per state:

- `dormant`: `pointAt` can compute x/y from i, z from the `INNER` set.
- `thinking`: `pointAt` uses `SPHERE_BASE[i]` and `rotateY`.
- `loading`: `pointAt` uses `loadingTimeSinceFill(angle, rank)` and the same Z logic, but without `lerp()` (see next step).

### 3) Replace `lerp()` + custom blend + radius smoothing with Motion `useSpring`

- Delete or stop using:
  - `lerp`
  - `stepBlend`
  - `Snapshot` / `sources` blend path
  - `RADIUS_SMOOTH_TAU_S` and the exponential smoothing block
- Instead, give each dot an always-on spring that follows its *computed targets*:
  - `cxTarget = useTransform(layoutAngleMv, (a) => project(pointAt(i, a)).sx)`
  - `cyTarget = useTransform(layoutAngleMv, (a) => project(pointAt(i, a)).sy)`
  - `rTarget = useTransform(layoutAngleMv, (a) => project(pointAt(i, a)).size / 2)`
  - `opacityTarget = useTransform(opacityAngleMv, (a) => opacityAt(i, a))`
  - Then `cx = useSpring(cxTarget, SPRING)` etc.

Because you requested “smooth continuously”, the spring stays active even while the layout is evolving.

### 4) Move per-dot Motion hook usage into a child component

Because `useTransform`/`useSpring` are hooks, don’t generate them in loops in the parent.

- Create `Dot` (or `DotCircle`) component in the same file or a new file under `src/components/DotIcon/`.
- Render it 16 times from `DotIcon`, passing:
  - `i`
  - `stateDef` (or `pointAt`/`opacityAt` functions)
  - `layoutAngleMv`, `opacityAngleMv`
- `Dot` returns one `<motion.circle ... />` binding `cx/cy/r/fillOpacity` to the sprung MotionValues.

### 5) Simplify state transition effect

Replace the current “stopLoop / startLoop / morphTo” branching with:

- On `state` change:
  - stop prior `animate()` controls for angles
  - if `animated`: start linear repeating `animate()` controls (step 1)
  - if `static`: set angles to 0 and do nothing else (springs will settle to static targets automatically)

This eliminates the separate imperative `morphTo()` path.

### 6) Validate parity (visual + behavioral)

- Ensure:
  - `dormant` matches current grid placement and opacities.
  - `thinking` still spins at `layoutSpeed` and opacity wave advances at `opacitySpeed`.
  - `loading` fill/trail behavior remains consistent; verify the Z and opacity trails feel the same without the old `lerp()`.
- Confirm no lingering direct `requestAnimationFrame` usage remains in `DotIcon.tsx`.

## Files to change

- Primary: `[C:\Users\Sebastian\development\doticon\src\components\DotIcon\DotIcon.tsx](C:\Users\Sebastian\development\doticon\src\components\DotIcon\DotIcon.tsx)`
- Optional (if we split components): `src/components/DotIcon/DotCircle.tsx` (new) and adjust exports.
- `robots.md` is documentation-only; optionally update the “Animation architecture” section to reflect Motion-only design.

