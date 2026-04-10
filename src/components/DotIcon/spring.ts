export type DotSpring = {
  cx: number;
  cy: number;
  r: number;
  vx: number;
  vy: number;
  vr: number;
  settled: boolean;
};

const THRESHOLD = 0.05;

export const stepSpring = (
  s: DotSpring,
  tCx: number,
  tCy: number,
  tR: number,
  stiffness: number,
  damping: number,
  mass: number,
  dt: number,
): void => {
  s.vx += ((-stiffness * (s.cx - tCx) - damping * s.vx) / mass) * dt;
  s.vy += ((-stiffness * (s.cy - tCy) - damping * s.vy) / mass) * dt;
  s.vr += ((-stiffness * (s.r - tR) - damping * s.vr) / mass) * dt;
  s.cx += s.vx * dt;
  s.cy += s.vy * dt;
  s.r += s.vr * dt;
  s.settled =
    Math.abs(s.cx - tCx) < THRESHOLD &&
    Math.abs(s.cy - tCy) < THRESHOLD &&
    Math.abs(s.r - tR) < THRESHOLD &&
    Math.abs(s.vx) < THRESHOLD &&
    Math.abs(s.vy) < THRESHOLD &&
    Math.abs(s.vr) < THRESHOLD;
  if (s.settled) {
    s.cx = tCx;
    s.cy = tCy;
    s.r = tR;
    s.vx = s.vy = s.vr = 0;
  }
};
