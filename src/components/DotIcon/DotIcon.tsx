import { useState, useRef, useEffect, useCallback } from "react";
import type { CSSProperties } from "react";
import {
  motion,
  AnimatePresence,
  animate,
  motionValue,
  type MotionValue,
} from "motion/react";

/*
 * ─── DOT OPACITY PATTERN ───
 * Each dot uses fill="currentColor" with a fixed opacity identity.
 * The parent controls color via CSS `color` prop or inheritance.
 *
 * Derived from the reference image (4×4 grid, row-major):
 *   Row 0: light, full, light, full
 *   Row 1: full,  full, full,  full
 *   Row 2: full,  full, light, light
 *   Row 3: full,  light, full, light
 */
const DOT_OPACITIES = [
  // Dormant reference image has 3 levels (row-major 4×4):
  // veryLight, full, mid, full
  // full,      mid,  full, mid
  // mid,       full, mid,  full
  // full,      mid,  full, veryLight
  0.12, 1, 0.45, 1, 1, 0.45, 1, 0.45, 0.45, 1, 0.45, 1, 1, 0.45, 1, 0.12,
];

const DOT_COUNT = 16;
const MIN_DOT_SIZE = 4;
const MAX_DOT_SIZE = 7;

/*
 * ─── SPHERE GEOMETRY ───
 * Pre-compute base Fibonacci sphere positions.
 * These get rotated around Y at runtime for the globe spin.
 */
type Point3D = { x: number; y: number; z: number };
type Dot = { x: number; y: number; size: number; z?: number };

const SPHERE_POINTS = (() => {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const pts: Point3D[] = [];
  for (let i = 0; i < DOT_COUNT; i++) {
    const yNorm = 1 - (i / (DOT_COUNT - 1)) * 2;
    const radiusAtY = Math.sqrt(1 - yNorm * yNorm);
    const theta = goldenAngle * i;
    pts.push({
      x: Math.cos(theta) * radiusAtY,
      y: yNorm,
      z: Math.sin(theta) * radiusAtY,
    });
  }
  return pts;
})();

const rotateY = (pt: Point3D, angle: number): Point3D => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: pt.x * cos + pt.z * sin,
    y: pt.y,
    z: -pt.x * sin + pt.z * cos,
  };
};

const projectDot = (pt3d: Point3D): Dot => {
  const spread = 28;
  const cx = 50;
  const cy = 50;
  const t = (pt3d.z + 1) / 2; // 0 = back, 1 = front
  return {
    x: cx + pt3d.x * spread,
    y: cy + pt3d.y * spread,
    z: pt3d.z,
    size: MIN_DOT_SIZE + t * (MAX_DOT_SIZE - MIN_DOT_SIZE),
  };
};

/*
 * ─── STATE DEFINITIONS ───
 *
 * Each state has:
 *   label     — display name
 *   layout(angle?) — returns [{ x, y, size, z? }] for all 16 dots
 *   animated  — if true, the component runs a rAF loop and passes
 *               a continuously incrementing angle to layout()
 *   speed     — radians/sec (only meaningful when animated: true)
 */

const dormantLayout = (): Dot[] => {
  const cols = 4;
  const spacing = 16;
  const offset = 20;
  return Array.from({ length: DOT_COUNT }, (_, i) => ({
    x: offset + (i % cols) * spacing,
    y: offset + Math.floor(i / cols) * spacing,
    size: 6,
  }));
};

const thinkingLayout = (angle = 0): Dot[] => {
  return SPHERE_POINTS.map((pt) => {
    const rotated = rotateY(pt, angle);
    return projectDot(rotated);
  });
};

type DormantState = {
  label: string;
  layout: () => Dot[];
  animated: false;
};
type AnimatedState = {
  label: string;
  layout: (angle?: number) => Dot[];
  animated: true;
  speed: number;
};
type StateDef = DormantState | AnimatedState;

type StateKey = "dormant" | "thinking";

const STATES: Record<StateKey, StateDef> = {
  dormant: {
    label: "Dormant",
    layout: dormantLayout,
    animated: false,
  },
  thinking: {
    label: "Thinking",
    layout: thinkingLayout,
    animated: true,
    speed: 0.6,
  },
  // Future:
  // listening: { label: "Listening", layout: listeningLayout, animated: false },
  // error:     { label: "Error",     layout: errorLayout,     animated: true, speed: 2 },
};

const STATE_KEYS = Object.keys(STATES) as StateKey[];

/*
 * ─── SPRING CONFIG (for state-transition morphs) ───
 */
const dotSpring = {
  type: "spring" as const,
  stiffness: 120,
  damping: 18,
  mass: 0.8,
};
const staggerDelay = 0.025;

type DotMotion = {
  cx: MotionValue<number>;
  cy: MotionValue<number>;
  r: MotionValue<number>;
};

const identityOrder = () =>
  Array.from({ length: DOT_COUNT }, (_, i) => i);

const sortIndicesByZ = (layout: Dot[]): number[] =>
  identityOrder().sort((a, b) => (layout[a].z ?? 0) - (layout[b].z ?? 0));

const sameOrder = (a: number[], b: number[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

/*
 * ─── COMPONENT ───
 */
export default function DotIcon({
  size = 200,
  initialState = "dormant",
  color,
  style,
}: {
  size?: number;
  initialState?: StateKey;
  color?: string;
  style?: CSSProperties;
}) {
  const [activeState, setActiveState] = useState<StateKey>(initialState);
  const stateDef = (STATES[activeState] ?? STATES.dormant) as StateDef;

  /** True only while the rAF globe loop is running (not during morph into thinking). */
  const [isSpinning, setIsSpinning] = useState(false);
  /** Z-order for SVG paint order while spinning; identity order otherwise. */
  const [spinOrder, setSpinOrder] = useState<number[]>(identityOrder);

  const activeStateRef = useRef(activeState);
  activeStateRef.current = activeState;

  const dotMotionsRef = useRef<DotMotion[] | null>(null);
  const ensureDotMotions = (): DotMotion[] => {
    if (!dotMotionsRef.current) {
      const initialDots = STATES[initialState].animated
        ? thinkingLayout(0)
        : dormantLayout();
      dotMotionsRef.current = initialDots.map((d) => ({
        cx: motionValue(d.x),
        cy: motionValue(d.y),
        r: motionValue(d.size / 2),
      }));
    }
    return dotMotionsRef.current;
  };
  const dotMotions = ensureDotMotions();

  const rafRef = useRef<number | null>(null);
  const angleRef = useRef(0);
  const prevTimeRef = useRef<number | null>(null);
  const animatedLayoutRef = useRef<((angle?: number) => Dot[]) | null>(null);
  const animatedSpeedRef = useRef<number>(0.6);
  const runningAnimControlsRef = useRef<Array<{ stop: () => void }>>([]);

  const stopAllMorphAnimations = useCallback(() => {
    runningAnimControlsRef.current.forEach((c) => c.stop());
    runningAnimControlsRef.current = [];
  }, []);

  const trackAnim = useCallback((control: { stop: () => void }) => {
    runningAnimControlsRef.current.push(control);
  }, []);

  const morphToLayout = useCallback(
    (
      targets: Dot[],
      onLastDotComplete?: () => void,
    ) => {
      stopAllMorphAnimations();
      dotMotions.forEach((d, i) => {
        const base = {
          ...dotSpring,
          delay: i * staggerDelay,
        };
        const onLast =
          i === DOT_COUNT - 1 && onLastDotComplete
            ? { ...base, onComplete: onLastDotComplete }
            : base;
        trackAnim(animate(d.cx, targets[i].x, base));
        trackAnim(animate(d.cy, targets[i].y, base));
        trackAnim(animate(d.r, targets[i].size / 2, onLast));
      });
    },
    [dotMotions, stopAllMorphAnimations, trackAnim],
  );

  const startLoop = useCallback(() => {
    if (rafRef.current) return;
    prevTimeRef.current = null;
    const loop = () => {
      if (
        activeStateRef.current !== "thinking" ||
        !animatedLayoutRef.current
      ) {
        rafRef.current = null;
        prevTimeRef.current = null;
        return;
      }
      const now = performance.now();
      if (prevTimeRef.current !== null) {
        const dt = (now - prevTimeRef.current) / 1000;
        angleRef.current += animatedSpeedRef.current * dt;
        const layout = animatedLayoutRef.current(angleRef.current);
        layout.forEach((pt, i) => {
          dotMotions[i].cx.set(pt.x);
          dotMotions[i].cy.set(pt.y);
          dotMotions[i].r.set(pt.size / 2);
        });
        const nextOrder = sortIndicesByZ(layout);
        setSpinOrder((prev) =>
          sameOrder(prev, nextOrder) ? prev : nextOrder,
        );
      }
      prevTimeRef.current = now;
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [dotMotions]);

  const stopLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      prevTimeRef.current = null;
    }
  }, []);

  useEffect(() => {
    const def = STATES[activeState] ?? STATES.dormant;

    if (def.animated) {
      animatedLayoutRef.current = def.layout;
      animatedSpeedRef.current = def.speed;

      setIsSpinning(false);
      setSpinOrder(identityOrder());
      stopLoop();

      angleRef.current = 0;
      const targets = def.layout(0);

      morphToLayout(targets, () => {
        if (activeStateRef.current !== "thinking") return;
        setSpinOrder(sortIndicesByZ(targets));
        setIsSpinning(true);
        startLoop();
      });

      return () => {
        stopAllMorphAnimations();
        stopLoop();
      };
    }

    animatedLayoutRef.current = null;
    setIsSpinning(false);
    setSpinOrder(identityOrder());
    stopLoop();

    const targets = def.layout();
    morphToLayout(targets);

    return () => {
      stopAllMorphAnimations();
      stopLoop();
    };
  }, [
    activeState,
    morphToLayout,
    startLoop,
    stopLoop,
    stopAllMorphAnimations,
  ]);

  useEffect(() => () => stopLoop(), [stopLoop]);

  const viewSize = 100;

  const displayOrder = isSpinning ? spinOrder : identityOrder();

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
        viewBox={`0 0 ${viewSize} ${viewSize}`}
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: "visible" }}
      >
        {displayOrder.map((i) => (
          <motion.circle
            key={i}
            cx={dotMotions[i].cx}
            cy={dotMotions[i].cy}
            r={dotMotions[i].r}
            fill="currentColor"
            fillOpacity={DOT_OPACITIES[i]}
          />
        ))}
      </svg>

      {/* State label */}
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
          {stateDef.label}
        </motion.div>
      </AnimatePresence>

      {/* State switcher */}
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
}
