import { isDevDotIconStateEnabled } from "#/env";
import {
  type Vec3,
  type GridConfig,
  buildGridConfig,
  gridBaseZ,
  rotateY,
  lerp,
  clamp,
  DOT_SIZES,
} from "./math";

// ─── Dormant patterns ───────────────────────────────────────────────────────────
// 7×7 master is the canonical reference. Other grids downsample via nearest-
// neighbour; 3×3 and 4×4 have hand-crafted overrides for full designer control.

const DORMANT_MASTER_N = 7;
const DORMANT_MASTER: readonly number[] = [
  0.12, 1, 1, 0.12, 1, 1, 1, 1, 0.45, 1, 1, 0.12, 1, 1, 1, 1, 0.45, 1, 1, 0.12,
  1, 0.12, 1, 1, 0.45, 1, 1, 0.12, 1, 0.12, 1, 1, 0.45, 1, 1, 1, 1, 0.12, 1, 1,
  0.45, 1, 1, 1, 1, 0.12, 1, 1, 0.12,
];

// Grid=3 renders internally as 4×4, so arrays hold 16 values.
const DORMANT_3x3_OPACITIES: readonly number[] = [
  0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0,
];
const DORMANT_3x3_Z: readonly number[] = [
  1, 3, 1, 3, 3, 1, 4, 1, 1, 4, 1, 3, 3, 1, 3, 1,
];

const DORMANT_4x4_OPACITIES: readonly number[] = [
  0.12, 1, 0.12, 1, 1, 0.45, 1, 0.12, 0.12, 1, 0.45, 1, 1, 0.12, 1, 0.12,
];
const DORMANT_4x4_Z: readonly number[] = [
  1, 2, 2, 2, 2, 2, 3, 2, 2, 3, 2, 2, 2, 2, 2, 1,
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

// ─── State types ────────────────────────────────────────────────────────────────

const STATE_META = {
  dormant: { label: "Dormant" },
  thinking: { label: "Thinking" },
  loading: { label: "Loading" },
  error: { label: "Error" },
  indexing: { label: "Indexing" },
  dev: { label: "Dev" },
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
};

export const resolveOpacities = (
  o: Opacities,
  ctx: OpacitySolveCtx,
): number[] => (typeof o === "function" ? o(ctx) : o);

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

// ─── Indexing ───────────────────────────────────────────────────────────────────
// Random dots converge toward a centre cluster over one cycle, driven purely by
// opacity.  The sequence is precomputed with a seeded PRNG so there is zero
// runtime randomness cost.

const INDEXING_TICKS = 32; //32
const INDEXING_TRAIL = 4; //6
const INDEXING_PAUSE = 1; //8
const INDEXING_FOCUS = 6; //6
const INDEXING_SEED = 30; //5, 9, 30
const INDEXING_SPEED = 7;
const INDEXING_LATCH_TICKS = 4;

const mulberry32 = (seed: number): (() => number) => {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type IndexingSeq = { hits: number[][]; latchTick: number[] };

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

  const hits: number[][] = [];
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
    hits.push(picked);
  }

  // For cluster dots (excessDist === 0), record first activation tick.
  const latchTick = new Array(dotCount).fill(Infinity);
  for (let tick = 0; tick < INDEXING_TICKS; tick++) {
    for (const idx of hits[tick]) {
      if (excessDists[idx] === 0 && latchTick[idx] === Infinity) {
        latchTick[idx] = tick;
      }
    }
  }

  return { hits, latchTick };
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
    const latch = seq.latchTick[i];
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
  const tick = Math.floor(raw);
  const frac = raw - tick;

  const growEnd = Math.min(raw, INDEXING_TICKS);

  const out = new Array(config.dotCount).fill(0.12);
  for (let offset = 0; offset < INDEXING_TRAIL; offset++) {
    const t = (((tick - offset) % total) + total) % total;
    if (t >= INDEXING_TICKS) continue;
    const age = offset + (1 - frac);
    const decay = Math.max(0, 1 - age / INDEXING_TRAIL);
    const opa = lerp(0.12, 1, decay);
    for (const idx of seq.hits[t]) {
      if (opa > out[idx]) out[idx] = opa;
    }
  }

  // Cluster dots lerp to full opacity over INDEXING_LATCH_TICKS, frozen at cycle end
  for (let i = 0; i < config.dotCount; i++) {
    const latch = seq.latchTick[i];
    if (growEnd >= latch) {
      const lt = clamp((growEnd - latch) / INDEXING_LATCH_TICKS, 0, 1);
      out[i] = lerp(out[i], 1, lt);
    }
  }

  return out;
};

// ─── Error ──────────────────────────────────────────────────────────────────────
// X = main + anti diagonal on the discrete grid. Non-X dots stay at 0.12 opacity.
// A smooth pulse travels center-out along the X path (continuous phase, no stair-
// stepping). Z ramps with soft approach/decay; opacity uses a smooth tent behind
// the head (~2 rank units). XY stay on the integer grid.

const ERROR_PAUSE = 3;
const ERROR_SPEED = 10;
const ERROR_Z_APPROACH = 0.62;
const ERROR_Z_DECAY = 1.38;
const ERROR_OP_APPROACH = 0.62;
const ERROR_OP_TAIL = 2.12;

const isOnX = (x: number, y: number, n: number): boolean =>
  x === y || x + y === n - 1;

type ErrorWave = {
  xMask: boolean[];
  orderRank: number[];
  xCount: number;
  cycle: number;
};

const buildErrorWave = (config: GridConfig): ErrorWave => {
  const { n, dotCount } = config;
  const cx = (n - 1) / 2;
  const cy = (n - 1) / 2;

  type Cell = { i: number; x: number; y: number; d: number; ang: number };
  const cells: Cell[] = [];
  for (let i = 0; i < dotCount; i++) {
    const x = i % n;
    const y = Math.floor(i / n);
    if (!isOnX(x, y, n)) continue;
    const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
    const ang = Math.atan2(y - cy, x - cx);
    cells.push({ i, x, y, d, ang });
  }

  cells.sort((a, b) => {
    if (a.d !== b.d) return a.d - b.d;
    if (a.ang !== b.ang) return a.ang - b.ang;
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  const xMask = Array.from({ length: dotCount }, (_, i) => {
    const x = i % n;
    const y = Math.floor(i / n);
    return isOnX(x, y, n);
  });

  const orderRank = new Array<number>(dotCount).fill(-1);
  cells.forEach((c, r) => {
    orderRank[c.i] = r;
  });

  const xCount = cells.length;
  const cycle = xCount + ERROR_PAUSE;

  return { xMask, orderRank, xCount, cycle };
};

const errorPhase = (angle: number, cycle: number): number => {
  if (cycle <= 0) return 0;
  return ((angle % cycle) + cycle) % cycle;
};

const smooth01 = (t: number): number => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};

const errorLayout = (
  config: GridConfig,
  wave: ErrorWave,
  angle = 0,
): Vec3[] => {
  const baseZ = gridBaseZ(config);
  const peakZ = Math.min(baseZ + 1, DOT_SIZES.length - 1);
  const { n, dotCount } = config;
  const w = errorPhase(angle, wave.cycle);
  const inPause = wave.xCount === 0 || w >= wave.xCount;

  return Array.from({ length: dotCount }, (_, i) => {
    const x = i % n;
    const y = Math.floor(i / n);
    if (!wave.xMask[i]) {
      return { x, y, z: baseZ };
    }
    if (inPause) {
      return { x, y, z: baseZ };
    }
    const r = wave.orderRank[i]!;
    const d = w - r;
    const blendIn =
      d < 0 ? smooth01(1 + d / ERROR_Z_APPROACH) : 1;
    const blendOut = 1 - smooth01(clamp(d / ERROR_Z_DECAY, 0, 1));
    const zMix = blendIn * blendOut;
    return { x, y, z: lerp(baseZ, peakZ, zMix) };
  });
};

const errorOpacities = (
  config: GridConfig,
  wave: ErrorWave,
  angle: number,
): number[] => {
  const { dotCount } = config;
  const w = errorPhase(angle, wave.cycle);
  const inPause = wave.xCount === 0 || w >= wave.xCount;
  const tail = ERROR_OP_TAIL;

  return Array.from({ length: dotCount }, (_, i) => {
    if (!wave.xMask[i]) return 0.12;
    if (inPause) return 1;
    const r = wave.orderRank[i]!;
    const d = w - r;
    const blendIn =
      d < 0 ? smooth01(1 + d / ERROR_OP_APPROACH) : 1;
    let opTent = 0;
    if (d > 0 && d < tail) {
      const u = d / tail;
      opTent = 4 * u * (1 - u);
    }
    return lerp(1, 0.12, opTent * blendIn);
  });
};

// ─── Build ──────────────────────────────────────────────────────────────────────

export const buildStates = (config: GridConfig): Record<StateKey, StateDef> => {
  const dormantProj = config.n === 3 ? buildGridConfig(4) : config;
  const dormantZ =
    config.n === 3 ? DORMANT_3x3_Z : config.n === 4 ? DORMANT_4x4_Z : null;
  const dormantOpa = buildDormantOpacities(config.n);
  const sphere = buildSphereBase(config);
  const ranks = buildLoadingRanks(config);
  const errorWave = buildErrorWave(config);
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
    loading: {
      label: STATE_META.loading.label,
      layout: (a = 0) => loadingLayout(config, ranks, a),
      opacities: (ctx) => loadingOpacities(config, ranks, ctx.opacityAngle),
      animated: true,
      layoutSpeed: 16,
      projConfig: config,
    },
    error: {
      label: STATE_META.error.label,
      layout: (a = 0) => errorLayout(config, errorWave, a),
      opacities: (ctx) => errorOpacities(config, errorWave, ctx.opacityAngle),
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
  isDevDotIconStateEnabled
    ? ALL_STATE_KEYS
    : ALL_STATE_KEYS.filter((k) => k !== "dev")
) as StateKey[];

export const getStateLabel = (key: StateKey): string => STATE_META[key].label;
