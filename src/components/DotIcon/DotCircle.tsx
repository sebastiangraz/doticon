import { useEffect, useRef } from "react";
import {
  motion,
  useSpring,
  useMotionValueEvent,
  type MotionValue,
} from "motion/react";

const SPRING = {
  type: "spring" as const,
  stiffness: 240,
  damping: 25,
  mass: 0.8,
};

export type DotMV = {
  cx: MotionValue<number>;
  cy: MotionValue<number>;
  r: MotionValue<number>;
  opacity: MotionValue<number>;
};

export const DotCircle = ({
  mv,
  i,
  dotCount,
  animated,
}: {
  mv: DotMV;
  i: number;
  dotCount: number;
  animated: boolean;
}) => {
  // Keep latest animated flag accessible inside Motion event callbacks without
  // re-registering the listeners on every render.
  const animatedRef = useRef(animated);
  animatedRef.current = animated;

  // Per-dot spring variation gives a mild spatial cascade without explicit delays.
  const t = dotCount <= 1 ? 0 : i / (dotCount - 1);
  const spring = {
    ...SPRING,
    stiffness: SPRING.stiffness * (1 - 0.35 * t),
    damping: SPRING.damping * (1 + 0.24 * t),
    mass: SPRING.mass * (1 + 0.6 * t),
  } as const;

  const cx = useSpring(mv.cx.get(), spring);
  const cy = useSpring(mv.cy.get(), spring);
  const r = useSpring(mv.r.get(), spring);
  const opacity = useSpring(mv.opacity.get(), SPRING);

  // Animated states drive positions every frame — spring physics would never
  // settle, keeping 3×N spring animations permanently active. Instead:
  //   • animated  → jump() keeps springs in sync (no physics, zero scheduler cost)
  //   • !animated → set() triggers spring physics for smooth state transitions
  useMotionValueEvent(mv.cx, "change", (latest) => {
    if (animatedRef.current) cx.jump(latest);
    else cx.set(latest);
  });
  useMotionValueEvent(mv.cy, "change", (latest) => {
    if (animatedRef.current) cy.jump(latest);
    else cy.set(latest);
  });
  useMotionValueEvent(mv.r, "change", (latest) => {
    if (animatedRef.current) r.jump(latest);
    else r.set(latest);
  });
  useMotionValueEvent(mv.opacity, "change", (latest) => opacity.set(latest));

  // When the underlying MotionValue instances change (state switch),
  // nudge spring targets so rapid switching feels like "following" rather than
  // restarting queued animations.
  useEffect(() => {
    cx.set(mv.cx.get());
    cy.set(mv.cy.get());
    r.set(mv.r.get());
    opacity.set(mv.opacity.get());
  }, [mv.cx, mv.cy, mv.r, mv.opacity, cx, cy, r, opacity]);

  // Animated: motion.circle reads the raw target MV directly — no spring layer.
  // Non-animated: motion.circle reads the spring so positions settle smoothly.
  return (
    <motion.circle
      cx={animated ? mv.cx : cx}
      cy={animated ? mv.cy : cy}
      r={animated ? mv.r : r}
      fill="currentColor"
      fillOpacity={opacity}
    />
  );
};
