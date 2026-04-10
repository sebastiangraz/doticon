import { useRef, useEffect, useMemo, useState, useLayoutEffect } from "react";
import type { CSSProperties } from "react";
import { animate, useTime, useMotionValueEvent } from "motion/react";
import { isDevDotIconStateEnabled } from "#/env";

// ─── 3D ENGINE ───────────────────────────────────────────────────────────────

type Vec3 = { x: number; y: number; z: number };

// ─── GRID CONFIG ─────────────────────────────────────────────────────────────

// Fixed size chart — back → front. Independent of grid size so dots look the
// same regardless of how many columns the grid has. Editable for tuning.

// const DOT_SIZES = [6, 8, 12, 16] as const;
const DOT_SIZES = [6, 8, 12, 16, 20] as const;

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

// ─── 3D math ─────────────────────────────────────────────────────────────────

const rotateY = ({ x, y, z }: Vec3, a: number): Vec3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c + z * s, y, z: -x * s + z * c };
};

// ─── Orthographic projection (drop Z, map X/Y → SVG) ────────────────────────

const VIEW_SIZE = 100;
const SVG_PAD = 14;
const SVG_SPAN = VIEW_SIZE - 2 * SVG_PAD;

// Continuous interpolation between DOT_SIZES entries. Unlike the old snapSize
// (which used Math.round → discrete jumps that needed springs to smooth),
// this linearly blends between adjacent size tiers so Z-depth changes are
// smooth by construction — no per-dot spring overhead required.
const lerpSize = (z: number): number => {
  const t = Math.max(0, Math.min(1, z / (DOT_SIZES.length - 1)));
  const idx = t * (DOT_SIZES.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, DOT_SIZES.length - 1);
  const frac = idx - lo;
  return DOT_SIZES[lo] + (DOT_SIZES[hi] - DOT_SIZES[lo]) * frac;
};

type Projected = { sx: number; sy: number; size: number; z: number };

const project = (v: Vec3, config: GridConfig): Projected => ({
  sx:
    SVG_PAD +
    ((v.x - config.grid.min) / (config.grid.max - config.grid.min)) * SVG_SPAN,
  sy:
    SVG_PAD +
    ((v.y - config.grid.min) / (config.grid.max - config.grid.min)) * SVG_SPAN,
  size: lerpSize(v.z),
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

// 3×3 is a size-tier label ("small"). Dormant at grid=3 renders internally
// as a 4×4 matrix, so these arrays hold 16 values, not 9.
const DORMANT_3x3_OPACITIES: readonly number[] = [
  // row 0
  0, 1, 0, 1,
  // row 1
  1, 0, 1, 0,
  // row 2
  0, 1, 0, 1,
  // row 3
  1, 0, 1, 0,
];

const DORMANT_3x3_Z: readonly number[] = [
  // row 0
  1, 3, 1, 3,
  // row 1
  3, 1, 4, 1,
  // row 3
  1, 4, 1, 3,
  // row 3
  3, 1, 3, 1,
];

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
  if (n === 3) return [...DORMANT_3x3_OPACITIES];
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

// Single source of truth for all states. Adding a new state only requires:
// 1. An entry here (gives you StateKey, STATE_KEYS, and the label for free)
// 2. An entry in buildStates (layout + opacity logic)
const STATE_META = {
  dormant: { label: "Dormant" },
  thinking: { label: "Thinking" },
  loading: { label: "Loading" },
  dev: { label: "Dev" },
} as const;

export type StateKey = keyof typeof STATE_META;

type OpacitySolveCtx = { layoutAngle: number; opacityAngle: number };

type Opacities = number[] | ((ctx: OpacitySolveCtx) => number[]);

type StateDef = {
  label: string;
  layout: (angle?: number) => Vec3[];
  opacities: Opacities;
  animated: boolean;
  /** Coordinate space used to project this state's layout into SVG. */
  projConfig: GridConfig;
  /** Radians per second — passed to `layout()` (3D spin). */
  layoutSpeed?: number;
  /** Radians per second — phase for functional opacities. Defaults to `layoutSpeed` when omitted. */
  opacitySpeed?: number;
};

const resolveOpacities = (o: Opacities, ctx: OpacitySolveCtx): number[] =>
  typeof o === "function" ? o(ctx) : o;

// ─── Layout / opacity functions ───────────────────────────────────────────────

// Inverse grid-density Z: smaller grids → higher Z (larger dots), larger grids
// → lower Z (smaller dots). Returns a direct DOT_SIZES index (Z coordinate in
// the [0, DOT_SIZES.length-1] space). Adapts automatically if DOT_SIZES
// gains or loses entries.
//
// n ≤ 3 → step 0 (DOT_SIZES max index)
// n = 4 → step 1
// n = 5 → step 2
// n = 6 → step 3
// n ≥ 7 → step 4+ (clamped to DOT_SIZES min index)
const gridBaseZ = (config: GridConfig): number => {
  const step = Math.max(0, config.n - 3);
  return Math.max(0, DOT_SIZES.length - 1 - step);
};

// Dormant: all dots at baseZ (static logo pattern; opacity carries the design).
// projConfig is the effective grid (4×4 when the user passes grid=3).
// zOverride supplies per-dot Z for hand-crafted sizes; null falls back to baseZ.
const dormantLayout = (
  projConfig: GridConfig,
  zOverride: readonly number[] | null,
): Vec3[] => {
  const baseZ = gridBaseZ(projConfig);
  return Array.from({ length: projConfig.dotCount }, (_, i) => ({
    x: i % projConfig.n,
    y: Math.floor(i / projConfig.n),
    z: zOverride !== null ? zOverride[i]! : baseZ,
  }));
};

// Dev: plain grid with uniform baseZ, no special opacity/layout logic.
const devLayout = (config: GridConfig): Vec3[] => {
  const baseZ = gridBaseZ(config);
  return Array.from({ length: config.dotCount }, (_, i) => ({
    x: i % config.n,
    y: Math.floor(i / config.n),
    z: baseZ,
  }));
};

// Thinking: sphere Z mapped onto [0, baseZ] so front dots match the grid's
// target size and size variation scales down with grid density.
const thinkingLayout = (
  config: GridConfig,
  sphereBase: Vec3[],
  angle = 0,
): Vec3[] => {
  const baseZ = gridBaseZ(config);
  return sphereBase.map((pt) => {
    const r = rotateY(pt, angle);
    return {
      x:
        config.grid.center +
        r.x * config.grid.center * THINKING_SPHERE_OVERSHOOT,
      y:
        config.grid.center +
        r.y * config.grid.center * THINKING_SPHERE_OVERSHOOT,
      z: baseZ * (0.5 + 0.6 * r.z),
    };
  });
};

// XY-only scale for the sphere — values > 1 push dots beyond the grid boundary
// (SVG overflow: visible so they stay visible). Z is untouched so dot sizes
// remain governed by DOT_SIZES regardless of scale.
const THINKING_SPHERE_OVERSHOOT = 1.1; // Default: 1

const THINKING_OPACITY_MIN = 0.12;
const THINKING_OPACITY_MAX = 1;

// Sine along spiral index (opacityAngle) × back-face fade from rotateY (layoutAngle).
// thinkingLayout maps z = baseZ*(0.5 + 0.5*r.z); r.z = -1 ⇒ z = 0 (furthest back).
const thinkingOpacities = (
  config: GridConfig,
  sphereBase: Vec3[],
  layoutAngle: number,
  opacityAngle: number,
): number[] =>
  Array.from({ length: config.dotCount }, (_, i) => {
    const r = rotateY(sphereBase[i]!, layoutAngle);
    const depthVisible = (r.z + 1) / 1.5;
    const u = (i / config.dotCount + 0.5) % 1;
    const w = 0.5 + 0.5 * Math.sin(2 * Math.PI * u + opacityAngle);
    const wave =
      THINKING_OPACITY_MIN + (THINKING_OPACITY_MAX - THINKING_OPACITY_MIN) * w;
    return clamp(wave * depthVisible, 0, 1);
  });

const LOADING_PAUSE = 3;
const LOADING_FILLED_OPACITY_MIN = 0.12;

const loadingTimeSinceFill = (
  angle: number,
  rank: number,
  cycle: number,
): number => {
  if (angle < rank) return Infinity;
  return (angle - rank) % cycle;
};

// Loading: fill front at baseZ, trail falls to baseZ - 2 (clamped to 0).
const loadingLayout = (
  config: GridConfig,
  dotRank: number[],
  angle = 0,
): Vec3[] => {
  const baseZ = gridBaseZ(config);
  const trailZ = Math.max(0, baseZ - 2);
  const cycle = config.dotCount + LOADING_PAUSE;
  const trailSteps = config.dotCount - 1;
  return Array.from({ length: config.dotCount }, (_, i) => {
    const age = loadingTimeSinceFill(angle, dotRank[i], cycle);
    const trailT = Math.min(age / trailSteps, 1);
    return {
      x: i % config.n,
      y: Math.floor(i / config.n),
      z: lerp(baseZ, trailZ, trailT),
    };
  });
};

const loadingOpacities = (
  config: GridConfig,
  dotRank: number[],
  angle: number,
): number[] => {
  const cycle = config.dotCount + LOADING_PAUSE;
  const trailSteps = config.dotCount - 1;
  return Array.from({ length: config.dotCount }, (_, i) => {
    const age = loadingTimeSinceFill(angle, dotRank[i], cycle);
    if (age >= config.dotCount) return 0.12;
    const trailT = Math.min(age / trailSteps, 1);
    return lerp(1, LOADING_FILLED_OPACITY_MIN, trailT);
  });
};

// ─── buildStates ──────────────────────────────────────────────────────────────
// State-specific precomputed data is closed over here — private to each state,
// computed once per GridConfig, and invisible to the GridConfig type itself.

const buildStates = (config: GridConfig): Record<StateKey, StateDef> => {
  // Dormant at grid=3 (small) uses a 4×4 internal layout.
  // All other states use the literal grid size.
  const dormantProjConfig = config.n === 3 ? buildGridConfig(4) : config;
  const dormantZOverride =
    config.n === 3 ? DORMANT_3x3_Z : config.n === 4 ? DORMANT_4x4_Z : null;

  const dormantOpacities = buildDormantOpacities(config.n);
  const sphereBase = buildSphereBase(config);
  const { dotRank } = buildLoadingOrder(config);

  return {
    dev: {
      label: STATE_META.dev.label,
      layout: () => devLayout(config),
      opacities: Array.from({ length: config.dotCount }, () => 1),
      animated: false,
      projConfig: config,
    },
    dormant: {
      label: STATE_META.dormant.label,
      layout: () => dormantLayout(dormantProjConfig, dormantZOverride),
      opacities: dormantOpacities,
      animated: false,
      projConfig: dormantProjConfig,
    },
    thinking: {
      label: STATE_META.thinking.label,
      layout: (angle = 0) => thinkingLayout(config, sphereBase, angle),
      opacities: (ctx) =>
        thinkingOpacities(
          config,
          sphereBase,
          ctx.layoutAngle,
          ctx.opacityAngle,
        ),
      animated: true,
      layoutSpeed: 2.5,
      opacitySpeed: 4,
      projConfig: config,
    },
    loading: {
      label: STATE_META.loading.label,
      layout: (angle = 0) => loadingLayout(config, dotRank, angle),
      opacities: (ctx) => loadingOpacities(config, dotRank, ctx.opacityAngle),
      animated: true,
      layoutSpeed: 12,
      projConfig: config,
    },
  };
};

const ALL_STATE_KEYS = Object.keys(STATE_META) as StateKey[];

/** Keys shown in UI; omits `dev` in production unless env allows it. */
export const STATE_KEYS = (
  isDevDotIconStateEnabled
    ? ALL_STATE_KEYS
    : ALL_STATE_KEYS.filter((k) => k !== "dev")
) as StateKey[];

export const getStateLabel = (key: StateKey): string => STATE_META[key].label;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

// SSR + hydration stability: Node and browser can differ in the last few bits of
// trig/float math. Quantize opacities so SVG attributes serialize identically.
const quantizeFloat = (v: number): number => {
  const q = 1e6; // 6 decimal places is visually indistinguishable for opacity.
  return Math.round(v * q) / q;
};

// Opacity-only stagger for state changes (no spatial sequencing).
const OPACITY_STAGGER_MS = 12;
const OPACITY_CROSSFADE_MS = 160;

// Duration for fading out dots removed by a dot-count change (seconds).
const OUTGOING_DURATION = 0.38;

// ─── SPRING SIMULATION ──────────────────────────────────────────────────────
// Lightweight per-dot spring for state transitions only. Replaces the previous
// useSpring × 4 × N DotCircle hooks (which kept 3N spring animations
// permanently active in Motion's scheduler during animated states).

type DotSpring = {
  cx: number; cy: number; r: number;
  vx: number; vy: number; vr: number;
  settled: boolean;
};

const SPRING_THRESHOLD = 0.05;

const stepSpring = (
  s: DotSpring,
  tCx: number,
  tCy: number,
  tR: number,
  stiffness: number,
  damping: number,
  mass: number,
  dt: number,
): void => {
  const ax = (-stiffness * (s.cx - tCx) - damping * s.vx) / mass;
  const ay = (-stiffness * (s.cy - tCy) - damping * s.vy) / mass;
  const ar = (-stiffness * (s.r - tR) - damping * s.vr) / mass;
  s.vx += ax * dt;
  s.vy += ay * dt;
  s.vr += ar * dt;
  s.cx += s.vx * dt;
  s.cy += s.vy * dt;
  s.r += s.vr * dt;
  s.settled =
    Math.abs(s.cx - tCx) < SPRING_THRESHOLD &&
    Math.abs(s.cy - tCy) < SPRING_THRESHOLD &&
    Math.abs(s.r - tR) < SPRING_THRESHOLD &&
    Math.abs(s.vx) < SPRING_THRESHOLD &&
    Math.abs(s.vy) < SPRING_THRESHOLD &&
    Math.abs(s.vr) < SPRING_THRESHOLD;
  if (s.settled) {
    s.cx = tCx;
    s.cy = tCy;
    s.r = tR;
    s.vx = s.vy = s.vr = 0;
  }
};

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
  const prevMsRef = useRef(0);
  const effectiveState: StateKey =
    state === "dev" && !isDevDotIconStateEnabled ? "dormant" : state;
  const stateRef = useRef<StateKey>(effectiveState);
  stateRef.current = effectiveState;

  const config = useMemo(() => buildGridConfig(grid), [grid]);
  const states = useMemo(() => buildStates(config), [config]);

  // Refs so the time-loop callback (registered once) always reads latest values.
  const statesRef = useRef(states);
  statesRef.current = states;

  const activeDef = states[effectiveState];
  const effectiveDotCount = activeDef.projConfig.dotCount;
  const effectiveDotCountRef = useRef(effectiveDotCount);
  effectiveDotCountRef.current = effectiveDotCount;

  // ─── Circle element refs (direct DOM mutation, no MotionValues) ────────
  const circleRefs = useRef<(SVGCircleElement | null)[]>([]);

  // ─── Outgoing circles (dot-count changes) ─────────────────────────────
  type OutgoingDot = { cx: string; cy: string; r: string; opacity: string };
  const [outgoingData, setOutgoingData] = useState<OutgoingDot[] | null>(null);
  const outgoingCircleRefs = useRef<(SVGCircleElement | null)[]>([]);
  const gridRef = useRef(grid);
  const prevDotCountRef = useRef<number | null>(null);

  // Capture outgoing circle data during render (elements still exist in DOM).
  if (
    gridRef.current !== grid ||
    (prevDotCountRef.current !== null &&
      prevDotCountRef.current !== effectiveDotCount)
  ) {
    if (
      prevDotCountRef.current !== null &&
      prevDotCountRef.current > effectiveDotCount
    ) {
      const data: OutgoingDot[] = [];
      for (let i = effectiveDotCount; i < prevDotCountRef.current; i++) {
        const el = circleRefs.current[i];
        if (el) {
          data.push({
            cx: el.getAttribute("cx") || "0",
            cy: el.getAttribute("cy") || "0",
            r: el.getAttribute("r") || "0",
            opacity: el.getAttribute("fill-opacity") || "1",
          });
        }
      }
      if (data.length > 0) setOutgoingData(data);
    }
    gridRef.current = grid;
    prevDotCountRef.current = effectiveDotCount;
  }
  if (prevDotCountRef.current === null) {
    prevDotCountRef.current = effectiveDotCount;
  }

  // ─── Springs for non-animated state transitions ──────────────────────
  const springsRef = useRef<DotSpring[]>([]);
  const springActiveRef = useRef(false);
  const springTargetsRef = useRef<Projected[]>([]);

  // ─── Opacity transition ───────────────────────────────────────────────
  const opacityTransitionRef = useRef<{
    state: StateKey;
    startMs: number;
    from: number[];
  } | null>(null);

  // ─── Initial attribute setup (before first paint) ─────────────────────
  const initializedRef = useRef(false);
  useLayoutEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const def = activeDef;
    const proj = def.layout(0).map((v) => project(v, def.projConfig));
    const opa = resolveOpacities(def.opacities, {
      layoutAngle: 0,
      opacityAngle: 0,
    });

    springsRef.current = proj.map((p) => ({
      cx: p.sx,
      cy: p.sy,
      r: Math.max(0, p.size / 2),
      vx: 0,
      vy: 0,
      vr: 0,
      settled: true,
    }));

    for (let i = 0; i < effectiveDotCount; i++) {
      const el = circleRefs.current[i];
      if (!el) continue;
      el.setAttribute("cx", String(proj[i].sx));
      el.setAttribute("cy", String(proj[i].sy));
      el.setAttribute("r", String(Math.max(0, proj[i].size / 2)));
      el.setAttribute(
        "fill-opacity",
        String(quantizeFloat(clamp(opa[i], 0, 1))),
      );
    }
    prevMsRef.current = time.get();
    phaseStartMsRef.current = time.get();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  // ─── Initialize new circles from dot-count increases ──────────────────
  useLayoutEffect(() => {
    const def = statesRef.current[stateRef.current];
    const proj = def.layout(0).map((v) => project(v, def.projConfig));
    const opa = resolveOpacities(def.opacities, {
      layoutAngle: 0,
      opacityAngle: 0,
    });

    for (let i = 0; i < effectiveDotCount; i++) {
      const el = circleRefs.current[i];
      if (!el || el.hasAttribute("cx")) continue;
      el.setAttribute("cx", String(proj[i]?.sx ?? 0));
      el.setAttribute("cy", String(proj[i]?.sy ?? 0));
      el.setAttribute("r", String(Math.max(0, (proj[i]?.size ?? 0) / 2)));
      el.setAttribute(
        "fill-opacity",
        String(quantizeFloat(clamp(opa[i] ?? 1, 0, 1))),
      );
      if (!springsRef.current[i]) {
        springsRef.current[i] = {
          cx: proj[i]?.sx ?? 0,
          cy: proj[i]?.sy ?? 0,
          r: Math.max(0, (proj[i]?.size ?? 0) / 2),
          vx: 0,
          vy: 0,
          vr: 0,
          settled: true,
        };
      }
    }
    springsRef.current.length = effectiveDotCount;
  }, [effectiveDotCount]);

  // ─── Outgoing dots fade-out ───────────────────────────────────────────
  useEffect(() => {
    if (!outgoingData) return;
    for (const el of outgoingCircleRefs.current) {
      if (el)
        animate(el, { fillOpacity: 0 }, {
          duration: OUTGOING_DURATION,
          ease: "easeOut",
        });
    }
    const timer = setTimeout(
      () => setOutgoingData(null),
      OUTGOING_DURATION * 1000 + 50,
    );
    return () => clearTimeout(timer);
  }, [outgoingData]);

  // ─── State transitions ────────────────────────────────────────────────
  useEffect(() => {
    phaseStartMsRef.current = time.get();
    prevMsRef.current = time.get();

    // Capture current opacities from DOM for crossfade
    const currentOpacities: number[] = [];
    for (let i = 0; i < effectiveDotCount; i++) {
      const el = circleRefs.current[i];
      currentOpacities.push(
        el ? parseFloat(el.getAttribute("fill-opacity") || "1") : 1,
      );
    }
    opacityTransitionRef.current = {
      state: effectiveState,
      startMs: time.get(),
      from: currentOpacities,
    };

    const def = statesRef.current[effectiveState];

    // Set static spring targets for non-animated states
    if (!def.animated) {
      const proj = def.layout(0).map((v) => project(v, def.projConfig));
      springTargetsRef.current = proj;
    }

    // Always initialise springs from current DOM positions so every state
    // transition (including → animated) gets a smooth spring-in.
    for (let i = 0; i < effectiveDotCount; i++) {
      const el = circleRefs.current[i];
      if (!springsRef.current[i]) {
        springsRef.current[i] = {
          cx: el ? parseFloat(el.getAttribute("cx") || "0") : 0,
          cy: el ? parseFloat(el.getAttribute("cy") || "0") : 0,
          r: el ? parseFloat(el.getAttribute("r") || "0") : 0,
          vx: 0,
          vy: 0,
          vr: 0,
          settled: false,
        };
      } else {
        const s = springsRef.current[i];
        if (el) {
          s.cx = parseFloat(el.getAttribute("cx") || "0");
          s.cy = parseFloat(el.getAttribute("cy") || "0");
          s.r = parseFloat(el.getAttribute("r") || "0");
        }
        s.vx = s.vy = s.vr = 0;
        s.settled = false;
      }
    }
    springActiveRef.current = true;
  }, [effectiveState, config, time, effectiveDotCount]);

  // ─── Time loop — direct DOM mutation, no MotionValue intermediary ─────
  useMotionValueEvent(time, "change", (ms) => {
    const key = stateRef.current;
    const def = statesRef.current[key];
    const dotCount = effectiveDotCountRef.current;
    const dt = Math.min((ms - prevMsRef.current) / 1000, 1 / 30);
    prevMsRef.current = ms;

    // ── Non-animated states ─────────────────────────────────────────────
    if (!def.animated) {
      const hasOpaTr = opacityTransitionRef.current?.state === key;
      const hasSprings = springActiveRef.current;
      if (!hasOpaTr && !hasSprings) return;

      const opa = resolveOpacities(def.opacities, {
        layoutAngle: 0,
        opacityAngle: 0,
      });
      const targets = springTargetsRef.current;

      let anySpringsActive = false;
      for (let i = 0; i < dotCount; i++) {
        const el = circleRefs.current[i];
        if (!el) continue;

        // Spring position update
        if (hasSprings && targets[i]) {
          const s = springsRef.current[i];
          if (s && !s.settled) {
            const t = dotCount <= 1 ? 0 : i / (dotCount - 1);
            stepSpring(
              s,
              targets[i].sx,
              targets[i].sy,
              Math.max(0, targets[i].size / 2),
              240 * (1 - 0.35 * t),
              25 * (1 + 0.24 * t),
              0.8 * (1 + 0.6 * t),
              dt,
            );
            el.setAttribute("cx", String(s.cx));
            el.setAttribute("cy", String(s.cy));
            el.setAttribute("r", String(Math.max(0, s.r)));
            anySpringsActive = true;
          }
        }

        // Opacity crossfade
        if (hasOpaTr) {
          const tr = opacityTransitionRef.current!;
          const elapsed = ms - tr.startMs;
          const targetOpa = quantizeFloat(clamp(opa[i], 0, 1));
          const localMs = elapsed - i * OPACITY_STAGGER_MS;
          const blendT = clamp(localMs / OPACITY_CROSSFADE_MS, 0, 1);
          if (blendT >= 1) {
            el.setAttribute("fill-opacity", String(targetOpa));
          } else {
            const from = quantizeFloat(
              clamp(tr.from[i] ?? targetOpa, 0, 1),
            );
            el.setAttribute(
              "fill-opacity",
              String(quantizeFloat(lerp(from, targetOpa, blendT))),
            );
          }
        }
      }

      if (!anySpringsActive) springActiveRef.current = false;
      if (hasOpaTr) {
        const doneAtMs =
          (dotCount - 1) * OPACITY_STAGGER_MS + OPACITY_CROSSFADE_MS;
        if (ms - opacityTransitionRef.current!.startMs >= doneAtMs) {
          opacityTransitionRef.current = null;
        }
      }
      return;
    }

    // ── Animated states — direct setAttribute, no MotionValues ──────────
    const t = (ms - phaseStartMsRef.current) / 1000;
    const layoutAngle = (def.layoutSpeed ?? 0) * t;
    const opacityAngle = (def.opacitySpeed ?? def.layoutSpeed ?? 0) * t;

    const layout = def.layout(layoutAngle);
    const opa = resolveOpacities(def.opacities, { layoutAngle, opacityAngle });
    const projCfg = def.projConfig;
    const gridRange = projCfg.grid.max - projCfg.grid.min;

    const tr = opacityTransitionRef.current;
    const inOpaTr = tr?.state === key;
    const trElapsedMs = inOpaTr ? ms - tr.startMs : 0;

    const hasActiveSprings = springActiveRef.current;
    let anySpringsStillActive = false;

    for (let i = 0; i < dotCount; i++) {
      const el = circleRefs.current[i];
      if (!el) continue;

      // Inline projection — avoids allocating an intermediate array.
      const v = layout[i];
      const sx =
        SVG_PAD + ((v.x - projCfg.grid.min) / gridRange) * SVG_SPAN;
      const sy =
        SVG_PAD + ((v.y - projCfg.grid.min) / gridRange) * SVG_SPAN;
      const sz = lerpSize(v.z);
      const targetR = Math.max(0, sz / 2);

      // Spring blending: smoothly transition from old positions to animated targets
      if (hasActiveSprings) {
        const s = springsRef.current[i];
        if (s && !s.settled) {
          const st = dotCount <= 1 ? 0 : i / (dotCount - 1);
          stepSpring(
            s, sx, sy, targetR,
            240 * (1 - 0.35 * st),
            25 * (1 + 0.24 * st),
            0.8 * (1 + 0.6 * st),
            dt,
          );
          el.setAttribute("cx", String(s.cx));
          el.setAttribute("cy", String(s.cy));
          el.setAttribute("r", String(Math.max(0, s.r)));
          anySpringsStillActive = true;
        } else {
          el.setAttribute("cx", String(sx));
          el.setAttribute("cy", String(sy));
          el.setAttribute("r", String(targetR));
        }
      } else {
        el.setAttribute("cx", String(sx));
        el.setAttribute("cy", String(sy));
        el.setAttribute("r", String(targetR));
      }

      let targetOpa = quantizeFloat(clamp(opa[i], 0, 1));
      if (inOpaTr) {
        const localMs = trElapsedMs - i * OPACITY_STAGGER_MS;
        const blendT = clamp(localMs / OPACITY_CROSSFADE_MS, 0, 1);
        if (blendT < 1) {
          const from = quantizeFloat(clamp(tr.from[i] ?? targetOpa, 0, 1));
          targetOpa = quantizeFloat(lerp(from, targetOpa, blendT));
        }
      }
      el.setAttribute("fill-opacity", String(targetOpa));
    }

    if (hasActiveSprings && !anySpringsStillActive) {
      springActiveRef.current = false;
    }
    if (inOpaTr) {
      const doneAtMs =
        (dotCount - 1) * OPACITY_STAGGER_MS + OPACITY_CROSSFADE_MS;
      if (trElapsedMs >= doneAtMs) opacityTransitionRef.current = null;
    }
  });

  // ─── Render ────────────────────────────────────────────────────────────

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
        {outgoingData?.map((d, i) => (
          <circle
            key={`out-${i}`}
            ref={(el) => {
              outgoingCircleRefs.current[i] = el;
            }}
            cx={d.cx}
            cy={d.cy}
            r={d.r}
            fill="currentColor"
            fillOpacity={d.opacity}
          />
        ))}
        {Array.from({ length: effectiveDotCount }, (_, i) => (
          <circle
            key={i}
            ref={(el) => {
              circleRefs.current[i] = el;
            }}
            fill="currentColor"
          />
        ))}
      </svg>
    </div>
  );
};

export default DotIcon;
DotIcon.displayName = "DotIcon";
