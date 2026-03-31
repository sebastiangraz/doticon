import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { CSSProperties } from "react";
import { motion, animate, motionValue, type MotionValue } from "motion/react";

// ─── TYPES ────────────────────────────────────────────────────────────────────

type Vec3 = { x: number; y: number; z: number };
type Projected = { sx: number; sy: number; size: number; z: number };

type DotMV = {
  cx: MotionValue<number>;
  cy: MotionValue<number>;
  r: MotionValue<number>;
  opacity: MotionValue<number>;
};

type Snapshot = { sx: number; sy: number; r: number; opacity: number };

// ─── CONSTANTS (grid-independent) ─────────────────────────────────────────────

const VIEW_SIZE = 100;
const SVG_PAD = 14;
const SVG_SPAN = VIEW_SIZE - 2 * SVG_PAD;

// Clamped size chart — back → front. Editable for tuning.
const DOT_SIZES = [6, 8, 10, 12] as const;

const SPRING = {
  type: "spring" as const,
  stiffness: 100,
  damping: 18,
  mass: 0.8,
};
const STAGGER = 0.01;

/** Seconds — eases discrete Z→radius steps while the sphere spins. */
const RADIUS_SMOOTH_TAU_S = 0.2;

const THINKING_OPACITY_MIN = 0.12;
const THINKING_OPACITY_MAX = 1;

const LOADING_PAUSE = 2;
const LOADING_FILLED_OPACITY_MIN = 0.12;

// ─── PURE MATH ────────────────────────────────────────────────────────────────

const rotateY = ({ x, y, z }: Vec3, a: number): Vec3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c + z * s, y, z: -x * s + z * c };
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Semi-implicit Euler step for a spring toward target = 1.
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

// ─── STATE SYSTEM ─────────────────────────────────────────────────────────────

export type StateKey = "dormant" | "thinking" | "loading";

type Opacities = number[] | ((angle?: number) => number[]);

type StateDef = {
  label: string;
  layout: (angle?: number) => Vec3[];
  opacities: Opacities;
  animated: boolean;
  /** Radians per second — passed to `layout()` (3D spin). */
  layoutSpeed?: number;
  /** Radians per second — phase for functional opacities. Defaults to `layoutSpeed` when omitted. */
  opacitySpeed?: number;
};

const resolveOpacities = (o: Opacities, angle = 0): number[] =>
  typeof o === "function" ? o(angle) : o;

// ─── GRID CONFIG FACTORY ──────────────────────────────────────────────────────

type GridConfig = {
  g: number;
  dotCount: number;
  gridDef: { min: number; max: number; center: number };
  project: (v: Vec3) => Projected;
  identity: () => number[];
  sortByZ: (proj: Projected[]) => number[];
  states: Record<StateKey, StateDef>;
};

const buildGridConfig = (g: number): GridConfig => {
  const dotCount = g * g;
  const gridDef = { min: 0, max: g - 1, center: (g - 1) / 2 };

  const snapSize = (z: number): number => {
    const t = (z - gridDef.min) / (gridDef.max - gridDef.min);
    const idx = Math.round(
      Math.max(0, Math.min(1, t)) * (DOT_SIZES.length - 1),
    );
    return DOT_SIZES[idx];
  };

  const project = (v: Vec3): Projected => ({
    sx:
      SVG_PAD + ((v.x - gridDef.min) / (gridDef.max - gridDef.min)) * SVG_SPAN,
    sy:
      SVG_PAD + ((v.y - gridDef.min) / (gridDef.max - gridDef.min)) * SVG_SPAN,
    size: snapSize(v.z),
    z: v.z,
  });

  const identity = () => Array.from({ length: dotCount }, (_, i) => i);

  const sortByZ = (proj: Projected[]): number[] =>
    identity().sort((a, b) => proj[a].z - proj[b].z);

  // Fibonacci sphere — scales to fit within the grid using center as radius.
  const sphereBase: Vec3[] = (() => {
    const phi = Math.PI * (3 - Math.sqrt(5));
    return Array.from({ length: dotCount }, (_, i) => {
      const y = 1 - (i / (dotCount - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = phi * i;
      return { x: Math.cos(theta) * r, y, z: Math.sin(theta) * r };
    });
  })();

  // Default opacities: corners dimmed, checkerboard interior.
  const defaultOpacities: number[] = Array.from(
    { length: dotCount },
    (_, i) => {
      const col = i % g;
      const row = Math.floor(i / g);
      const isCorner =
        (col === 0 || col === g - 1) && (row === 0 || row === g - 1);
      return isCorner ? 0.12 : col % 2 === row % 2 ? 1 : 0.45;
    },
  );

  // Loading sequences: column-by-column, bottom-to-top within each column.
  const loadingFillOrder: number[] = [];
  for (let col = 0; col < g; col++)
    for (let row = g - 1; row >= 0; row--) loadingFillOrder.push(row * g + col);

  const loadingDotRank: number[] = new Array(dotCount);
  loadingFillOrder.forEach((dotIdx, rank) => {
    loadingDotRank[dotIdx] = rank;
  });

  const loadingCycle = dotCount + LOADING_PAUSE;
  const loadingTrailSteps = dotCount - 1;

  // Each dot independently tracks how long ago it was most recently filled.
  const loadingTimeSinceFill = (angle: number, rank: number): number => {
    if (angle < rank) return Infinity;
    return (angle - rank) % loadingCycle;
  };

  // ─── Layout functions ──────────────────────────────────────────────────────

  // Static N×N grid. Non-edge dots sit one Z-level higher than the outer ring.
  const dormantLayout = (): Vec3[] =>
    Array.from({ length: dotCount }, (_, i) => {
      const col = i % g;
      const row = Math.floor(i / g);
      const isInner = col > 0 && col < g - 1 && row > 0 && row < g - 1;
      return {
        x: col,
        y: row,
        z: isInner ? gridDef.max - 1 : gridDef.max - 2,
      };
    });

  const thinkingLayout = (angle = 0): Vec3[] =>
    sphereBase.map((pt) => {
      const r = rotateY(pt, angle);
      return {
        x: gridDef.center + r.x * gridDef.center,
        y: gridDef.center + r.y * gridDef.center,
        z: gridDef.center + r.z * gridDef.center,
      };
    });

  const loadingLayout = (angle = 0): Vec3[] =>
    Array.from({ length: dotCount }, (_, i) => {
      const age = loadingTimeSinceFill(angle, loadingDotRank[i]);
      const trailT = Math.min(age / loadingTrailSteps, 1);
      return {
        x: i % g,
        y: Math.floor(i / g),
        z:
          age < dotCount
            ? lerp(gridDef.max, gridDef.max - 2, trailT)
            : gridDef.max - 2,
      };
    });

  // ─── Opacity functions ─────────────────────────────────────────────────────

  // One sine wave along Fibonacci spiral index order; `opacityAngle` is
  // advanced by `opacitySpeed` (rad/s), independent of layout rotation.
  const thinkingOpacities = (opacityAngle = 0): number[] =>
    Array.from({ length: dotCount }, (_, i) => {
      const u = (i / dotCount + 0.5) % 1;
      const w = 0.5 + 0.5 * Math.sin(2 * Math.PI * u + opacityAngle);
      return (
        THINKING_OPACITY_MIN + (THINKING_OPACITY_MAX - THINKING_OPACITY_MIN) * w
      );
    });

  const loadingOpacities = (angle = 0): number[] =>
    Array.from({ length: dotCount }, (_, i) => {
      const age = loadingTimeSinceFill(angle, loadingDotRank[i]);
      if (age >= dotCount) return LOADING_FILLED_OPACITY_MIN;
      const trailT = Math.min(age / loadingTrailSteps, 1);
      return lerp(1, LOADING_FILLED_OPACITY_MIN, trailT);
    });

  // ─── State registry ────────────────────────────────────────────────────────

  const states: Record<StateKey, StateDef> = {
    dormant: {
      label: "Dormant",
      layout: dormantLayout,
      opacities: defaultOpacities,
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

  return { g, dotCount, gridDef, project, identity, sortByZ, states };
};

// ─── EXPORTS ──────────────────────────────────────────────────────────────────

export const STATE_KEYS = ["dormant", "thinking", "loading"] as StateKey[];

export const getStateLabel = (key: StateKey): string =>
  ({ dormant: "Dormant", thinking: "Thinking", loading: "Loading" })[key];

// ─── COMPONENT ────────────────────────────────────────────────────────────────

const orderEq = (a: number[], b: number[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

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
  const cfg = useMemo(() => {
    const g = Math.min(12, Math.max(3, Math.round(grid)));
    return buildGridConfig(g);
  }, [grid]);

  const [spinning, setSpinning] = useState(false);
  const [paintOrder, setPaintOrder] = useState<number[]>(() => cfg.identity());
  const stateRef = useRef(state);
  stateRef.current = state;

  // Reinitialize MotionValues when the grid size changes.
  const cfgRef = useRef(cfg);
  const mvsRef = useRef<DotMV[] | null>(null);
  if (!mvsRef.current || cfgRef.current !== cfg) {
    cfgRef.current = cfg;
    const def = cfg.states[state];
    const proj = def.layout(0).map(cfg.project);
    const opa = resolveOpacities(def.opacities, 0);
    mvsRef.current = proj.map((p, i) => ({
      cx: motionValue(p.sx),
      cy: motionValue(p.sy),
      r: motionValue(p.size / 2),
      opacity: motionValue(opa[i]),
    }));
  }
  const mvs = mvsRef.current;

  const rafRef = useRef<number | null>(null);
  const layoutAngleRef = useRef(0);
  const opacityAngleRef = useRef(0);
  const tRef = useRef<number | null>(null);
  const ctrlsRef = useRef<{ stop: () => void }[]>([]);

  const stopAnims = useCallback(() => {
    ctrlsRef.current.forEach((c) => c.stop());
    ctrlsRef.current = [];
  }, []);

  const morphTo = useCallback(
    (targets: Projected[], opacities: number[]) => {
      stopAnims();
      mvs.forEach((mv, i) => {
        const springOpts = { ...SPRING, delay: i * STAGGER };
        ctrlsRef.current.push(animate(mv.cx, targets[i].sx, springOpts));
        ctrlsRef.current.push(animate(mv.cy, targets[i].sy, springOpts));
        ctrlsRef.current.push(animate(mv.r, targets[i].size / 2, springOpts));
        ctrlsRef.current.push(animate(mv.opacity, opacities[i], springOpts));
      });
    },
    [mvs, stopAnims],
  );

  const stopLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      tRef.current = null;
    }
  }, []);

  const startLoop = useCallback(
    (key: StateKey, def: StateDef, sources?: Snapshot[]) => {
      if (rafRef.current) return;
      tRef.current = null;

      const blends = sources
        ? Array.from({ length: cfg.dotCount }, () => ({ val: 0, vel: 0 }))
        : null;
      let elapsed = 0;

      const tick = () => {
        if (stateRef.current !== key) {
          rafRef.current = null;
          return;
        }
        const now = performance.now();
        if (tRef.current !== null) {
          const dt = (now - tRef.current) / 1000;
          elapsed += dt;
          const layoutSpeed = def.layoutSpeed ?? 0.6;
          const opacitySpeed = def.opacitySpeed ?? layoutSpeed;
          layoutAngleRef.current += layoutSpeed * dt;
          opacityAngleRef.current += opacitySpeed * dt;

          if (blends) {
            for (let i = 0; i < cfg.dotCount; i++) {
              const b = blends[i];
              if (b.val < 1 && elapsed >= i * STAGGER) {
                const next = stepBlend(b.val, b.vel, dt);
                b.val = next.val;
                b.vel = next.vel;
              }
            }
          }

          const proj = def.layout(layoutAngleRef.current).map(cfg.project);
          const opa = resolveOpacities(def.opacities, opacityAngleRef.current);

          proj.forEach((p, i) => {
            const tx = p.sx;
            const ty = p.sy;
            const tr = p.size / 2;
            const to = opa[i];

            const rAlpha = 1 - Math.exp(-dt / RADIUS_SMOOTH_TAU_S);
            if (sources && blends) {
              const b = blends[i].val;
              const s = sources[i];
              mvs[i].cx.set(lerp(s.sx, tx, b));
              mvs[i].cy.set(lerp(s.sy, ty, b));
              const desiredR = lerp(s.r, tr, b);
              mvs[i].r.set(lerp(mvs[i].r.get(), desiredR, rAlpha));
              mvs[i].opacity.set(lerp(s.opacity, to, b));
            } else {
              mvs[i].cx.set(tx);
              mvs[i].cy.set(ty);
              mvs[i].r.set(lerp(mvs[i].r.get(), tr, rAlpha));
              mvs[i].opacity.set(to);
            }
          });

          const order = cfg.sortByZ(proj);
          setPaintOrder((prev) => (orderEq(prev, order) ? prev : order));
        }
        tRef.current = now;
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [mvs, cfg],
  );

  // ─── State transitions ─────────────────────────────────────────────────────

  useEffect(() => {
    const def = cfg.states[state];

    stopLoop();
    stopAnims();
    layoutAngleRef.current = 0;
    opacityAngleRef.current = 0;

    if (def.animated) {
      const src: Snapshot[] = mvs.map((mv) => ({
        sx: mv.cx.get(),
        sy: mv.cy.get(),
        r: mv.r.get(),
        opacity: mv.opacity.get(),
      }));

      setSpinning(true);
      setPaintOrder(cfg.identity());
      startLoop(state, def, src);
    } else {
      setSpinning(false);
      setPaintOrder(cfg.identity());
      const proj = def.layout(0).map(cfg.project);
      const opa = resolveOpacities(def.opacities, 0);
      morphTo(proj, opa);
    }

    return () => {
      stopAnims();
      stopLoop();
    };
  }, [state, cfg, morphTo, startLoop, stopLoop, stopAnims, mvs]);

  useEffect(() => () => stopLoop(), [stopLoop]);

  // ─── Render ────────────────────────────────────────────────────────────────

  // Guard against a stale paintOrder from a previous grid size during re-render.
  const order =
    spinning && paintOrder.length === cfg.dotCount
      ? paintOrder
      : cfg.identity();

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
        {order.map((i) => (
          <motion.circle
            key={i}
            cx={mvs[i].cx}
            cy={mvs[i].cy}
            r={mvs[i].r}
            fill="currentColor"
            fillOpacity={mvs[i].opacity}
          />
        ))}
      </svg>
    </div>
  );
};

export default DotIcon;
DotIcon.displayName = "DotIcon";
