import { useState, useRef, useEffect, useCallback } from "react";
import type { CSSProperties } from "react";
import {
  motion,
  AnimatePresence,
  animate,
  motionValue,
  type MotionValue,
} from "motion/react";

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

type StateKey = "dormant" | "thinking";

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
    speed: 0.6,
  },
};

const STATE_KEYS = Object.keys(STATES) as StateKey[];

// ─── SPRING CONFIG ───────────────────────────────────────────────────────────

const SPRING = {
  type: "spring" as const,
  stiffness: 120,
  damping: 18,
  mass: 0.8,
};
const STAGGER = 0.025;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

type DotMV = {
  cx: MotionValue<number>;
  cy: MotionValue<number>;
  r: MotionValue<number>;
  opacity: MotionValue<number>;
};

const identity = () => Array.from({ length: DOT_COUNT }, (_, i) => i);

const sortByZ = (proj: Projected[]): number[] =>
  identity().sort((a, b) => proj[a].z - proj[b].z);

const orderEq = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

// ─── COMPONENT ───────────────────────────────────────────────────────────────

const DotIcon3D = ({
  size = 200,
  initialState = "dormant" as StateKey,
  color,
  style,
}: {
  size?: number;
  initialState?: StateKey;
  color?: string;
  style?: CSSProperties;
}) => {
  const [activeState, setActiveState] = useState<StateKey>(initialState);
  const [spinning, setSpinning] = useState(false);
  const [paintOrder, setPaintOrder] = useState<number[]>(identity);
  const stateRef = useRef(activeState);
  stateRef.current = activeState;

  const mvsRef = useRef<DotMV[] | null>(null);
  if (!mvsRef.current) {
    const def = STATES[initialState];
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

  const stopMorphs = useCallback(() => {
    ctrlsRef.current.forEach((c) => c.stop());
    ctrlsRef.current = [];
  }, []);

  const morphTo = useCallback(
    (targets: Projected[], opacities: number[], onDone?: () => void) => {
      stopMorphs();
      mvs.forEach((mv, i) => {
        const cfg = { ...SPRING, delay: i * STAGGER };
        const last =
          i === DOT_COUNT - 1 && onDone ? { ...cfg, onComplete: onDone } : cfg;
        ctrlsRef.current.push(animate(mv.cx, targets[i].sx, cfg));
        ctrlsRef.current.push(animate(mv.cy, targets[i].sy, cfg));
        ctrlsRef.current.push(animate(mv.r, targets[i].size / 2, cfg));
        ctrlsRef.current.push(animate(mv.opacity, opacities[i], last));
      });
    },
    [mvs, stopMorphs],
  );

  const stopLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      tRef.current = null;
    }
  }, []);

  const startLoop = useCallback(
    (key: StateKey, def: StateDef) => {
      if (rafRef.current) return;
      tRef.current = null;

      const tick = () => {
        if (stateRef.current !== key) {
          rafRef.current = null;
          return;
        }
        const now = performance.now();
        if (tRef.current !== null) {
          angleRef.current +=
            (def.speed ?? 0.6) * ((now - tRef.current) / 1000);
          const proj = def.layout(angleRef.current).map(project);
          const opa = resolveOpacities(def.opacities, angleRef.current);

          proj.forEach((p, i) => {
            mvs[i].cx.set(p.sx);
            mvs[i].cy.set(p.sy);
            mvs[i].r.set(p.size / 2);
            mvs[i].opacity.set(opa[i]);
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
    const def = STATES[activeState];

    stopLoop();
    setSpinning(false);
    setPaintOrder(identity());
    angleRef.current = 0;

    const proj = def.layout(0).map(project);
    const opa = resolveOpacities(def.opacities, 0);

    if (def.animated) {
      morphTo(proj, opa, () => {
        if (stateRef.current !== activeState) return;
        setPaintOrder(sortByZ(proj));
        setSpinning(true);
        startLoop(activeState, def);
      });
    } else {
      morphTo(proj, opa);
    }

    return () => {
      stopMorphs();
      stopLoop();
    };
  }, [activeState, morphTo, startLoop, stopLoop, stopMorphs]);

  useEffect(() => () => stopLoop(), [stopLoop]);

  // ─── Render ────────────────────────────────────────────────────────────────

  const order = spinning ? paintOrder : identity();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 32,
        fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
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

      <AnimatePresence mode="wait">
        <motion.div
          key={activeState}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          style={{
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            opacity: 0.45,
            userSelect: "none",
          }}
        >
          {STATES[activeState].label}
        </motion.div>
      </AnimatePresence>

      <div style={{ display: "flex", gap: 8 }}>
        {STATE_KEYS.map((key) => {
          const active = activeState === key;
          return (
            <button
              key={key}
              onClick={() => setActiveState(key)}
              style={{
                padding: "6px 14px",
                fontSize: 11,
                fontFamily: "inherit",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                border: "1px solid",
                borderColor: active ? "currentColor" : "rgba(128,128,128,0.3)",
                background: active ? "currentColor" : "transparent",
                borderRadius: 4,
                cursor: "pointer",
                transition: "all 0.15s ease",
                color: "inherit",
              }}
            >
              <span
                style={{
                  mixBlendMode: active ? "difference" : "normal",
                  color: active ? "#fff" : "inherit",
                  opacity: active ? 1 : 0.5,
                }}
              >
                {STATES[key].label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default DotIcon3D;
