import { isDevStateEnabled } from "#/env";
import {
  type Vec3,
  type GridConfig,
  buildGridConfig,
  gridBaseZ,
  rotateX,
  rotateY,
  lerp,
  clamp,
  quantizeFloat,
} from "./math";

// ─── Dormant patterns ───────────────────────────────────────────────────────────
// 7×7 master is the canonical reference. Other grids downsample via nearest-
// neighbour; 3×3 and 4×4 have hand-crafted overrides for full designer control.

const DORMANT_MASTER_N = 7;
// prettier-ignore
const DORMANT_MASTER: readonly number[] = [
  0.00, 1.00, 1.00, 0.00, 1.00, 1.00, 1.00,
  1.00, 0.45, 1.00, 1.00, 0.00, 1.00, 1.00,
  1.00, 1.00, 0.45, 1.00, 1.00, 0.00, 1.00,
  0.00, 1.00, 1.00, 0.45, 1.00, 1.00, 0.00,
  1.00, 0.00, 1.00, 1.00, 0.45, 1.00, 1.00,
  1.00, 1.00, 0.00, 1.00, 1.00, 0.45, 1.00,
  1.00, 1.00, 1.00, 0.00, 1.00, 1.00, 0.00,
];

// Grid=3 renders internally as 4×4, so arrays hold 16 values.
// prettier-ignore
const DORMANT_3x3_OPACITIES: readonly number[] = [
  0, 1, 0, 1,
  1, 0, 1, 0,
  0, 1, 0, 1,
  1, 0, 1, 0,
];
// prettier-ignore
const DORMANT_3x3_Z: readonly number[] = [
  1, 3, 1, 3,
  3, 1, 4, 1,
  1, 4, 1, 3,
  3, 1, 3, 1,
];

// prettier-ignore
const DORMANT_4x4_OPACITIES: readonly number[] = [
  0.12, 1,    0.12, 1,
  1,    0.45, 1,    0.12,
  0.12, 1,    0.45, 1,
  1,    0.12, 1,    0.12,
];
// prettier-ignore
const DORMANT_4x4_Z: readonly number[] = [
  1, 2, 2, 2,
  2, 2, 3, 2,
  2, 3, 2, 2,
  2, 2, 2, 1,
];

const buildDormantOpacities = (n: number): number[] => {
  if (n === 3) return [...DORMANT_3x3_OPACITIES];
  if (n === 4) return [...DORMANT_4x4_OPACITIES];
  if (n === DORMANT_MASTER_N) return [...DORMANT_MASTER];
  const span = DORMANT_MASTER_N - 1;
  return Array.from({ length: n * n }, (_, idx) => {
    const col = idx % n;
    const row = Math.floor(idx / n);
    const srcCol = n === 1 ? 0 : Math.round((col / (n - 1)) * span);
    const srcRow = n === 1 ? 0 : Math.round((row / (n - 1)) * span);
    return DORMANT_MASTER[srcRow * DORMANT_MASTER_N + srcCol];
  });
};

// ─── Success patterns ───────────────────────────────────────────────────────────
// Same tier model as dormant: 7×7 masters drive NN downsampling (e.g. 5×5, 6×6);
// grid=3 uses an internal 4×4 projection, so 3×3-tier arrays hold 16 values.

const SUCCESS_MASTER_N = 7;

/** Nearest-neighbour resample from a 7×7 master onto an n×n grid (edges align). */
const sample7x7Master = <T>(n: number, master: readonly T[]): T[] => {
  if (n === SUCCESS_MASTER_N) return [...master];
  const span = SUCCESS_MASTER_N - 1;
  return Array.from({ length: n * n }, (_, idx) => {
    const col = idx % n;
    const row = Math.floor(idx / n);
    const srcCol = n === 1 ? 0 : Math.round((col / (n - 1)) * span);
    const srcRow = n === 1 ? 0 : Math.round((row / (n - 1)) * span);
    return master[srcRow * SUCCESS_MASTER_N + srcCol]!;
  });
};

// prettier-ignore
const SUCCESS_7x7_OPACITIES: readonly number[] = [
  0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12,
  0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 1.00,
  0.12, 0.12, 0.12, 0.12, 0.12, 1.00, 0.12,
  1.00, 0.12, 0.12, 0.12, 1.00, 0.12, 0.12,
  0.12, 1.00, 0.12, 1.00, 0.12, 0.12, 0.12,
  0.12, 0.12, 1.00, 0.12, 0.12, 0.12, 0.12,
  0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12,
];
// prettier-ignore
const SUCCESS_7x7_Z: readonly number[] = [
  0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 1, 0,
  0, 0, 0, 0, 1, 0, 0,
  0, 1, 0, 1, 0, 0, 0,
  0, 0, 1, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0,
];

// Grid=3 renders internally as 4×4 — arrays hold 16 values.
// prettier-ignore
const SUCCESS_3x3_OPACITIES: readonly number[] = [
  0.00, 0.00, 0.00, 1.00,
  1.00, 0.00, 1.00, 0.00,
  0.00, 1.00, 0.00, 0.00,
  0.00, 0.00, 0.00, 0.00,
];
// prettier-ignore
const SUCCESS_3x3_Z: readonly number[] = [
  0, 0, 0, 4,
  4, 0, 4, 0,
  0, 4, 0, 0,
  0, 0, 0, 0,
];

// prettier-ignore
const SUCCESS_4x4_OPACITIES: readonly number[] = [
  0.12, 0.12, 0.12, 1.00,
  1.00, 0.12, 1.00, 0.12,
  0.12, 1.00, 0.12, 0.12,
  0.12, 0.12, 0.12, 0.12,
];
// prettier-ignore
const SUCCESS_4x4_Z: readonly number[] = [
  2, 2, 2, 3,
  3, 2, 3, 2,
  2, 3, 2, 2,
  2, 2, 2, 2,
];

const buildSuccessOpacities = (n: number): number[] => {
  if (n === 3) return [...SUCCESS_3x3_OPACITIES];
  if (n === 4) return [...SUCCESS_4x4_OPACITIES];
  if (n === SUCCESS_MASTER_N) return [...SUCCESS_7x7_OPACITIES];
  return sample7x7Master(n, SUCCESS_7x7_OPACITIES);
};

const buildSuccessZ = (n: number): readonly number[] => {
  if (n === 3) return SUCCESS_3x3_Z;
  if (n === 4) return SUCCESS_4x4_Z;
  if (n === SUCCESS_MASTER_N) return SUCCESS_7x7_Z;
  return sample7x7Master(n, SUCCESS_7x7_Z);
};

// ─── State types ────────────────────────────────────────────────────────────────

const STATE_META = {
  dormant: {
    label: "Dormant",
    usage: "Static logotype-style mark, use for idle, or “ready” surfaces.",
  },
  hover: {
    label: "Hover",
    usage:
      "Animated accent on the dormant layout, use for interactive hover feedback.",
  },
  thinking: {
    label: "Thinking",
    usage:
      "Sphere motion, use for open-ended work or “assistant is considering.”",
  },
  processing: {
    label: "Processing",
    usage:
      "Rotating cube-style motion, use for sustained work or “running in the background.”",
  },
  loading: {
    label: "Loading",
    usage: "Column fill sweep, use for determinate or indeterminate progress.",
  },
  success: {
    label: "Success",
    usage: "Static success pattern, use when an action completed successfully.",
  },
  error: {
    label: "Error",
    usage:
      "Animated error read, use for failures, blocked actions, or validation errors.",
  },
  indexing: {
    label: "Indexing",
    usage:
      "Randomized scanning sequence, use while indexing, searching, or ingesting files.",
  },
  ping: {
    label: "Ping",
    usage:
      "One-shot ripple outward from center, use to attract attention or signal a notification.",
  },
  dev: {
    label: "Dev",
    usage: "Flat diagnostic grid for layout checks.",
  },
} as const;

export type StateKey = keyof typeof STATE_META;

type OpacitySolveCtx = { layoutAngle: number; opacityAngle: number };
type Opacities = number[] | ((ctx: OpacitySolveCtx) => number[]);

export type StateDef = {
  label: string;
  layout: (angle?: number) => Vec3[];
  opacities: Opacities;
  animated: boolean;
  projConfig: GridConfig;
  layoutSpeed?: number;
  opacitySpeed?: number;
  /** Seconds after which the animation freezes (one-shot states). */
  sequenceDuration?: number;
};

export const resolveOpacities = (
  o: Opacities,
  ctx: OpacitySolveCtx,
): number[] => (typeof o === "function" ? o(ctx) : o);

const mulberry32 = (seed: number): (() => number) => {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ─── Layout helpers ─────────────────────────────────────────────────────────────

// Flat n×n grid.  zOverride gives per-dot Z; null falls back to gridBaseZ.
const flatGrid = (
  config: GridConfig,
  zOverride: readonly number[] | null,
): Vec3[] => {
  const baseZ = gridBaseZ(config);
  return Array.from({ length: config.dotCount }, (_, i) => ({
    x: i % config.n,
    y: Math.floor(i / config.n),
    z: zOverride ? zOverride[i]! : baseZ,
  }));
};

// Fibonacci sphere for the thinking state.
const buildSphereBase = (config: GridConfig): Vec3[] => {
  const { dotCount } = config;
  const phi = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: dotCount }, (_, i) => {
    const y = dotCount <= 1 ? 0 : (i / (dotCount - 1)) * 2 - 1;
    const r = Math.sqrt(1 - y * y);
    const theta = phi * i;
    return { x: Math.cos(theta) * r, y, z: Math.sin(theta) * r };
  });
};

const THINKING_OVERSHOOT = 1.1;

const thinkingLayout = (
  config: GridConfig,
  sphere: Vec3[],
  angle = 0,
): Vec3[] => {
  const baseZ = gridBaseZ(config);
  return sphere.map((pt) => {
    const r = rotateY(pt, angle);
    return {
      x: config.grid.center + r.x * config.grid.center * THINKING_OVERSHOOT,
      y: config.grid.center + r.y * config.grid.center * THINKING_OVERSHOOT,
      z: baseZ * (0.5 + 0.6 * r.z),
    };
  });
};

const thinkingOpacities = (
  config: GridConfig,
  sphere: Vec3[],
  layoutAngle: number,
  opacityAngle: number,
): number[] =>
  Array.from({ length: config.dotCount }, (_, i) => {
    const r = rotateY(sphere[i]!, layoutAngle);
    const depth = (r.z + 1) / 1.5;
    const u = (i / config.dotCount + 0.5) % 1;
    const wave =
      0.12 + 0.88 * (0.5 + 0.5 * Math.sin(2 * Math.PI * u + opacityAngle));
    return clamp(wave * depth, 0, 1);
  });

// Processing: 8 cube vertices first, then the same interior grid count on
// every face (uneven remainder skipped for the balanced pass). Extra dots use
// unique surface positions (edge midpoints, then denser face grids) — no two
// dots share the same quantized XYZ. Rotation is sequential — one axis ramps
// π/2, hold, other axis ramps π/2, hold — in layoutAngle space (no blend).
const CUBE_CORNERS: readonly Vec3[] = [
  { x: -1, y: -1, z: -1 },
  { x: 1, y: -1, z: -1 },
  { x: -1, y: 1, z: -1 },
  { x: 1, y: 1, z: -1 },
  { x: -1, y: -1, z: 1 },
  { x: 1, y: -1, z: 1 },
  { x: -1, y: 1, z: 1 },
  { x: 1, y: 1, z: 1 },
];

// (u,v) in open square (-1,1)² → 3D on each face; interior-only so dots are
// unique across faces.
const PROCESSING_FACE_MAP: readonly ((u: number, v: number) => Vec3)[] = [
  (u, v) => ({ x: u, y: v, z: 1 }),
  (u, v) => ({ x: u, y: v, z: -1 }),
  (u, v) => ({ x: 1, y: u, z: v }),
  (u, v) => ({ x: -1, y: u, z: v }),
  (u, v) => ({ x: u, y: 1, z: v }),
  (u, v) => ({ x: u, y: -1, z: v }),
];

// Midpoints of the 12 edges (exactly one coordinate 0, two are ±1). They do
// not lie in the open face interiors used by interiorFaceGrid2D.
// prettier-ignore
const CUBE_EDGE_MIDPOINTS: readonly Vec3[] = [
  { x: 0, y: -1, z: -1 }, { x: 0, y: -1, z: 1 }, { x: 0, y: 1, z: -1 }, { x: 0, y: 1, z: 1 },
  { x: -1, y: 0, z: -1 }, { x: -1, y: 0, z: 1 }, { x: 1, y: 0, z: -1 }, { x: 1, y: 0, z: 1 },
  { x: -1, y: -1, z: 0 }, { x: -1, y: 1, z: 0 }, { x: 1, y: -1, z: 0 }, { x: 1, y: 1, z: 0 },
];

const processingVecKey = (p: Vec3): string =>
  `${quantizeFloat(p.x)},${quantizeFloat(p.y)},${quantizeFloat(p.z)}`;

/** Evenly spaced grid strictly inside (-1,1)², row-major. */
const interiorFaceGrid2D = (count: number): { u: number; v: number }[] => {
  if (count <= 0) return [];
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / cols);
  const out: { u: number; v: number }[] = [];
  for (let r = 0; r < rows && out.length < count; r++) {
    for (let c = 0; c < cols && out.length < count; c++) {
      const u = -1 + (2 * (c + 1)) / (cols + 1);
      const v = -1 + (2 * (r + 1)) / (rows + 1);
      out.push({ u, v });
    }
  }
  return out;
};

const buildProcessingCubeBase = (dotCount: number): Vec3[] => {
  const out: Vec3[] = [];
  const used = new Set<string>();

  const tryPush = (p: Vec3): boolean => {
    const key = processingVecKey(p);
    if (used.has(key)) return false;
    used.add(key);
    out.push(p);
    return true;
  };

  const nCorner = Math.min(8, dotCount);
  for (let i = 0; i < nCorner; i++) tryPush(CUBE_CORNERS[i]!);
  if (out.length >= dotCount) return out;

  const remaining = dotCount - 8;
  const k = Math.floor(remaining / 6);
  for (let f = 0; f < 6; f++) {
    const map = PROCESSING_FACE_MAP[f]!;
    for (const { u, v } of interiorFaceGrid2D(k)) {
      tryPush(map(u, v));
    }
  }

  for (const p of CUBE_EDGE_MIDPOINTS) {
    if (out.length >= dotCount) break;
    tryPush(p);
  }

  let denom = 2;
  while (out.length < dotCount && denom < 512) {
    for (let f = 0; f < 6 && out.length < dotCount; f++) {
      const map = PROCESSING_FACE_MAP[f]!;
      for (let r = 1; r <= denom && out.length < dotCount; r++) {
        for (let c = 1; c <= denom && out.length < dotCount; c++) {
          const u = -1 + (2 * c) / (denom + 1);
          const v = -1 + (2 * r) / (denom + 1);
          tryPush(map(u, v));
        }
      }
    }
    denom++;
  }

  return out;
};

const PROCESSING_SPIN = (() => {
  const rng = mulberry32(0x50_41_54_43);
  return {
    signX: rng() < 0.5 ? -1 : 1,
    signY: rng() < 0.5 ? -1 : 1,
    firstAxisIsX: rng() < 0.5,
  };
})();

/** Radians of layoutAngle for one axis ramp 0 → π/2 (linear). */
const PROCESSING_SPIN_PHASE = 1.0;
/** layoutAngle spent holding between ramps. */
const PROCESSING_PAUSE_PHASE = 0.3;
const PROCESSING_STEP = Math.PI / 2;

const processingAxisAngles = (
  layoutAngle: number,
): { ax: number; ay: number } => {
  const S = PROCESSING_SPIN_PHASE;
  const P = PROCESSING_PAUSE_PHASE;
  const T = 2 * (S + P);
  const step = PROCESSING_STEP;
  const sx = PROCESSING_SPIN.signX;
  const sy = PROCESSING_SPIN.signY;
  const xFirst = PROCESSING_SPIN.firstAxisIsX;

  const cycles = Math.floor(layoutAngle / T);
  const p = layoutAngle - cycles * T;

  let dax = 0;
  let day = 0;
  if (xFirst) {
    if (p < S) dax = sx * step * (p / S);
    else if (p < S + P) dax = sx * step;
    else if (p < 2 * S + P) {
      dax = sx * step;
      day = sy * step * ((p - S - P) / S);
    } else {
      dax = sx * step;
      day = sy * step;
    }
  } else {
    if (p < S) day = sy * step * (p / S);
    else if (p < S + P) day = sy * step;
    else if (p < 2 * S + P) {
      dax = sx * step * ((p - S - P) / S);
      day = sy * step;
    } else {
      dax = sx * step;
      day = sy * step;
    }
  }

  return {
    ax: cycles * sx * step + dax,
    ay: cycles * sy * step + day,
  };
};

const rotateProcessing = (p: Vec3, layoutAngle: number): Vec3 => {
  const { ax, ay } = processingAxisAngles(layoutAngle);
  return rotateY(rotateX(p, ax), ay);
};

const processingLayout = (
  config: GridConfig,
  cube: Vec3[],
  layoutAngle = 0,
): Vec3[] => {
  const baseZ = gridBaseZ(config);
  return cube.map((pt) => {
    const r = rotateProcessing(pt, layoutAngle);
    return {
      x: config.grid.center + r.x * config.grid.center * 0.85,
      y: config.grid.center + r.y * config.grid.center * 0.85,
      z: baseZ * (0.5 + 0.6 * r.z),
    };
  });
};

const processingOpacities = (
  config: GridConfig,
  cube: Vec3[],
  layoutAngle: number,
  opacityAngle: number,
): number[] =>
  Array.from({ length: config.dotCount }, (_, i) => {
    const r = rotateProcessing(cube[i]!, layoutAngle);
    const depth = (r.z + 1) / 1.5;
    const u = (i / config.dotCount + 0.5) % 1;
    const wave =
      0.12 + 0.88 * (0.5 + 0.5 * Math.sin(2 * Math.PI * u + opacityAngle));
    return clamp(wave * depth, 0, 1);
  });

// Loading: column-major fill order + trail.
const LOADING_PAUSE = 3;

const buildLoadingRanks = (config: GridConfig): number[] => {
  const { n, dotCount } = config;
  const ranks = new Array<number>(dotCount);
  let rank = 0;
  for (let x = 0; x < n; x++)
    for (let y = n - 1; y >= 0; y--) ranks[y * n + x] = rank++;
  return ranks;
};

const loadingAge = (angle: number, rank: number, cycle: number): number =>
  angle < rank ? Infinity : (angle - rank) % cycle;

const loadingLayout = (
  config: GridConfig,
  ranks: number[],
  angle = 0,
): Vec3[] => {
  const baseZ = gridBaseZ(config);
  const trailZ = Math.max(0, baseZ - 2);
  const cycle = config.dotCount + LOADING_PAUSE;
  const trail = config.dotCount - 1;
  return Array.from({ length: config.dotCount }, (_, i) => {
    const t = Math.min(loadingAge(angle, ranks[i], cycle) / trail, 1);
    return {
      x: i % config.n,
      y: Math.floor(i / config.n),
      z: lerp(baseZ, trailZ, t),
    };
  });
};

const loadingOpacities = (
  config: GridConfig,
  ranks: number[],
  angle: number,
): number[] => {
  const cycle = config.dotCount + LOADING_PAUSE;
  const trail = config.dotCount - 1;
  return Array.from({ length: config.dotCount }, (_, i) => {
    const age = loadingAge(angle, ranks[i], cycle);
    if (age >= config.dotCount) return 0.12;
    return lerp(1, 0.12, Math.min(age / trail, 1));
  });
};

// Hover: a sine pulse travels an invisible S-path (mirrored Z with serifs)
// through the grid. Each dot's rank is its nearest-point arc-length along the
// polyline, normalized to [0,1]. Works uniformly for any grid size.
const HOVER_SPEED = 0.7;
const HOVER_PULSE_WIDTH = 0.8;
const HOVER_NUM_WAVES = 1;

// mirrored Z-path waypoints in normalized [0,1] space.
// prettier-ignore
const HOVER_PATH: { x: number; y: number }[] = [
  { x: 1.5, y: 0 } ,  // idle
  { x: 1, y: 0 },  // top-right
  { x: 0, y: 0 },  // top-left      (←)
  { x: 1, y: 1 },  // bottom-right  (↘ spine)
  { x: 0, y: 1 },  // bottom-left   (←)
];

const buildHoverRanks = (n: number): number[] => {
  const max = n - 1;
  const pts = HOVER_PATH.map((p) => ({ x: p.x * max, y: p.y * max }));

  const segLens: number[] = [];
  let totalLen = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    segLens.push(len);
    totalLen += len;
  }

  return Array.from({ length: n * n }, (_, idx) => {
    const dotX = idx % n;
    const dotY = Math.floor(idx / n);

    let bestDist = Infinity;
    let bestArc = 0;
    let cumLen = 0;

    for (let s = 0; s < segLens.length; s++) {
      const ax = pts[s].x,
        ay = pts[s].y;
      const dx = pts[s + 1].x - ax,
        dy = pts[s + 1].y - ay;
      const len = segLens[s];
      const t =
        len > 0
          ? clamp(((dotX - ax) * dx + (dotY - ay) * dy) / (len * len), 0, 1)
          : 0;

      const px = ax + t * dx;
      const py = ay + t * dy;
      const dist = Math.sqrt((dotX - px) ** 2 + (dotY - py) ** 2);

      if (dist < bestDist) {
        bestDist = dist;
        bestArc = cumLen + t * len;
      }
      cumLen += len;
    }

    return totalLen > 0 ? bestArc / totalLen : 0;
  });
};

const hoverPulse = (phase: number, rank: number): number => {
  let best = 0;
  for (let w = 0; w < HOVER_NUM_WAVES; w++) {
    const t = (((phase + w / HOVER_NUM_WAVES - rank) % 1) + 1) % 1;
    if (t < HOVER_PULSE_WIDTH) {
      best = Math.max(best, Math.sin((t / HOVER_PULSE_WIDTH) * Math.PI));
    }
  }
  return best;
};

const hoverLayout = (
  proj: GridConfig,
  ranks: number[],
  baseZ: readonly number[],
  angle = 0,
): Vec3[] => {
  const phase = ((angle % 1) + 1) % 1;
  return Array.from({ length: proj.dotCount }, (_, i) => {
    const x = i % proj.n;
    const y = Math.floor(i / proj.n);
    const bz = baseZ[i]!;
    const p = hoverPulse(phase, ranks[i]!);
    return { x, y, z: lerp(bz, Math.max(0, bz - 2), p) };
  });
};

const hoverOpacities = (
  proj: GridConfig,
  ranks: number[],
  baseOpa: readonly number[],
  angle: number,
): number[] => {
  const phase = ((angle % 1) + 1) % 1;
  return Array.from({ length: proj.dotCount }, (_, i) => {
    const base = baseOpa[i]!;
    if (base === 0) return 0;
    const p = hoverPulse(phase, ranks[i]!);
    return lerp(base, 0.12, p);
  });
};

// ─── Indexing ───────────────────────────────────────────────────────────────────
// Random dots converge toward a centre cluster over one cycle, driven purely by
// opacity.  The sequence is precomputed with a seeded PRNG so there is zero
// runtime randomness cost.

const INDEXING_TICKS = 32; //32
const INDEXING_TRAIL = 4; //6
const INDEXING_PAUSE = 2; //8
const INDEXING_FOCUS = 6; //6
const INDEXING_SEED = 30; //5, 9, 30
const INDEXING_SPEED = 8;
const INDEXING_LATCH_TICKS = 5;

type IndexingSeq = { dotRanks: number[][]; latchRank: number[] };

const buildIndexingSequence = (config: GridConfig): IndexingSeq => {
  const { n, dotCount } = config;
  const center = (n - 1) / 2;
  const maxDist = center; // Chebyshev distance to corner
  const clusterSize = clamp(n - 2, 1, 3);
  const clusterHalf = (clusterSize - 1) / 2;
  const perTick = Math.max(1, Math.round(dotCount / 8));
  const rng = mulberry32(INDEXING_SEED + n * 137);

  // Normalised excess distance beyond cluster boundary [0, 1].
  // Cluster dots get 0 (always full weight); outer dots scale to 1.
  const outerRange = maxDist - clusterHalf;
  const excessDists: number[] = Array.from({ length: dotCount }, (_, i) => {
    const x = i % n;
    const y = Math.floor(i / n);
    const d = Math.max(Math.abs(x - center), Math.abs(y - center));
    return outerRange > 0 ? clamp((d - clusterHalf) / outerRange, 0, 1) : 0;
  });

  const dotRanks: number[][] = Array.from({ length: dotCount }, () => []);
  const latchRank = new Array(dotCount).fill(Infinity);

  for (let tick = 0; tick < INDEXING_TICKS; tick++) {
    const progress = tick / (INDEXING_TICKS - 1);
    const weights = excessDists.map((ed) =>
      Math.exp(-ed * progress * INDEXING_FOCUS),
    );

    // Weighted sampling without replacement
    const count = Math.min(perTick, dotCount);
    const w = [...weights];
    const picked: number[] = [];
    for (let j = 0; j < count; j++) {
      let total = 0;
      for (let k = 0; k < dotCount; k++) total += w[k];
      if (total <= 0) break;
      let r = rng() * total;
      let idx = 0;
      for (let k = 0; k < dotCount; k++) {
        r -= w[k];
        if (r <= 0) {
          idx = k;
          break;
        }
      }
      picked.push(idx);
      w[idx] = 0;
    }

    // Spread activations across the tick for continuous flow
    for (let j = 0; j < picked.length; j++) {
      const rank = tick + j / picked.length;
      dotRanks[picked[j]].push(rank);
      if (excessDists[picked[j]] === 0 && latchRank[picked[j]] === Infinity) {
        latchRank[picked[j]] = rank;
      }
    }
  }

  return { dotRanks, latchRank };
};

const indexingLayout = (
  config: GridConfig,
  seq: IndexingSeq,
  angle = 0,
): Vec3[] => {
  const baseZ = gridBaseZ(config);
  const smallZ = Math.max(0, baseZ - 1);
  const total = INDEXING_TICKS + INDEXING_PAUSE;
  const raw = ((angle % total) + total) % total;
  // Freeze Z growth at the end of the active phase so late-latching dots
  // stay partially grown during the pause ("ran out of time" effect).
  const growEnd = Math.min(raw, INDEXING_TICKS);

  return Array.from({ length: config.dotCount }, (_, i) => {
    const latch = seq.latchRank[i];
    const t =
      growEnd >= latch
        ? clamp((growEnd - latch) / INDEXING_LATCH_TICKS, 0, 1)
        : 0;
    return {
      x: i % config.n,
      y: Math.floor(i / config.n),
      z: lerp(smallZ, baseZ, t),
    };
  });
};

const indexingOpacities = (
  config: GridConfig,
  seq: IndexingSeq,
  angle: number,
): number[] => {
  const total = INDEXING_TICKS + INDEXING_PAUSE;
  const raw = ((angle % total) + total) % total;
  const growEnd = Math.min(raw, INDEXING_TICKS);
  const out = new Array(config.dotCount).fill(0.12);

  for (let i = 0; i < config.dotCount; i++) {
    let best = 0.12;
    for (const rank of seq.dotRanks[i]) {
      const age = raw >= rank ? raw - rank : raw + total - rank;
      if (age > INDEXING_TRAIL) continue;
      const decay = Math.max(0, 1 - age / INDEXING_TRAIL);
      const opa = lerp(0.12, 1, decay);
      if (opa > best) best = opa;
    }
    out[i] = best;

    // Cluster dots lerp to full opacity over INDEXING_LATCH_TICKS
    const latch = seq.latchRank[i];
    if (growEnd >= latch) {
      const lt = clamp((growEnd - latch) / INDEXING_LATCH_TICKS, 0, 1);
      out[i] = lerp(out[i], 1, lt);
    }
  }

  return out;
};

// ─── Ping ───────────────────────────────────────────────────────────────────────
// One-shot ripple from centre outward on the dormant layout.
//
// Model (mirrors loadingLayout in spirit): the dormant layout is the rest
// state. A single wave front sweeps outward in ring-distance space; as
// it crosses a dot, that dot's target dips briefly toward a shrunken Z
// / dimmed opacity, then returns. The wave is fired twice with a short
// quiet gap between passes. Rest state = dormant naturally, so after the
// final pass all targets collapse back to baseline. The spring layer
// supplies all smoothing — there are no discrete phases.
//
// Ring distances are normalised to [0, 1] (0 = centre, 1 = corner) so the
// timing constants are independent of grid size.

const PING_SPEED = 3; // angle units / second
const PING_DIP = 2; // Z units the dip pulls each dot down
const PING_TAIL = 1.5; // width (in ring-dist units) of the ring pulse
const PING_PASS_OFFSET = 0.1 + PING_TAIL + 1; // wave clears + quiet gap
const PING_TOTAL_ANGLE = PING_PASS_OFFSET + 1 + PING_TAIL;
/** Seconds until the animation is completely done and can be frozen. */
const PING_SEQ_DURATION = (PING_TOTAL_ANGLE + 0.3) / PING_SPEED;

const buildPingRingDists = (proj: GridConfig): number[] => {
  const cx = proj.grid.center;
  const maxDist = Math.sqrt(2) * cx; // Euclidean distance from centre to corner
  return Array.from({ length: proj.dotCount }, (_, i) => {
    const dx = (i % proj.n) - cx;
    const dy = Math.floor(i / proj.n) - cx;
    return maxDist > 0 ? Math.sqrt(dx * dx + dy * dy) / maxDist : 0;
  });
};

// Parabolic tent peaking at the midpoint of (0, tail), zero outside.
const pingTent = (d: number, tail: number): number => {
  if (d <= 0 || d >= tail) return 0;
  const u = d / tail;
  return 4 * u * (1 - u);
};

// Dip intensity [0..1] at the given angle for a dot at normalised ring
// distance `rd`. Peaks as the ring wave front crosses the dot; the same
// wave is fired twice, offset in time.
const pingIntensity = (angle: number, rd: number): number => {
  const a = angle - rd;
  return Math.max(
    pingTent(a, PING_TAIL),
    pingTent(a - PING_PASS_OFFSET, PING_TAIL),
  );
};

const pingLayout = (
  proj: GridConfig,
  ringDists: number[],
  baseZ: readonly number[],
  angle = 0,
): Vec3[] =>
  Array.from({ length: proj.dotCount }, (_, i) => {
    const bz = baseZ[i]!;
    const dipZ = Math.max(0, bz - PING_DIP);
    const t = pingIntensity(angle, ringDists[i]!);
    return {
      x: i % proj.n,
      y: Math.floor(i / proj.n),
      z: lerp(bz, dipZ, t),
    };
  });

const pingOpacities = (
  proj: GridConfig,
  ringDists: number[],
  baseOpa: readonly number[],
  angle: number,
): number[] =>
  Array.from({ length: proj.dotCount }, (_, i) => {
    const base = baseOpa[i]!;
    if (base === 0) return 0;
    const t = pingIntensity(angle, ringDists[i]!);
    return lerp(base, 0.12, t);
  });

// ─── Error ──────────────────────────────────────────────────────────────────────
// X pattern (main + anti diagonal) with an outward ripple. Non-X dots stay at
// 0.12 / baseZ. Wave expands by Chebyshev ring so all four arms move together.
// Z only dips behind the front (echoes); the leading edge stays at baseZ.

const ERROR_SPEED = 6;
const ERROR_PAUSE = 5;
const ERROR_TAIL = 3;
const ERROR_STAGGER = 0.4;

const buildErrorData = (config: GridConfig) => {
  const { n, dotCount } = config;
  const cx = (n - 1) / 2;
  let maxRank = 0;
  const ring = Array.from({ length: dotCount }, (_, i) => {
    const x = i % n;
    const y = Math.floor(i / n);
    if (x !== y && x + y !== n - 1) return -1; // not on X
    const r = Math.max(Math.abs(x - cx), Math.abs(y - cx));
    // Stagger dots within the same ring by angular position so the wave
    // sweeps through individual dots instead of flashing whole rings.
    const a = (Math.atan2(y - cx, x - cx) / (2 * Math.PI) + 1) % 1;
    const rank = r + a * ERROR_STAGGER;
    maxRank = Math.max(maxRank, rank);
    return rank;
  });
  return { ring, cycle: maxRank + 2 + ERROR_TAIL + ERROR_PAUSE };
};

// Parabolic tent peaking at midpoint of (0, ERROR_TAIL), zero outside.
const tent = (d: number): number => {
  if (d <= 0 || d >= ERROR_TAIL) return 0;
  const u = d / ERROR_TAIL;
  return 4 * u * (1 - u);
};

const errorLayout = (
  config: GridConfig,
  err: ReturnType<typeof buildErrorData>,
  angle = 0,
): Vec3[] => {
  const baseZ = gridBaseZ(config);
  const trailZ = Math.max(0, baseZ - 2);
  const { n, dotCount } = config;
  const w = ((angle % err.cycle) + err.cycle) % err.cycle;

  return Array.from({ length: dotCount }, (_, i) => {
    const x = i % n;
    const y = Math.floor(i / n);
    if (err.ring[i] < 0) return { x, y, z: baseZ };
    const d = w - err.ring[i];
    // Only echoes dip Z — leading edge stays at baseZ.
    const dip = clamp(0.5 * tent(d - 1) + 0.25 * tent(d - 2), 0, 1);
    return { x, y, z: lerp(baseZ, trailZ, dip) };
  });
};

const errorOpacities = (
  config: GridConfig,
  err: ReturnType<typeof buildErrorData>,
  angle: number,
): number[] => {
  const { dotCount } = config;
  const w = ((angle % err.cycle) + err.cycle) % err.cycle;

  return Array.from({ length: dotCount }, (_, i) => {
    if (err.ring[i] < 0) return 0.12;
    const d = w - err.ring[i];
    const dip = clamp(tent(d) + 0.5 * tent(d - 1) + 0.25 * tent(d - 2), 0, 1);
    return lerp(1, 0.12, dip);
  });
};

// ─── Build ──────────────────────────────────────────────────────────────────────

export const buildStates = (config: GridConfig): Record<StateKey, StateDef> => {
  const dormantProj = config.n === 3 ? buildGridConfig(4) : config;
  const dormantZ =
    config.n === 3 ? DORMANT_3x3_Z : config.n === 4 ? DORMANT_4x4_Z : null;
  const dormantOpa = buildDormantOpacities(config.n);
  const successProj = config.n === 3 ? buildGridConfig(4) : config;
  const successZ = buildSuccessZ(config.n);
  const successOpa = buildSuccessOpacities(config.n);
  const hoverBaseZ = flatGrid(dormantProj, dormantZ).map((p) => p.z);
  const hoverRanks = buildHoverRanks(dormantProj.n);
  const pingRingDists = buildPingRingDists(dormantProj);
  const sphere = buildSphereBase(config);
  const processingCube = buildProcessingCubeBase(config.dotCount);
  const ranks = buildLoadingRanks(config);
  const errorData = buildErrorData(config);
  const indexingSeq = buildIndexingSequence(config);

  return {
    dev: {
      label: STATE_META.dev.label,
      layout: () => flatGrid(config, null),
      opacities: Array.from({ length: config.dotCount }, () => 1),
      animated: false,
      projConfig: config,
    },
    dormant: {
      label: STATE_META.dormant.label,
      layout: () => flatGrid(dormantProj, dormantZ),
      opacities: dormantOpa,
      animated: false,
      projConfig: dormantProj,
    },
    hover: {
      label: STATE_META.hover.label,
      layout: (a = 0) => hoverLayout(dormantProj, hoverRanks, hoverBaseZ, a),
      opacities: (ctx) =>
        hoverOpacities(dormantProj, hoverRanks, dormantOpa, ctx.opacityAngle),
      animated: true,
      layoutSpeed: HOVER_SPEED,
      projConfig: dormantProj,
    },
    ping: {
      label: STATE_META.ping.label,
      layout: (a = 0) => pingLayout(dormantProj, pingRingDists, hoverBaseZ, a),
      opacities: (ctx) =>
        pingOpacities(dormantProj, pingRingDists, dormantOpa, ctx.opacityAngle),
      animated: true,
      layoutSpeed: PING_SPEED,
      sequenceDuration: PING_SEQ_DURATION,
      projConfig: dormantProj,
    },
    thinking: {
      label: STATE_META.thinking.label,
      layout: (a = 0) => thinkingLayout(config, sphere, a),
      opacities: (ctx) =>
        thinkingOpacities(config, sphere, ctx.layoutAngle, ctx.opacityAngle),
      animated: true,
      layoutSpeed: 2.5,
      opacitySpeed: 4,
      projConfig: config,
    },
    processing: {
      label: STATE_META.processing.label,
      layout: (a = 0) => processingLayout(config, processingCube, a),
      opacities: (ctx) =>
        processingOpacities(
          config,
          processingCube,
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
      layout: (a = 0) => loadingLayout(config, ranks, a),
      opacities: (ctx) => loadingOpacities(config, ranks, ctx.opacityAngle),
      animated: true,
      layoutSpeed: 16,
      projConfig: config,
    },
    success: {
      label: STATE_META.success.label,
      layout: () => flatGrid(successProj, successZ),
      opacities: successOpa,
      animated: false,
      projConfig: successProj,
    },

    error: {
      label: STATE_META.error.label,
      layout: (a = 0) => errorLayout(config, errorData, a),
      opacities: (ctx) => errorOpacities(config, errorData, ctx.opacityAngle),
      animated: true,
      layoutSpeed: ERROR_SPEED,
      projConfig: config,
    },
    indexing: {
      label: STATE_META.indexing.label,
      layout: (a = 0) => indexingLayout(config, indexingSeq, a),
      opacities: (ctx) =>
        indexingOpacities(config, indexingSeq, ctx.opacityAngle),
      animated: true,
      layoutSpeed: INDEXING_SPEED,
      projConfig: config,
    },
  };
};

const ALL_STATE_KEYS = Object.keys(STATE_META) as StateKey[];

export const STATE_KEYS = (
  isDevStateEnabled ? ALL_STATE_KEYS : ALL_STATE_KEYS.filter((k) => k !== "dev")
) as StateKey[];

export const getStateLabel = (key: StateKey): string => STATE_META[key].label;

export const getStateUsage = (key: StateKey): string => STATE_META[key].usage;
