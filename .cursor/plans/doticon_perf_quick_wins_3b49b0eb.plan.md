---
name: DotIcon perf quick wins
overview: Eliminate wasted per-frame computation in DotIcon by (1) short-circuiting the tick handler for static states, (2) merging duplicate work across layout+opacity passes, and (3) hoisting redundant trig out of per-dot loops.
todos:
  - id: early-exit
    content: Add early-return guard in tick handler for non-animated states with no active opacity transition
    status: in_progress
  - id: solve-type
    content: Replace `layout` + `opacities` on StateDef with a single `solve(layoutAngle, opacityAngle)` function, remove Opacities/OpacitySolveCtx/resolveOpacities
    status: pending
  - id: thinking-solve
    content: "Write thinkingSolve: single loop, rotateY once per dot with hoisted cos/sin, derive both position and opacity"
    status: pending
  - id: loading-solve
    content: "Write loadingSolve: single loop, loadingTimeSinceFill once per dot, derive both position and opacity"
    status: pending
  - id: dormant-solve
    content: "Write dormantSolve: return precomputed static layout + opacity arrays"
    status: pending
  - id: tick-handler
    content: "Update tick handler: use def.solve(), inline projection in the set-loop, drop .map(project)"
    status: pending
isProject: false
---

# DotIcon Performance Quick Wins

## Problem

The `useMotionValueEvent(time, "change", ...)` tick handler at [line 513](src/components/DotIcon/DotIcon.tsx) fires **every frame for every DotIcon instance**, regardless of whether the state is animated. The demo page has 25 instances (9 dormant, 8 thinking, 8 loading). For the 9 dormant instances alone — 208 dots total — the handler runs every frame computing a static layout, projecting it, and calling `.set()` on 832 target motion values, which each trigger a `useMotionValueEvent` callback in `DotCircle`, which each call `.set()` on another spring motion value. That is ~~1,664 motion value operations per frame (~~100k/sec) for values that **never change**.

On top of that, the animated states have duplicate work: thinking computes `rotateY` for every dot **twice per frame** (once in layout, once in opacities), and loading computes `loadingTimeSinceFill` for every dot twice per frame. Both also recompute `cos(angle)`/`sin(angle)` per dot instead of once.

---

## Fix 1 — Early exit for non-animated states (biggest impact)

In the tick handler, bail out immediately when the state is not animated and no opacity crossfade is in progress:

```typescript
useMotionValueEvent(time, "change", (ms) => {
  const key = stateRef.current;
  const def = statesRef.current[key];
  if (!def.animated && !opacityTransitionRef.current) return;
  // ... rest of handler
});
```

This is safe because:

- Initial target values are already set correctly during [initialization (lines 483-498)](src/components/DotIcon/DotIcon.tsx).
- On state transitions, the `useEffect` at [line 504](src/components/DotIcon/DotIcon.tsx) sets `opacityTransitionRef.current`, so the handler runs during the crossfade, then auto-disables once it completes (line 562).
- Springs don't need repeated `.set()` calls to settle — they chase the last target on their own.

**Impact**: Eliminates all per-frame work for every dormant instance. On the demo page, removes ~100k wasted motion value operations per second.

One nuance: we still need to set the layout (position/size) values at least once when transitioning TO a non-animated state. The crossfade period already handles this — the handler runs during the crossfade and sets both layout + opacity values. After the crossfade completes, layout is at its final values.

---

## Fix 2 — Unify `layout()` + `opacities()` into a single `solve()` pass

Currently [StateDef](src/components/DotIcon/DotIcon.tsx) has separate `layout` and `opacities` fields. For thinking: `thinkingLayout` ([line 237](src/components/DotIcon/DotIcon.tsx)) calls `rotateY(pt, angle)` per dot, then `thinkingOpacities` ([line 258](src/components/DotIcon/DotIcon.tsx)) calls `rotateY(sphereBase[i], layoutAngle)` again per dot with the **same angle**. Same story for loading: `loadingTimeSinceFill` is called per dot in both `loadingLayout` ([line 287](src/components/DotIcon/DotIcon.tsx)) and `loadingOpacities` ([line 307](src/components/DotIcon/DotIcon.tsx)).

Replace `layout` + `opacities` with a single `solve` function:

```typescript
type StateDef = {
  label: string;
  solve: (
    layoutAngle: number,
    opacityAngle: number,
  ) => {
    positions: Vec3[];
    opacities: number[];
  };
  animated: boolean;
  layoutSpeed?: number;
  opacitySpeed?: number;
};
```

- **Dormant**: `solve` returns the static layout + the static opacity array. Trivial.
- **Thinking**: rotates each sphere point once, derives both position and opacity from the rotated vector in a single loop.
- **Loading**: computes `loadingTimeSinceFill` once per dot, derives both position and opacity.

This also **simplifies** the codebase by removing the `Opacities` type, `OpacitySolveCtx`, and `resolveOpacities` helper. The tick handler becomes:

```typescript
const { positions, opacities: opa } = def.solve(layoutAngle, opacityAngle);
```

**Impact**: Eliminates ~192 redundant `rotateY` calls/frame (thinking) and ~192 redundant `loadingTimeSinceFill` calls/frame (loading) across the demo page instances.

---

## Fix 3 — Hoist trig out of per-dot loops

Inside each `solve` for thinking, precompute `cos(angle)` and `sin(angle)` once instead of per dot (currently hidden inside `rotateY`):

```typescript
const c = Math.cos(layoutAngle);
const s = Math.sin(layoutAngle);
// then inline per dot:
const rx = pt.x * c + pt.z * s;
const rz = -pt.x * s + pt.z * c;
```

Same principle: `loadingTimeSinceFill` already doesn't have trig, but the `rotateY` call in thinking does. After the `solve` unification, this is a natural cleanup.

**Impact**: For thinking instances, eliminates 2(N-1) trig calls per frame per instance. Across 8 thinking instances (192 dots), saves ~380 `Math.cos`/`Math.sin` calls per frame.

---

## Fix 4 — Inline projection in the tick handler loop

Currently [line 525](src/components/DotIcon/DotIcon.tsx):

```typescript
const proj = def.layout(layoutAngle).map((v) => project(v, cfg));
```

The `.map(project)` allocates a `Projected[]` array every frame. Instead, project inline while iterating:

```typescript
const { positions, opacities: opa } = def.solve(layoutAngle, opacityAngle);
for (let i = 0; i < dotCount; i++) {
  const p = project(positions[i], cfg);
  mvs[i].cx.set(p.sx);
  // ...
}
```

This eliminates one array allocation per frame per animated instance. Small but free.

---

## Summary of changes

All changes are in [DotIcon.tsx](src/components/DotIcon/DotIcon.tsx):

- Add early-return guard in the tick handler (~1 line)
- Replace `layout` + `opacities` fields on `StateDef` with `solve`
- Rewrite `thinkingSolve` to rotate once, derive position+opacity together, with hoisted trig
- Rewrite `loadingSolve` to compute fill-age once, derive position+opacity together
- Write trivial `dormantSolve` returning static arrays
- Remove `Opacities`, `OpacitySolveCtx`, `resolveOpacities`
- Inline projection in the tick handler loop (drop the `.map()`)

No new dependencies, no caching, no render engine changes. The component API and all visual behavior remain identical.
