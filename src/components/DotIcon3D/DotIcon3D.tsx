import { useState, useRef, useEffect, useCallback } from "react";
import type { CSSProperties } from "react";
import { motion, animate, motionValue, type MotionValue } from "motion/react";

// ─── 3D ENGINE ───────────────────────────────────────────────────────────────

type Vec3 = { x: number; y: number; z: number };

// Grid lives at integer coords 0–3; center at 1.5,1.5,0.
// Z snap zones: z < -1 → 4px, [-1,0) → 5px, [0,1) → 7px, ≥ 1 → 8px
const GRID = { min: 0, max: 3, center: 1.5 } as const;
const Z_EXTENT = 1.5;

const VIEW_SIZE = 100;
const SVG_PAD = 18;
const SVG_SPAN = VIEW_SIZE - 2 * SVG_PAD;

const DOT_COUNT = 16;

// Clamped size chart — back → front. Editable for tuning.
const DOT_SIZES = [6, 8, 10, 12] as const;

// Fallback opacity pattern (row-major 4×4).
const DEFAULT_OPACITIES = [
  0.12, 1, 0.45, 1, 1, 0.45, 1, 0.45, 0.45, 1, 0.45, 1, 1, 0.45, 1, 0.12,
];

const THINKING_OPACITIES = [
  0.12, 0.12, 0.45, 0.12, 0.45, 0.12, 0.45, 1, 0.12, 0.12, 1, 0.12, 0.12, 0.12,
  1, 0.12,
];

// ─── 3D math ─────────────────────────────────────────────────────────────────

const rotateY = ({ x, y, z }: Vec3, a: number): Vec3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c + z * s, y, z: -x * s + z * c };
};

// ─── Orthographic projection (drop Z, map X/Y → SVG) ────────────────────────

const snapSize = (z: number): number => {
  const t = (z + Z_EXTENT) / (2 * Z_EXTENT);
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

export type StateKey = "dormant" | "thinking";

type Opacities = number[] | ((angle?: number) => number[]);

type StateDef = {
  label: string;
  layout: (angle?: number) => Vec3[];
  opacities: Opacities;
  animated: boolean;
  speed?: number;
};

const resolveOpacities = (o: Opacities, angle = 0): number[] =>
  typeof o === "function" ? o(angle) : o;

// Inner 2×2 block of the 4×4 grid (indices 5,6,9,10).
const INNER = new Set([5, 6, 9, 10]);

const dormantLayout = (): Vec3[] =>
  Array.from({ length: DOT_COUNT }, (_, i) => ({
    x: i % 4,
    y: Math.floor(i / 4),
    z: INNER.has(i) ? 0.5 : -0.5,
  }));

const thinkingLayout = (angle = 0): Vec3[] =>
  SPHERE_BASE.map((pt) => {
    const r = rotateY(pt, angle);
    return {
      x: GRID.center + r.x * Z_EXTENT,
      y: GRID.center + r.y * Z_EXTENT,
      z: r.z * Z_EXTENT,
    };
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
    opacities: THINKING_OPACITIES,
    animated: true,
    speed: 0.2,
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
const STAGGER = 0.035;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

type DotMV = {
  cx: MotionValue<number>;
  cy: MotionValue<number>;
  r: MotionValue<number>;
  opacity: MotionValue<number>;
};

type Snapshot = { sx: number; sy: number; r: number; opacity: number };

const identity = () => Array.from({ length: DOT_COUNT }, (_, i) => i);

const sortByZ = (proj: Projected[]): number[] =>
  identity().sort((a, b) => proj[a].z - proj[b].z);

const orderEq = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Semi-implicit Euler step for a spring toward target = 1.
// Runs inside the rAF tick so it shares the exact same dt.
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

// ─── COMPONENT ───────────────────────────────────────────────────────────────

const DotIcon3D = ({
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
  const [spinning, setSpinning] = useState(false);
  const [paintOrder, setPaintOrder] = useState<number[]>(identity);
  const stateRef = useRef(state);
  stateRef.current = state;

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

  const rafRef = useRef<number | null>(null);
  const angleRef = useRef(0);
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
        const cfg = { ...SPRING, delay: i * STAGGER };
        ctrlsRef.current.push(animate(mv.cx, targets[i].sx, cfg));
        ctrlsRef.current.push(animate(mv.cy, targets[i].sy, cfg));
        ctrlsRef.current.push(animate(mv.r, targets[i].size / 2, cfg));
        ctrlsRef.current.push(animate(mv.opacity, opacities[i], cfg));
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

      // Per-dot blend springs, computed in-loop so they share the same dt.
      const blends = sources
        ? Array.from({ length: DOT_COUNT }, () => ({ val: 0, vel: 0 }))
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
          angleRef.current += (def.speed ?? 0.6) * dt;

          if (blends) {
            for (let i = 0; i < DOT_COUNT; i++) {
              const b = blends[i];
              if (b.val < 1 && elapsed >= i * STAGGER) {
                const next = stepBlend(b.val, b.vel, dt);
                b.val = next.val;
                b.vel = next.vel;
              }
            }
          }

          const proj = def.layout(angleRef.current).map(project);
          const opa = resolveOpacities(def.opacities, angleRef.current);

          proj.forEach((p, i) => {
            const tx = p.sx;
            const ty = p.sy;
            const tr = p.size / 2;
            const to = opa[i];

            if (sources && blends) {
              const b = blends[i].val;
              const s = sources[i];
              mvs[i].cx.set(lerp(s.sx, tx, b));
              mvs[i].cy.set(lerp(s.sy, ty, b));
              mvs[i].r.set(lerp(s.r, tr, b));
              mvs[i].opacity.set(lerp(s.opacity, to, b));
            } else {
              mvs[i].cx.set(tx);
              mvs[i].cy.set(ty);
              mvs[i].r.set(tr);
              mvs[i].opacity.set(to);
            }
          });

          const order = sortByZ(proj);
          setPaintOrder((prev) => (orderEq(prev, order) ? prev : order));
        }
        tRef.current = now;
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [mvs],
  );

  // ─── State transitions ────────────────────────────────────────────────────

  useEffect(() => {
    const def = STATES[state];

    stopLoop();
    stopAnims();
    angleRef.current = 0;

    if (def.animated) {
      const src: Snapshot[] = mvs.map((mv) => ({
        sx: mv.cx.get(),
        sy: mv.cy.get(),
        r: mv.r.get(),
        opacity: mv.opacity.get(),
      }));

      setSpinning(true);
      setPaintOrder(identity());
      startLoop(state, def, src);
    } else {
      setSpinning(false);
      setPaintOrder(identity());
      const proj = def.layout(0).map(project);
      const opa = resolveOpacities(def.opacities, 0);
      morphTo(proj, opa);
    }

    return () => {
      stopAnims();
      stopLoop();
    };
  }, [state, morphTo, startLoop, stopLoop, stopAnims, mvs]);

  useEffect(() => () => stopLoop(), [stopLoop]);

  // ─── Render ────────────────────────────────────────────────────────────────

  const order = spinning ? paintOrder : identity();

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

export default DotIcon3D;
