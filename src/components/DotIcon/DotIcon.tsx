import { useRef, useEffect, useMemo } from "react";
import type { CSSProperties } from "react";
import {
  motion,
  motionValue,
  useTime,
  useSpring,
  useMotionValueEvent,
  type MotionValue,
} from "motion/react";

// ─── 3D ENGINE ───────────────────────────────────────────────────────────────

type Vec3 = { x: number; y: number; z: number };

// ─── GRID CONFIG ─────────────────────────────────────────────────────────────

// Fixed size chart — back → front. Independent of grid size so dots look the
// same regardless of how many columns the grid has. Editable for tuning.
const DOT_SIZES = [6, 8, 12, 16] as const;

// Pure coordinate-system description. Contains no state-specific data —
// adding or removing a state never requires changing this type.
type GridConfig = {
  n: number;
  dotCount: number;
  grid: { min: 0; max: number; center: number };
};

const buildGridConfig = (n: number): GridConfig => {
  const dotCount = n * n;
  const grid = { min: 0 as const, max: n - 1, center: (n - 1) / 2 };
  return { n, dotCount, grid };
};

// ─── Orthographic projection (drop Z, map X/Y → SVG) ────────────────────────

const VIEW_SIZE = 100;
const SVG_PAD = 14;
const SVG_SPAN = VIEW_SIZE - 2 * SVG_PAD;

const snapSize = (z: number, config: GridConfig): number => {
  const t = (z - config.grid.min) / (config.grid.max - config.grid.min);
  const idx = Math.round(Math.max(0, Math.min(1, t)) * (DOT_SIZES.length - 1));
  return DOT_SIZES[idx];
};

type Projected = { sx: number; sy: number; size: number; z: number };

const project = (v: Vec3, config: GridConfig): Projected => ({
  sx:
    SVG_PAD +
    ((v.x - config.grid.min) / (config.grid.max - config.grid.min)) * SVG_SPAN,
  sy:
    SVG_PAD +
    ((v.y - config.grid.min) / (config.grid.max - config.grid.min)) * SVG_SPAN,
  size: snapSize(v.z, config),
  z: v.z,
});

// ─── STATE-SPECIFIC BUILDERS ─────────────────────────────────────────────────
// Each builder is private to the state that needs it; none of these values
// belong on GridConfig — they are implementation details of individual states.

// ─── Dormant — hand-crafted logotype pattern ──────────────────────────────────
// The 7×7 master is the canonical design reference. All other grid sizes are
// derived from it via nearest-neighbour sampling so the logo character is
// preserved at any resolution. dim = 0.12, full = 1.
//
// Visualised (D = dim, █ = full, ▒ = half):
//   D █ █ D █ █ █
//   █ ▒ █ █ D █ █
//   █ █ ▒ █ █ D █
//   D █ █ ▒ █ █ D
//   █ D █ █ ▒ █ █
//   █ █ D █ █ ▒ █
//   █ █ █ D █ █ D
const DORMANT_MASTER_N = 7;
const DORMANT_MASTER: readonly number[] = [
  // row 0
  0.12, 1, 1, 0.12, 1, 1, 1,
  // row 1
  1, 0.45, 1, 1, 0.12, 1, 1,
  // row 2
  1, 1, 0.45, 1, 1, 0.12, 1,
  // row 3
  0.12, 1, 1, 0.45, 1, 1, 0.12,
  // row 4
  1, 0.12, 1, 1, 0.45, 1, 1,
  // row 5
  1, 1, 0.12, 1, 1, 0.45, 1,
  // row 6
  1, 1, 1, 0.12, 1, 1, 0.12,
];

// ─── Dormant 4×4 overrides ────────────────────────────────────────────────────
// Full designer control over opacities and Z (dot size) at 4×4.
// Opacities: 0.12 = dim, 0.45 = half, 1 = full.
// Z: integer in 0–3 — 0 = back/smallest dot, 3 = front/largest dot.
//
// (D = dim, █ = full, ▒ = half)
//   D █ █ █
//   █ ▒ █ █
//   █ █ ▒ █
//   █ █ █ D

const DORMANT_4x4_OPACITIES: readonly number[] = [
  // row 0
  0.12, 1, 0.12, 1,
  // row 1
  1, 0.45, 1, 0.12,
  // row 2
  0.12, 1, 0.45, 1,
  // row 3
  1, 0.12, 1, 0.12,
];

// Z per dot in 0–3 order; edit to give individual dots more or less visual weight.
const DORMANT_4x4_Z: readonly number[] = [
  // row 0
  1, 2, 2, 2,
  // row 1
  2, 2, 3, 2,
  // row 2
  2, 3, 2, 2,
  // row 3
  2, 2, 2, 1,
];

// Nearest-neighbour downsample from the 7×7 master to any n×n grid.
// Per-size overrides take priority and bypass the downsampler entirely.
const buildDormantOpacities = (n: number): number[] => {
  if (n === 4) return [...DORMANT_4x4_OPACITIES];
  if (n === DORMANT_MASTER_N) return [...DORMANT_MASTER];
  const span = DORMANT_MASTER_N - 1; // 6
  return Array.from({ length: n * n }, (_, idx) => {
    const col = idx % n;
    const row = Math.floor(idx / n);
    const srcCol = n === 1 ? 0 : Math.round((col / (n - 1)) * span);
    const srcRow = n === 1 ? 0 : Math.round((row / (n - 1)) * span);
    return DORMANT_MASTER[srcRow * DORMANT_MASTER_N + srcCol];
  });
};

// Thinking: Fibonacci sphere sized to dotCount.
const buildSphereBase = (config: GridConfig): Vec3[] => {
  const { dotCount } = config;
  const phi = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: dotCount }, (_, i) => {
    // Flip latitude vs classic Fibonacci so low i (dormant top rows) maps to low grid y.
    const y = dotCount <= 1 ? 0 : (i / (dotCount - 1)) * 2 - 1;
    const r = Math.sqrt(1 - y * y);
    const theta = phi * i;
    return { x: Math.cos(theta) * r, y, z: Math.sin(theta) * r };
  });
};

// Loading: column-major fill order (x 0→n-1, y n-1→0) plus its inverse rank map.
const buildLoadingOrder = (
  config: GridConfig,
): { fillOrder: number[]; dotRank: number[] } => {
  const { n, dotCount } = config;
  const fillOrder: number[] = [];
  for (let x = 0; x < n; x++) {
    for (let y = n - 1; y >= 0; y--) {
      fillOrder.push(y * n + x);
    }
  }
  const dotRank: number[] = new Array(dotCount);
  fillOrder.forEach((dotIdx, rank) => {
    dotRank[dotIdx] = rank;
  });
  return { fillOrder, dotRank };
};

// ─── STATE SYSTEM ────────────────────────────────────────────────────────────

export type StateKey = "dormant" | "thinking" | "loading";

type SolveResult = { positions: Vec3[]; opacities: number[] };

type StateDef = {
  label: string;
  solve: (layoutAngle: number, opacityAngle: number) => SolveResult;
  animated: boolean;
  /** Radians per second — 3D spin. */
  layoutSpeed?: number;
  /** Radians per second — opacity phase. Defaults to `layoutSpeed` when omitted. */
  opacitySpeed?: number;
};

// ─── Layout / opacity functions ───────────────────────────────────────────────

// Inverse grid-density Z: smaller grids → higher Z (larger dots), larger grids
// → lower Z (smaller dots). Steps through DOT_SIZES largest→smallest as n
// grows, skipping n=4 (which has its own per-dot override). Back-solves to the
// Z value that snapSize will correctly round back to the target size index.
// Adapts automatically if DOT_SIZES gains or loses entries.
//
// n ≤ 3 → step 0 (DOT_SIZES max)
// n = 5 → step 1
// n = 6 → step 2
// n ≥ 7 → step 3+ (clamped to DOT_SIZES min)
const gridBaseZ = (config: GridConfig): number => {
  const step = config.n <= 3 ? 0 : config.n - 4;
  const sizeIdx = Math.max(0, DOT_SIZES.length - 1 - step);
  return Math.round((sizeIdx / (DOT_SIZES.length - 1)) * config.grid.max);
};

// Dormant: all dots at baseZ (static logo pattern; opacity carries the design).
// n=4 uses DORMANT_4x4_Z for per-dot size control instead.
const dormantLayout = (config: GridConfig): Vec3[] => {
  const baseZ = gridBaseZ(config);
  console.log("baseZ", baseZ);
  return Array.from({ length: config.dotCount }, (_, i) => ({
    x: i % config.n,
    y: Math.floor(i / config.n),
    z: config.n === 4 ? DORMANT_4x4_Z[i] : baseZ,
  }));
};

const THINKING_OPACITY_MIN = 0.12;
const THINKING_OPACITY_MAX = 1;

// Thinking: rotates sphere points, derives positions + opacities in a single
// pass with hoisted trig — one cos/sin pair instead of per-dot.
const thinkingSolve = (
  config: GridConfig,
  sphereBase: Vec3[],
  layoutAngle: number,
  opacityAngle: number,
): SolveResult => {
  const baseZ = gridBaseZ(config);
  const center = config.grid.center;
  const c = Math.cos(layoutAngle);
  const s = Math.sin(layoutAngle);
  const { dotCount } = config;
  const positions: Vec3[] = new Array(dotCount);
  const opacities: number[] = new Array(dotCount);
  for (let i = 0; i < dotCount; i++) {
    const pt = sphereBase[i];
    const rx = pt.x * c + pt.z * s;
    const rz = -pt.x * s + pt.z * c;
    positions[i] = {
      x: center + rx * center,
      y: center + pt.y * center,
      z: baseZ * (0.5 + 0.5 * rz),
    };
    const depthVisible = (rz + 1) / 2;
    const u = (i / dotCount + 0.5) % 1;
    const w = 0.5 + 0.5 * Math.sin(2 * Math.PI * u + opacityAngle);
    const wave =
      THINKING_OPACITY_MIN + (THINKING_OPACITY_MAX - THINKING_OPACITY_MIN) * w;
    opacities[i] = clamp(wave * depthVisible, 0, 1);
  }
  return { positions, opacities };
};

const LOADING_PAUSE = 2;
const LOADING_FILLED_OPACITY_MIN = 0.12;

const loadingTimeSinceFill = (
  angle: number,
  rank: number,
  cycle: number,
): number => {
  if (angle < rank) return Infinity;
  return (angle - rank) % cycle;
};

// Loading: fill front at baseZ, trail falls to baseZ - 2 (clamped to grid.min).
// Single pass — computes fill-age once per dot, derives both position and opacity.
const loadingSolve = (
  config: GridConfig,
  dotRank: number[],
  angle: number,
): SolveResult => {
  const baseZ = gridBaseZ(config);
  const trailZ = Math.max(config.grid.min, baseZ - 2);
  const { n, dotCount } = config;
  const cycle = dotCount + LOADING_PAUSE;
  const trailSteps = dotCount - 1;
  const positions: Vec3[] = new Array(dotCount);
  const opacities: number[] = new Array(dotCount);
  for (let i = 0; i < dotCount; i++) {
    const age = loadingTimeSinceFill(angle, dotRank[i], cycle);
    const trailT = Math.min(age / trailSteps, 1);
    positions[i] = {
      x: i % n,
      y: Math.floor(i / n),
      z: age < dotCount ? lerp(baseZ, trailZ, trailT) : trailZ,
    };
    opacities[i] =
      age >= dotCount ? 0.12 : lerp(1, LOADING_FILLED_OPACITY_MIN, trailT);
  }
  return { positions, opacities };
};

// ─── buildStates ──────────────────────────────────────────────────────────────
// State-specific precomputed data is closed over here — private to each state,
// computed once per GridConfig, and invisible to the GridConfig type itself.

const buildStates = (config: GridConfig): Record<StateKey, StateDef> => {
  const dormantPositions = dormantLayout(config);
  const dormantOpa = buildDormantOpacities(config.n);
  const dormantResult: SolveResult = {
    positions: dormantPositions,
    opacities: dormantOpa,
  };
  const sphereBase = buildSphereBase(config);
  const { dotRank } = buildLoadingOrder(config);

  return {
    dormant: {
      label: "Dormant",
      solve: () => dormantResult,
      animated: false,
    },
    thinking: {
      label: "Thinking",
      solve: (layoutAngle, opacityAngle) =>
        thinkingSolve(config, sphereBase, layoutAngle, opacityAngle),
      animated: true,
      layoutSpeed: 3,
      opacitySpeed: 4,
    },
    loading: {
      label: "Loading",
      solve: (layoutAngle) => loadingSolve(config, dotRank, layoutAngle),
      animated: true,
      layoutSpeed: 12,
    },
  };
};

export const STATE_KEYS: StateKey[] = ["dormant", "thinking", "loading"];

const STATE_LABELS: Record<StateKey, string> = {
  dormant: "Dormant",
  thinking: "Thinking",
  loading: "Loading",
};

export const getStateLabel = (key: StateKey): string => STATE_LABELS[key];

// ─── SPRING CONFIG ───────────────────────────────────────────────────────────

const SPRING = {
  type: "spring" as const,
  stiffness: 240,
  damping: 25,
  mass: 0.8,
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

type DotMV = {
  cx: MotionValue<number>;
  cy: MotionValue<number>;
  r: MotionValue<number>;
  opacity: MotionValue<number>;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const DotCircle = ({
  mv,
  i,
  dotCount,
}: {
  mv: DotMV;
  i: number;
  dotCount: number;
}) => {
  // Per-dot spring variation gives a mild spatial cascade without explicit delays.
  const t = dotCount <= 1 ? 0 : i / (dotCount - 1);
  const spring = {
    ...SPRING,
    stiffness: SPRING.stiffness * (1 - 0.35 * t),
    damping: SPRING.damping * (1 + 0.24 * t),
    mass: SPRING.mass * (1 + 0.6 * t),
  } as const;

  const cx = useSpring(mv.cx.get(), spring);
  const cy = useSpring(mv.cy.get(), spring);
  const r = useSpring(mv.r.get(), spring);
  const opacity = useSpring(mv.opacity.get(), SPRING);

  useMotionValueEvent(mv.cx, "change", (latest) => cx.set(latest));
  useMotionValueEvent(mv.cy, "change", (latest) => cy.set(latest));
  useMotionValueEvent(mv.r, "change", (latest) => r.set(latest));
  useMotionValueEvent(mv.opacity, "change", (latest) => opacity.set(latest));

  // When the underlying MotionValue instances change (state switch),
  // nudge spring targets so rapid switching feels like "following" rather than
  // restarting queued animations.
  useEffect(() => {
    cx.set(mv.cx.get());
    cy.set(mv.cy.get());
    r.set(mv.r.get());
    opacity.set(mv.opacity.get());
  }, [mv.cx, mv.cy, mv.r, mv.opacity, cx, cy, r, opacity]);

  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={r}
      fill="currentColor"
      fillOpacity={opacity}
    />
  );
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

// Opacity-only stagger for state changes (no spatial sequencing).
const OPACITY_STAGGER_MS = 12;
const OPACITY_CROSSFADE_MS = 160;

// ─── COMPONENT ───────────────────────────────────────────────────────────────

const DotIcon = ({
  size = 200,
  state = "dormant",
  color,
  style,
  grid = 4,
}: {
  size?: number;
  state?: StateKey;
  color?: string;
  style?: CSSProperties;
  grid?: number;
}) => {
  const time = useTime();
  const phaseStartMsRef = useRef(0);
  const stateRef = useRef<StateKey>(state);
  stateRef.current = state;

  const config = useMemo(() => buildGridConfig(grid), [grid]);
  const states = useMemo(() => buildStates(config), [config]);

  // Refs so the Motion event handler (registered once) always reads latest values.
  const configRef = useRef(config);
  configRef.current = config;
  const statesRef = useRef(states);
  statesRef.current = states;

  const opacityTransitionRef = useRef<{
    state: StateKey;
    startMs: number;
    from: number[];
  } | null>(null);

  // Target MotionValues that the DotCircle springs follow.
  // Rebuilt when grid changes (dot count changes — no continuity is possible).
  const gridRef = useRef(grid);
  const targetsRef = useRef<DotMV[] | null>(null);

  if (!targetsRef.current || gridRef.current !== grid) {
    gridRef.current = grid;
    const { positions, opacities: opa } = states[state].solve(0, 0);
    targetsRef.current = positions.map((v, i) => {
      const p = project(v, config);
      return {
        cx: motionValue(p.sx),
        cy: motionValue(p.sy),
        r: motionValue(p.size / 2),
        opacity: motionValue(opa[i]),
      };
    });
    opacityTransitionRef.current = null;
  }

  const targetMvs = targetsRef.current;

  // ─── State transitions ────────────────────────────────────────────────────

  useEffect(() => {
    phaseStartMsRef.current = time.get();
    opacityTransitionRef.current = {
      state,
      startMs: time.get(),
      from: targetsRef.current!.map((mv) => mv.opacity.get()),
    };
  }, [state, time]);

  useMotionValueEvent(time, "change", (ms) => {
    const key = stateRef.current;
    const def = statesRef.current[key];
    if (!def.animated && !opacityTransitionRef.current) return;

    const cfg = configRef.current;
    const mvs = targetsRef.current!;
    const t = (ms - phaseStartMsRef.current) / 1000;

    const layoutAngle = def.animated ? (def.layoutSpeed ?? 0) * t : 0;
    const opacityAngle = def.animated
      ? (def.opacitySpeed ?? def.layoutSpeed ?? 0) * t
      : 0;

    const { positions, opacities: opa } = def.solve(layoutAngle, opacityAngle);

    const tr = opacityTransitionRef.current;
    const inOpacityTransition = tr?.state === key;
    const transitionElapsedMs = inOpacityTransition ? ms - tr.startMs : 0;

    const dotCount = mvs.length;
    for (let i = 0; i < dotCount; i++) {
      const p = project(positions[i], cfg);
      mvs[i].cx.set(p.sx);
      mvs[i].cy.set(p.sy);
      mvs[i].r.set(Math.max(0, p.size / 2));

      const targetOpacity = clamp(opa[i], 0, 1);
      if (!inOpacityTransition) {
        mvs[i].opacity.set(targetOpacity);
        continue;
      }

      const localMs = transitionElapsedMs - i * OPACITY_STAGGER_MS;
      const blendT = clamp(localMs / OPACITY_CROSSFADE_MS, 0, 1);
      if (blendT >= 1) {
        mvs[i].opacity.set(targetOpacity);
        continue;
      }

      const from = clamp(tr.from[i] ?? targetOpacity, 0, 1);
      mvs[i].opacity.set(lerp(from, targetOpacity, blendT));
    }

    if (inOpacityTransition) {
      const doneAtMs =
        (dotCount - 1) * OPACITY_STAGGER_MS + OPACITY_CROSSFADE_MS;
      if (transitionElapsedMs >= doneAtMs) opacityTransitionRef.current = null;
    }
  });

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: "inline-block",
        lineHeight: 0,
        color: color ?? "currentColor",
        ...style,
      }}
    >
      <svg
        viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: "visible" }}
      >
        {targetMvs.map((mv, i) => (
          <DotCircle key={i} mv={mv} i={i} dotCount={config.dotCount} />
        ))}
      </svg>
    </div>
  );
};

export default DotIcon;
DotIcon.displayName = "DotIcon";
