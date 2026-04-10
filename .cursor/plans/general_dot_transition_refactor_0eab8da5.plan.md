---
name: General Dot Transition Refactor
overview: "Replace the conditional, timing-orchestrated fade with a simple, universal mechanism: whenever the dot count changes (for any reason — grid prop change or state switch), old dots decay to opacity 0 via a per-frame multiplier while new dots start at opacity 0 and are crossfaded in by the existing mechanism. No timestamps, no captured snapshots, no extra useEffect step."
todos:
  - id: constants
    content: Add OUTGOING_DECAY and OUTGOING_THRESHOLD constants
    status: completed
  - id: outgoing-ref
    content: Add outgoingRef as plain DotMV[] | null
    status: completed
  - id: rebuild-block
    content: Replace isDotCountTransition with isCountChange (no grid guard), populate outgoingRef, keep opacity=0 init for new dots
    status: completed
  - id: event-handler
    content: Replace linear-blend outgoing loop with per-frame decay loop
    status: completed
  - id: jsx
    content: Update outgoing JSX to use outgoingRef?.map (no .dots indirection)
    status: completed
isProject: false
---

# General Dot Transition Refactor

## What changes and why

The current `isDotCountTransition` guard only fires for state-triggered count changes (`gridRef.current === grid`), leaving grid-prop count changes abrupt. The planned fade-out approach I described earlier added `fromOpacities`, `startMs`, and a linear-blend loop in the event handler — three separate orchestration points.

The simpler model: **any time `targetsRef` is rebuilt with a different dot count, move the old `DotMV[]` into `outgoingRef` and multiply their opacity by a constant each frame.** The existing DotCircle springs follow those opacity MotionValues to zero naturally. No timing refs, no snapshot, no useEffect step.

---

## Changes — `src/components/DotIcon/DotIcon.tsx` only

### 1. Add two constants

```typescript
const OUTGOING_DECAY = 0.82; // per-frame multiplier (~380 ms to reach 1 % at 60 fps)
const OUTGOING_THRESHOLD = 0.005; // opacity floor before hard-clamping to 0
```

### 2. Add `outgoingRef` — plain `DotMV[] | null`

Near the other refs, just before the rebuild block:

```typescript
const outgoingRef = useRef<DotMV[] | null>(null);
```

No `fromOpacities`, no `startMs`, no nested object.

### 3. Generalize and simplify the rebuild block

Remove the `gridRef.current === grid` guard from `isDotCountTransition` so **any count change triggers the transition**, then replace the old comment and add one line to populate `outgoingRef`:

```typescript
// Before rebuilding, save old dots for fade-out whenever the count changes.
const isCountChange =
  targetsRef.current !== null &&
  prevDotCountRef.current !== effectiveDotCount;

if (isCountChange) {
  outgoingRef.current = targetsRef.current; // old dots decay in event handler
}

// new dots start invisible so the existing crossfade brings them in
opacity: motionValue(isCountChange ? 0 : quantizeFloat(clamp(opa[i], 0, 1))),
```

`isCountChange` replaces `isDotCountTransition`. The only structural difference: the `gridRef.current === grid` guard is gone, making this universal.

### 4. Remove outgoing logic from `useEffect`

The useEffect no longer needs to set `outgoingRef.startMs`. It stays as-is:

```typescript
useEffect(() => {
  const now = time.get();
  phaseStartMsRef.current = now;
  opacityTransitionRef.current = { state: effectiveState, startMs: now, from: ... };
  // nothing else needed for outgoing
}, [effectiveState, time]);
```

### 5. Replace the event handler outgoing loop with decay

At the top of `useMotionValueEvent`, before the main dot loop:

```typescript
// Fade out dots from the previous dot count (any grid or state change).
const outgoing = outgoingRef.current;
if (outgoing) {
  let alive = false;
  for (const mv of outgoing) {
    const o = mv.opacity.get();
    if (o > OUTGOING_THRESHOLD) {
      mv.opacity.set(quantizeFloat(o * OUTGOING_DECAY));
      alive = true;
    } else if (o !== 0) {
      mv.opacity.set(0);
    }
  }
  if (!alive) outgoingRef.current = null;
}
```

No `fromOpacities`, no `startMs`, no `elapsed`, no `blendT` math. The DotCircle opacity spring follows `mv.opacity` lazily — so the visual result is a spring chasing an exponentially-decaying target, which looks smooth and organic.

### 6. Update JSX

```tsx
{
  outgoingRef.current?.map((mv, i) => (
    <DotCircle
      key={`out-${i}`}
      mv={mv}
      i={i}
      dotCount={outgoingRef.current!.length}
    />
  ));
}
```

`.dots` is gone since `outgoingRef` is now directly a `DotMV[]`.

---

## What this removes vs. what I built before

- `fromOpacities: number[]` field and its capture — removed
- `startMs: number` field and its `useEffect` initialization — removed
- `elapsed`, `n`, `allDone`, `localMs`, `blendT`, `lerp(fromOpacities[i], 0, blendT)` in the event handler — removed (18 lines → 9 lines)
- `gridRef.current === grid` guard — removed (transition now universal)
- `outgoingRef.current.dots` indirection — removed

---

## Behaviour

- **Any state change that changes dot count** (e.g. dormant ↔ thinking at `grid=3`): old dots decay out, new dots crossfade in.
- **Any grid prop change that changes dot count** (e.g. slider 4→5): same behaviour, now covered.
- **Same-count changes** (same-count grid change, state switch within same grid): no outgoing set, springs morph positions as before.
- **Rapid size changes** (slider drag): each rebuild replaces the previous `outgoingRef` with the latest old dots. Previously-outgoing invisible circles stay in the React tree but are no longer driven (they stay at ~0 opacity until the next render removes them). Acceptable for the slider use case.
