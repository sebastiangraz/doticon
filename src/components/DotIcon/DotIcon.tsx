import { useRef, useEffect } from "react";
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

// Grid lives at integer coords 0–3 on all axes; center at 1.5,1.5,1.5.
// Z snap zones: 0 → 6px, 1 → 8px, 2 → 10px, 3 → 12px
const GRID = { min: 0, max: 3, center: 1.5 } as const;

const VIEW_SIZE = 100;
const SVG_PAD = 14;
const SVG_SPAN = VIEW_SIZE - 2 * SVG_PAD;

const DOT_COUNT = 16;

// Clamped size chart — back → front. Editable for tuning.
const DOT_SIZES = [6, 8, 10, 12] as const;

// Fallback opacity pattern (row-major 4×4).
const DEFAULT_OPACITIES = [
  0.12, 1, 0.45, 1, 1, 0.45, 1, 0.45, 0.45, 1, 0.45, 1, 1, 0.45, 1, 0.12,
];

// Thinking: one sine wave along Fibonacci spiral index order; +0.5 = 50% path offset; `opacityAngle` is advanced by `opacitySpeed` (rad/s), independent of layout rotation.
const THINKING_OPACITY_MIN = 0.12;
const THINKING_OPACITY_MAX = 1;

const thinkingOpacities = (opacityAngle = 0): number[] =>
  Array.from({ length: DOT_COUNT }, (_, i) => {
    const u = (i / DOT_COUNT + 0.5) % 1;
    const w = 0.5 + 0.5 * Math.sin(2 * Math.PI * u + opacityAngle);
    return (
      THINKING_OPACITY_MIN + (THINKING_OPACITY_MAX - THINKING_OPACITY_MIN) * w
    );
  });

// ─── 3D math ─────────────────────────────────────────────────────────────────

const rotateY = ({ x, y, z }: Vec3, a: number): Vec3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c + z * s, y, z: -x * s + z * c };
};

// ─── Orthographic projection (drop Z, map X/Y → SVG) ────────────────────────

const snapSize = (z: number): number => {
  const t = (z - GRID.min) / (GRID.max - GRID.min);
  const idx = Math.round(Math.max(0, Math.min(1, t)) * (DOT_SIZES.length - 1));
  return DOT_SIZES[idx];
};

type Projected = { sx: number; sy: number; size: number; z: number };

const project = (v: Vec3): Projected => ({
  sx: SVG_PAD + ((v.x - GRID.min) / (GRID.max - GRID.min)) * SVG_SPAN,
  sy: SVG_PAD + ((v.y - GRID.min) / (GRID.max - GRID.min)) * SVG_SPAN,
  size: snapSize(v.z),
  z: v.z,
});

// ─── GEOMETRY ────────────────────────────────────────────────────────────────

const SPHERE_BASE: Vec3[] = (() => {
  const phi = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: DOT_COUNT }, (_, i) => {
    const y = 1 - (i / (DOT_COUNT - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = phi * i;
    return { x: Math.cos(theta) * r, y, z: Math.sin(theta) * r };
  });
})();

// ─── STATE SYSTEM ────────────────────────────────────────────────────────────

export type StateKey = "dormant" | "thinking" | "loading";

type Opacities = number[] | ((angle?: number) => number[]);

type StateDef = {
  label: string;
  layout: (angle?: number) => Vec3[];
  opacities: Opacities;
  animated: boolean;
  /** Radians per second — passed to `layout()` (3D spin). */
  layoutSpeed?: number;
  /** Radians per second — phase for functional opacities (e.g. `thinkingOpacities`). Defaults to `layoutSpeed` when omitted. */
  opacitySpeed?: number;
};

const resolveOpacities = (o: Opacities, angle = 0): number[] =>
  typeof o === "function" ? o(angle) : o;

// Inner 2×2 block of the 4×4 grid (indices 5,6,9,10).
const INNER = new Set([6, 9]);

const dormantLayout = (): Vec3[] =>
  Array.from({ length: DOT_COUNT }, (_, i) => ({
    x: i % 4,
    y: Math.floor(i / 4),
    z: INNER.has(i) ? GRID.max - 1 : GRID.max - 2,
  }));

const thinkingLayout = (angle = 0): Vec3[] =>
  SPHERE_BASE.map((pt) => {
    const r = rotateY(pt, angle);
    return {
      x: GRID.center + r.x * GRID.center,
      y: GRID.center + r.y * GRID.center,
      z: GRID.center + r.z * GRID.center,
    };
  });

// ─── Loading state ────────────────────────────────────────────────────────────
// Fill order: column by column (x=0→3), bottom-to-top within each column (y=3→0).
// Grid is row-major: index i → x = i%4, y = floor(i/4), so y=3 is visual bottom.
const LOADING_FILL_ORDER = [
  12, 8, 4, 0, 13, 9, 5, 1, 14, 10, 6, 2, 15, 11, 7, 3,
];

// Inverse map: dot index → its rank in the fill sequence.
const LOADING_DOT_RANK: number[] = new Array(DOT_COUNT);
LOADING_FILL_ORDER.forEach((dotIdx, rank) => {
  LOADING_DOT_RANK[dotIdx] = rank;
});

const LOADING_PAUSE = 2; // extra units after last dot fills
const LOADING_CYCLE = DOT_COUNT + LOADING_PAUSE; // 20 units per loop
const LOADING_TRAIL_STEPS = DOT_COUNT - 1; // ranks until trail reaches min
const LOADING_FILLED_OPACITY_MIN = 0.12;

// Each dot independently tracks how long ago it was most recently filled,
// so loop transitions are seamless — no global phase reset.
const loadingTimeSinceFill = (angle: number, rank: number): number => {
  if (angle < rank) return Infinity; // not yet reached on first pass
  return (angle - rank) % LOADING_CYCLE;
};

const loadingLayout = (angle = 0): Vec3[] =>
  Array.from({ length: DOT_COUNT }, (_, i) => {
    const age = loadingTimeSinceFill(angle, LOADING_DOT_RANK[i]);
    const trailT = Math.min(age / LOADING_TRAIL_STEPS, 1);
    return {
      x: i % 4,
      y: Math.floor(i / 4),
      z: age < DOT_COUNT ? lerp(GRID.max, GRID.max - 2, trailT) : GRID.max - 2,
    };
  });

const loadingOpacities = (angle = 0): number[] =>
  Array.from({ length: DOT_COUNT }, (_, i) => {
    const age = loadingTimeSinceFill(angle, LOADING_DOT_RANK[i]);
    if (age >= DOT_COUNT) return 0.12;
    const trailT = Math.min(age / LOADING_TRAIL_STEPS, 1);
    return lerp(1, LOADING_FILLED_OPACITY_MIN, trailT);
  });

const STATES: Record<StateKey, StateDef> = {
  dormant: {
    label: "Dormant",
    layout: dormantLayout,
    opacities: DEFAULT_OPACITIES,
    animated: false,
  },
  thinking: {
    label: "Thinking",
    layout: thinkingLayout,
    opacities: thinkingOpacities,
    animated: true,
    layoutSpeed: 3,
    opacitySpeed: 4,
  },
  loading: {
    label: "Loading",
    layout: loadingLayout,
    opacities: loadingOpacities,
    animated: true,
    layoutSpeed: 12,
  },
};

export const STATE_KEYS = Object.keys(STATES) as StateKey[];

export const getStateLabel = (key: StateKey): string => STATES[key].label;

// ─── SPRING CONFIG ───────────────────────────────────────────────────────────

const SPRING = {
  type: "spring" as const,
  stiffness: 100,
  damping: 18,
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

const DotCircle = ({ mv }: { mv: DotMV }) => {
  const cx = useSpring(mv.cx.get(), SPRING);
  const cy = useSpring(mv.cy.get(), SPRING);
  const r = useSpring(mv.r.get(), SPRING);
  const opacity = useSpring(mv.opacity.get(), SPRING);

  useMotionValueEvent(mv.cx, "change", (latest) => cx.set(latest));
  useMotionValueEvent(mv.cy, "change", (latest) => cy.set(latest));
  useMotionValueEvent(mv.r, "change", (latest) => r.set(latest));
  useMotionValueEvent(mv.opacity, "change", (latest) => opacity.set(latest));

  // When the underlying MotionValue instances change (state switch),
  // nudge spring targets so rapid switching feels like “following” rather than
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

// ─── COMPONENT ───────────────────────────────────────────────────────────────

const DotIcon = ({
  size = 200,
  state = "dormant",
  color,
  style,
}: {
  size?: number;
  state?: StateKey;
  color?: string;
  style?: CSSProperties;
}) => {
  const time = useTime();
  const phaseStartMsRef = useRef(0);
  const stateRef = useRef<StateKey>(state);
  stateRef.current = state;

  const defRef = useRef<StateDef>(STATES[state]);
  defRef.current = STATES[state];

  // Target MotionValues that update with Motion’s time driver.
  // DotCircle springs follow these targets, giving smooth rapid-fire switching.
  const targetsRef = useRef<DotMV[] | null>(null);
  if (!targetsRef.current) {
    const def = STATES[state];
    const proj = def.layout(0).map(project);
    const opa = resolveOpacities(def.opacities, 0);
    targetsRef.current = proj.map((p, i) => ({
      cx: motionValue(p.sx),
      cy: motionValue(p.sy),
      r: motionValue(p.size / 2),
      opacity: motionValue(opa[i]),
    }));
  }
  const targetMvs = targetsRef.current;

  // ─── State transitions ────────────────────────────────────────────────────

  useEffect(() => {
    phaseStartMsRef.current = time.get();
  }, [state, time]);

  useMotionValueEvent(time, "change", (ms) => {
    const key = stateRef.current;
    const def = STATES[key];
    const t = (ms - phaseStartMsRef.current) / 1000;

    const layoutAngle = def.animated ? (def.layoutSpeed ?? 0) * t : 0;
    const opacityAngle = def.animated
      ? (def.opacitySpeed ?? def.layoutSpeed ?? 0) * t
      : 0;

    const proj = def.layout(layoutAngle).map(project);
    const opa = resolveOpacities(def.opacities, opacityAngle);

    for (let i = 0; i < DOT_COUNT; i++) {
      targetMvs[i].cx.set(proj[i].sx);
      targetMvs[i].cy.set(proj[i].sy);
      targetMvs[i].r.set(Math.max(0, proj[i].size / 2));
      targetMvs[i].opacity.set(clamp(opa[i], 0, 1));
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
          <DotCircle key={i} mv={mv} />
        ))}
      </svg>
    </div>
  );
};

export default DotIcon;
DotIcon.displayName = "DotIcon";
