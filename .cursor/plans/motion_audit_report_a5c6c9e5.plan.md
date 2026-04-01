---
name: Motion audit report
overview: "Full-project motion performance audit: all animation-related code lives in [src/components/DotIcon/DotIcon.tsx](src/components/DotIcon/DotIcon.tsx) (Motion + SVG geometry) and [src/routes/index.tsx](src/routes/index.tsx) (CSS `transition: all` on state buttons). Everything classified is **C-tier** (paint / SVG attribute repaint). No S/A-tier animations; no F-tier thrashing detected. **prefers-reduced-motion** is not implemented anywhere."
todos:
  - id: a11y-prm
    content: Add prefers-reduced-motion handling for DotIcon (and optionally demo UI buttons)
    status: pending
  - id: doticon-transform
    content: "Optional perf: refactor DotIcon circles from cx/cy/r to transform translate+scale (C→S for geometry)"
    status: pending
  - id: button-transition
    content: "Replace transition: all on state buttons with explicit transitionProperty list"
    status: pending
isProject: false
---

# Motion Performance Audit

**Scope:** project (source under `src/`)  
**Files scanned:** 7 relevant files (`DotIcon.tsx`, `index.tsx`, `__root.tsx`, `ExposeProps.tsx`, `index.module.css`, `styles.css`, `router`/`vite` — no animation)  
**Animations found:** 4 countable behaviors (1× DotIcon motion system; 3× identical button transitions)

### Scorecard

**Overall rank: C** (all animated paths are paint- or SVG-attribute-bound)

```
Breakdown (25-char bars, counts right-aligned)
S █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0 · 0%
A █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0 · 0%
B █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0 · 0%
C ██████████████████████████████ 4 · 100%
D █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0 · 0%
F █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0 · 0%
```

**C-tier (overall)**

```
:'██████::
'██... ██:
.██:::..::
.██:::::::
.██:::::::
.██::: ██:
. ██████::
:......:::
```

---

### Findings

> No S- or A-tier animations in this repo; Motion is used, but the animated SVG properties are not compositor-only.

#### [src/components/DotIcon/DotIcon.tsx:404-410] — Tier **C**

**What:** Continuous updates to SVG `cx`, `cy`, `r`, and `fillOpacity` on each `<motion.circle>`, smoothed with `useSpring`, driven from `useMotionValueEvent(time, "change", …)` ([lines 489-537](src/components/DotIcon/DotIcon.tsx)) which writes target `MotionValue`s every tick for animated states (and during opacity crossfades).

**Why Tier C:** Per the motion-audit reference `svgAttributes`, `**cx` / `cy` / `r`** are **C-tier** (SVG shape attributes trigger repaint per change). Worst property wins; `**fillOpacity` does not lift the whole animation above C while geometry is changing every frame.

**Impact:** Cost scales with **dots × mounted `DotIcon` instances**. On the home route, many icons can be in `thinking` / `loading` at once (e.g. prop showcase), so worst case is **hundreds of circles** repainting per frame plus per-dot spring work on the main thread.

**Upgrade:** Express dot position and size with `**transform` (translate + scale)** on a `<g>` (or equivalent) so position/size animate as **S-tier compositor work; keep opacity on a cheap channel where possible. Requires re-deriving projection math into transform space (see skill: `svgAttributes` note).

#### [src/routes/index.tsx:79] — Tier **C**

**What:** `transition: "all" 0.15s ease` on state toggle `**<button>` while `borderColor`, `background`, and related paints change.

**Why Tier C:** `background` and `border-color` are **paint-tier** properties in `property-tiers.json`; `transition: all` includes any property that changes (broader than needed).

**Impact:** Low — three small buttons; not a bottleneck unless replicated at scale.

**Upgrade:** Replace `all` with an explicit list, e.g. `background-color`, `border-color` (stays **C** but avoids accidentally animating unexpected properties). No practical path to **S** without redesigning the control (e.g. layered elements with opacity-only crossfade).

---

### Anti-patterns

#### Medium — `transition: all`

**Location:** [src/routes/index.tsx:79](src/routes/index.tsx)

**Problem:** `all` is brittle and can animate properties you did not intend if styles evolve.

**Fix:** Set `transitionProperty` to the minimal set of paint properties you actually change.

#### Medium — Many `useTime` / per-frame subscribers (demo page)

**Location:** [src/components/DotIcon/DotIcon.tsx:436-437, 489-537](src/components/DotIcon/DotIcon.tsx)

**Problem:** Each mounted `DotIcon` registers a `time` listener; the handler runs every frame and only then early-returns for dormant + no active opacity transition ([line 491-492](src/components/DotIcon/DotIcon.tsx)). With **many** icons on one screen, that is redundant main-thread work.

**Fix:** Optional refactor for pages with many icons: single shared clock / context, or `useAnimationFrame` with one subscriber driving all icons (out of scope unless you standardize on that architecture).

---

### Accessibility

- ✗ **No `prefers-reduced-motion`** (media query, `useReducedMotion`, or Motion’s reduced-motion integration) anywhere under `src/`. Continuous `thinking` / `loading` motion and springs never respect user OS preference.

---

### Top 3 Recommendations

1. **Add reduced-motion support** — Respect `prefers-reduced-motion`: freeze or simplify continuous states (e.g. static dormant pose), shorten or disable springs; expect better a11y compliance, not a tier change.
2. **DotIcon: move from `cx`/`cy`/`r` to `transform`-based dots** — Targets **C → S** for position/scale on supporting browsers; largest win if the icon is used large or with dense grids.
3. **Tighten button `transition`** — Replace `transition: all` with explicit properties; small hygiene win, stays **C**.

---

### Plan mode note

This document is the audit deliverable only; no code was changed. After you approve, implementation can follow the three recommendations in priority order you prefer (a11y often first).
