import { useRef, useEffect, useCallback, useMemo } from "react";
import type { CSSProperties } from "react";
import {
  motion,
  animate,
  motionValue,
  transformValue,
  useTime,
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
  damping: 24,
  mass: 1,
};
const STAGGER = 0.035;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

type DotMV = {
  cx: MotionValue<number>;
  cy: MotionValue<number>;
  r: MotionValue<number>;
  opacity: MotionValue<number>;
};

type Snapshot = { sx: number; sy: number; r: number; opacity: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

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
  const prevStateRef = useRef<StateKey>(state);

  const defRef = useRef<StateDef>(STATES[state]);
  defRef.current = STATES[state];

  const mvsRef = useRef<DotMV[] | null>(null);
  if (!mvsRef.current) {
    const def = STATES[state];
    const proj = def.layout(0).map(project);
    const opa = resolveOpacities(def.opacities, 0);
    mvsRef.current = proj.map((p, i) => ({
      cx: motionValue(p.sx),
      cy: motionValue(p.sy),
      r: motionValue(p.size / 2),
      opacity: motionValue(opa[i]),
    }));
  }
  const mvs = mvsRef.current;

  const ctrlsRef = useRef<{ stop: () => void }[]>([]);

  const stopAnims = useCallback(() => {
    ctrlsRef.current.forEach((c) => c.stop());
    ctrlsRef.current = [];
  }, []);

  const sourcesRef = useRef<Snapshot[] | null>(null);
  const blendsRef = useRef<MotionValue<number>[] | null>(null);
  if (!blendsRef.current) {
    blendsRef.current = Array.from({ length: DOT_COUNT }, () => motionValue(1));
  }
  const blends = blendsRef.current;

  const morphTo = useCallback(
    (targets: Projected[], opacities: number[]) => {
      stopAnims();
      mvs.forEach((mv, i) => {
        const cfg = { ...SPRING, delay: i * STAGGER };
        ctrlsRef.current.push(animate(mv.cx, targets[i].sx, cfg));
        ctrlsRef.current.push(animate(mv.cy, targets[i].sy, cfg));
        ctrlsRef.current.push(animate(mv.r, targets[i].size / 2, cfg));
        ctrlsRef.current.push(animate(mv.opacity, opacities[i], cfg));
      });
    },
    [mvs, stopAnims],
  );

  const phaseTime = useMemo(
    () => transformValue(() => time.get() - phaseStartMsRef.current),
    [time],
  );

  const layoutAngle = useMemo(
    () =>
      transformValue(() => {
        const def = defRef.current;
        const t = phaseTime.get() / 1000;
        return (def.layoutSpeed ?? 0) * t;
      }),
    [phaseTime],
  );

  const opacityAngle = useMemo(
    () =>
      transformValue(() => {
        const def = defRef.current;
        const t = phaseTime.get() / 1000;
        const layoutSpeed = def.layoutSpeed ?? 0;
        const opacitySpeed = def.opacitySpeed ?? layoutSpeed;
        return opacitySpeed * t;
      }),
    [phaseTime],
  );

  const targets = useMemo(
    () =>
      transformValue(() => {
        const def = defRef.current;
        return def.layout(layoutAngle.get()).map(project);
      }),
    [layoutAngle],
  );

  const targetOpacities = useMemo(
    () =>
      transformValue(() => {
        const def = defRef.current;
        return resolveOpacities(def.opacities, opacityAngle.get());
      }),
    [opacityAngle],
  );

  const animatedMvs = useMemo<DotMV[]>(
    () =>
      Array.from({ length: DOT_COUNT }, (_, i) => ({
        cx: transformValue(() => {
          const src = sourcesRef.current?.[i];
          const t = targets.get()[i];
          const b = clamp01(blends[i].get());
          return src ? lerp(src.sx, t.sx, b) : t.sx;
        }),
        cy: transformValue(() => {
          const src = sourcesRef.current?.[i];
          const t = targets.get()[i];
          const b = clamp01(blends[i].get());
          return src ? lerp(src.sy, t.sy, b) : t.sy;
        }),
        r: transformValue(() => {
          const src = sourcesRef.current?.[i];
          const t = targets.get()[i];
          const b = clamp01(blends[i].get());
          const tr = t.size / 2;
          const mixed = src ? lerp(src.r, tr, b) : tr;
          return Math.max(0, mixed);
        }),
        opacity: transformValue(() => {
          const src = sourcesRef.current?.[i];
          const to = targetOpacities.get()[i];
          const b = clamp01(blends[i].get());
          const mixed = src ? lerp(src.opacity, to, b) : to;
          return clamp01(mixed);
        }),
      })),
    [blends, targets, targetOpacities],
  );

  // ─── State transitions ────────────────────────────────────────────────────

  useEffect(() => {
    const def = STATES[state];
    const prevState = prevStateRef.current;
    prevStateRef.current = state;

    stopAnims();
    phaseStartMsRef.current = time.get();

    if (def.animated) {
      const prevMvs = STATES[prevState].animated ? animatedMvs : mvs;
      sourcesRef.current = prevMvs.map((mv) => ({
        sx: mv.cx.get(),
        sy: mv.cy.get(),
        r: mv.r.get(),
        opacity: mv.opacity.get(),
      }));

      blends.forEach((b) => b.set(0));
      blends.forEach((b, i) => {
        const cfg = { ...SPRING, delay: i * STAGGER };
        ctrlsRef.current.push(animate(b, 1, cfg));
      });
    } else {
      const prevMvs = STATES[prevState].animated ? animatedMvs : mvs;
      // Ensure the static MotionValues start from the currently-rendered pose,
      // otherwise we’d animate from stale `mvs` values after being in an animated state.
      for (let i = 0; i < DOT_COUNT; i++) {
        mvs[i].cx.set(prevMvs[i].cx.get());
        mvs[i].cy.set(prevMvs[i].cy.get());
        mvs[i].r.set(prevMvs[i].r.get());
        mvs[i].opacity.set(prevMvs[i].opacity.get());
      }

      sourcesRef.current = null;
      blends.forEach((b) => b.set(1));
      const proj = def.layout(0).map(project);
      const opa = resolveOpacities(def.opacities, 0);
      morphTo(proj, opa);
    }

    return () => {
      stopAnims();
    };
  }, [state, morphTo, stopAnims, mvs, time, blends, animatedMvs]);

  // ─── Render ────────────────────────────────────────────────────────────────

  const renderMvs = STATES[state].animated ? animatedMvs : mvs;

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
        {renderMvs.map((mv, i) => (
          <motion.circle
            key={i}
            cx={mv.cx}
            cy={mv.cy}
            r={mv.r}
            fill="currentColor"
            fillOpacity={mv.opacity}
          />
        ))}
      </svg>
    </div>
  );
};

export default DotIcon;
DotIcon.displayName = "DotIcon";
