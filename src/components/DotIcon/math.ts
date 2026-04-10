export type Vec3 = { x: number; y: number; z: number };

export const DOT_SIZES = [6, 8, 12, 16, 20] as const;

export const VIEW_SIZE = 100;
export const SVG_PAD = 14;
export const SVG_SPAN = VIEW_SIZE - 2 * SVG_PAD;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

// 6 decimal places — visually indistinguishable, but keeps SSR/client
// serialisation identical (trig/float rounding can differ across runtimes).
export const quantizeFloat = (v: number): number =>
  Math.round(v * 1e6) / 1e6;

// Continuous interpolation between DOT_SIZES entries.  For integer z the
// result matches the old snapSize(); for fractional z it blends between
// adjacent tiers — smooth by construction, no per-dot spring needed.
export const lerpSize = (z: number): number => {
  const t = clamp(z / (DOT_SIZES.length - 1), 0, 1);
  const idx = t * (DOT_SIZES.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, DOT_SIZES.length - 1);
  return lerp(DOT_SIZES[lo], DOT_SIZES[hi], idx - lo);
};

export type GridConfig = {
  n: number;
  dotCount: number;
  grid: { min: 0; max: number; center: number };
};

export const buildGridConfig = (n: number): GridConfig => ({
  n,
  dotCount: n * n,
  grid: { min: 0 as const, max: n - 1, center: (n - 1) / 2 },
});

// Inverse grid-density Z: smaller grids → larger dots, larger grids → smaller.
export const gridBaseZ = (config: GridConfig): number => {
  const step = Math.max(0, config.n - 3);
  return Math.max(0, DOT_SIZES.length - 1 - step);
};

export const rotateY = ({ x, y, z }: Vec3, a: number): Vec3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c + z * s, y, z: -x * s + z * c };
};
