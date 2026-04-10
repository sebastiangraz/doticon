import { isDevDotIconStateEnabled } from "#/env";
import {
  type Vec3,
  type GridConfig,
  buildGridConfig,
  gridBaseZ,
  rotateY,
  lerp,
  clamp,
} from "./math";

// ─── Dormant patterns ───────────────────────────────────────────────────────────
// 7×7 master is the canonical reference. Other grids downsample via nearest-
// neighbour; 3×3 and 4×4 have hand-crafted overrides for full designer control.

const DORMANT_MASTER_N = 7;
const DORMANT_MASTER: readonly number[] = [
  0.12, 1, 1, 0.12, 1, 1, 1,
  1, 0.45, 1, 1, 0.12, 1, 1,
  1, 1, 0.45, 1, 1, 0.12, 1,
  0.12, 1, 1, 0.45, 1, 1, 0.12,
  1, 0.12, 1, 1, 0.45, 1, 1,
  1, 1, 0.12, 1, 1, 0.45, 1,
  1, 1, 1, 0.12, 1, 1, 0.12,
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

// ─── Build ──────────────────────────────────────────────────────────────────────

export const buildStates = (
  config: GridConfig,
): Record<StateKey, StateDef> => {
  const dormantProj = config.n === 3 ? buildGridConfig(4) : config;
  const dormantZ =
    config.n === 3
      ? DORMANT_3x3_Z
      : config.n === 4
        ? DORMANT_4x4_Z
        : null;
  const dormantOpa = buildDormantOpacities(config.n);
  const sphere = buildSphereBase(config);
  const ranks = buildLoadingRanks(config);

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
      layoutSpeed: 12,
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
