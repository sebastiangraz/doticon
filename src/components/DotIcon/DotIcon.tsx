import { useRef, useEffect, useMemo, useState, useLayoutEffect } from "react";
import type { CSSProperties } from "react";
import { animate, useTime, useMotionValueEvent } from "motion/react";
import { isDevStateEnabled } from "#/env";
import {
  lerp,
  clamp,
  quantizeFloat,
  lerpSize,
  SVG_PAD,
  SVG_SPAN,
  VIEW_SIZE,
  buildGridConfig,
} from "./math";
import { type DotSpring, stepSpring } from "./spring";
import {
  type StateKey,
  buildStates,
  resolveOpacities,
  STATE_KEYS,
  getStateLabel,
  getStateUsage,
} from "./states";

export { type StateKey, STATE_KEYS, getStateLabel, getStateUsage };

const OPACITY_STAGGER_MS = 10;
const OPACITY_CROSSFADE_MS = 120;
const OUTGOING_FADE_S = 0.2;

type OutgoingDot = { cx: string; cy: string; r: string; opacity: string };

const DotIcon = ({
  size = 24,
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
  const time = useTime();
  const phaseStartMsRef = useRef(0);
  const prevMsRef = useRef(0);

  const effectiveState: StateKey =
    state === "dev" && !isDevStateEnabled ? "dormant" : state;
  const stateRef = useRef(effectiveState);
  stateRef.current = effectiveState;

  const config = useMemo(() => buildGridConfig(grid), [grid]);
  const states = useMemo(() => buildStates(config), [config]);
  const statesRef = useRef(states);
  statesRef.current = states;

  const activeDef = states[effectiveState];
  const dotCount = activeDef.projConfig.dotCount;
  const dotCountRef = useRef(dotCount);
  dotCountRef.current = dotCount;

  // ─── Element refs ─────────────────────────────────────────────────────
  const circleRefs = useRef<(SVGCircleElement | null)[]>([]);

  // ─── Outgoing dots (grid-size shrink) ─────────────────────────────────
  const [outgoing, setOutgoing] = useState<OutgoingDot[] | null>(null);
  const outgoingRefs = useRef<(SVGCircleElement | null)[]>([]);
  const gridRef = useRef(grid);
  const prevCountRef = useRef<number | null>(null);

  if (
    gridRef.current !== grid ||
    (prevCountRef.current !== null && prevCountRef.current !== dotCount)
  ) {
    if (prevCountRef.current !== null && prevCountRef.current > dotCount) {
      const data: OutgoingDot[] = [];
      for (let i = dotCount; i < prevCountRef.current; i++) {
        const el = circleRefs.current[i];
        if (el)
          data.push({
            cx: el.getAttribute("cx") || "0",
            cy: el.getAttribute("cy") || "0",
            r: el.getAttribute("r") || "0",
            opacity: el.getAttribute("fill-opacity") || "1",
          });
      }
      if (data.length > 0) setOutgoing(data);
    }
    gridRef.current = grid;
    prevCountRef.current = dotCount;
  }
  if (prevCountRef.current === null) prevCountRef.current = dotCount;

  // ─── Springs ──────────────────────────────────────────────────────────
  const springsRef = useRef<DotSpring[]>([]);
  const springActiveRef = useRef(false);

  // ─── One-shot sequence tracking ───────────────────────────────────────
  const seqDoneRef = useRef(false);

  // ─── Opacity crossfade ────────────────────────────────────────────────
  const opaTrRef = useRef<{
    state: StateKey;
    startMs: number;
    from: number[];
  } | null>(null);

  // ─── Initialise new circles (including first render) ──────────────────
  useLayoutEffect(() => {
    const def = statesRef.current[stateRef.current];
    const layout = def.layout(0);
    const cfg = def.projConfig;
    const opa = resolveOpacities(def.opacities, {
      layoutAngle: 0,
      opacityAngle: 0,
    });

    for (let i = 0; i < dotCount; i++) {
      const el = circleRefs.current[i];
      if (!el || el.hasAttribute("cx")) continue;
      const v = layout[i];
      const sx = SVG_PAD + (v.x / cfg.grid.max) * SVG_SPAN;
      const sy = SVG_PAD + (v.y / cfg.grid.max) * SVG_SPAN;
      const r = Math.max(0, lerpSize(v.z) / 2);
      el.setAttribute("cx", String(sx));
      el.setAttribute("cy", String(sy));
      el.setAttribute("r", String(r));
      el.setAttribute(
        "fill-opacity",
        String(quantizeFloat(clamp(opa[i] ?? 1, 0, 1))),
      );
      if (!springsRef.current[i]) {
        springsRef.current[i] = {
          cx: sx,
          cy: sy,
          r,
          vx: 0,
          vy: 0,
          vr: 0,
          settled: true,
        };
      }
    }
    springsRef.current.length = dotCount;
  }, [dotCount]);

  // ─── Outgoing fade-out ────────────────────────────────────────────────
  useEffect(() => {
    if (!outgoing) return;
    for (const el of outgoingRefs.current)
      if (el)
        animate(
          el,
          { fillOpacity: 0 },
          { duration: OUTGOING_FADE_S, ease: "easeOut" },
        );
    const t = setTimeout(() => setOutgoing(null), OUTGOING_FADE_S * 1000 + 50);
    return () => clearTimeout(t);
  }, [outgoing]);

  // ─── State / grid transitions ─────────────────────────────────────────
  useLayoutEffect(() => {
    phaseStartMsRef.current = time.get();
    prevMsRef.current = time.get();
    seqDoneRef.current = false;

    // Snapshot current opacities for crossfade
    const fromOpa: number[] = [];
    for (let i = 0; i < dotCount; i++) {
      const el = circleRefs.current[i];
      fromOpa.push(el ? parseFloat(el.getAttribute("fill-opacity") || "1") : 1);
    }
    opaTrRef.current = {
      state: effectiveState,
      startMs: time.get(),
      from: fromOpa,
    };

    // Initialise springs from current DOM positions
    for (let i = 0; i < dotCount; i++) {
      const el = circleRefs.current[i];
      const s = (springsRef.current[i] ??= {
        cx: 0,
        cy: 0,
        r: 0,
        vx: 0,
        vy: 0,
        vr: 0,
        settled: false,
      });
      if (el) {
        s.cx = parseFloat(el.getAttribute("cx") || "0");
        s.cy = parseFloat(el.getAttribute("cy") || "0");
        s.r = parseFloat(el.getAttribute("r") || "0");
      }
      s.vx = s.vy = s.vr = 0;
      s.settled = false;
    }
    springActiveRef.current = true;
  }, [effectiveState, config, time, dotCount]);

  // ─── Time loop ────────────────────────────────────────────────────────
  useMotionValueEvent(time, "change", (ms) => {
    const key = stateRef.current;
    const def = statesRef.current[key];
    const n = dotCountRef.current;
    const dt = Math.min((ms - prevMsRef.current) / 1000, 1 / 30);
    prevMsRef.current = ms;

    const hasSprings = springActiveRef.current;
    const hasOpaTr = opaTrRef.current?.state === key;
    const seqDone = seqDoneRef.current;

    if (!def.animated && !hasSprings && !hasOpaTr) return;
    // One-shot state: skip further updates once sequence is frozen and all
    // transitions have settled.
    if (def.animated && seqDone && !hasSprings && !hasOpaTr) return;

    // Compute angle (0 for non-animated states)
    let layoutAngle = 0;
    let opacityAngle = 0;
    if (def.animated) {
      const rawT = (ms - phaseStartMsRef.current) / 1000;
      const t =
        def.sequenceDuration != null
          ? Math.min(rawT, def.sequenceDuration)
          : rawT;
      layoutAngle = (def.layoutSpeed ?? 0) * t;
      opacityAngle = (def.opacitySpeed ?? def.layoutSpeed ?? 0) * t;
      // Mark sequence complete so subsequent frames can early-exit.
      if (def.sequenceDuration != null && rawT >= def.sequenceDuration) {
        seqDoneRef.current = true;
      }
    }

    const layout = def.layout(layoutAngle);
    const opa = resolveOpacities(def.opacities, { layoutAngle, opacityAngle });
    const gridMax = def.projConfig.grid.max;

    const tr = hasOpaTr ? opaTrRef.current! : null;
    const trElapsedMs = tr ? ms - tr.startMs : 0;
    let anySpringsActive = false;

    for (let i = 0; i < n; i++) {
      const el = circleRefs.current[i];
      if (!el) continue;

      const v = layout[i];
      const sx = SVG_PAD + (v.x / gridMax) * SVG_SPAN;
      const sy = SVG_PAD + (v.y / gridMax) * SVG_SPAN;
      const targetR = Math.max(0, lerpSize(v.z) / 2);

      // Position: spring-blend when transitioning, direct when settled
      if (hasSprings) {
        const s = springsRef.current[i];
        if (s && !s.settled) {
          const f = n <= 1 ? 0 : i / (n - 1);
          stepSpring(
            s,
            sx,
            sy,
            targetR,
            240 * (1 - 0.35 * f),
            25 * (1 + 0.24 * f),
            0.8 * (1 + 0.6 * f),
            dt,
          );
          el.setAttribute("cx", String(s.cx));
          el.setAttribute("cy", String(s.cy));
          el.setAttribute("r", String(Math.max(0, s.r)));
          anySpringsActive = true;
        } else {
          el.setAttribute("cx", String(sx));
          el.setAttribute("cy", String(sy));
          el.setAttribute("r", String(targetR));
        }
      } else {
        el.setAttribute("cx", String(sx));
        el.setAttribute("cy", String(sy));
        el.setAttribute("r", String(targetR));
      }

      // Opacity: crossfade then snap
      let finalOpa = quantizeFloat(clamp(opa[i], 0, 1));
      if (tr) {
        const localMs = trElapsedMs - i * OPACITY_STAGGER_MS;
        const blendT = clamp(localMs / OPACITY_CROSSFADE_MS, 0, 1);
        if (blendT < 1) {
          const from = quantizeFloat(clamp(tr.from[i] ?? finalOpa, 0, 1));
          finalOpa = quantizeFloat(lerp(from, finalOpa, blendT));
        }
      }
      el.setAttribute("fill-opacity", String(finalOpa));
    }

    if (!anySpringsActive) springActiveRef.current = false;
    if (tr) {
      const doneMs = (n - 1) * OPACITY_STAGGER_MS + OPACITY_CROSSFADE_MS;
      if (trElapsedMs >= doneMs) opaTrRef.current = null;
    }
  });

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <svg
      viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      style={{ ...style, overflow: "visible", color: color ?? "currentColor" }}
    >
      {outgoing?.map((d, i) => (
        <circle
          key={`out-${i}`}
          ref={(el) => {
            outgoingRefs.current[i] = el;
          }}
          cx={d.cx}
          cy={d.cy}
          r={d.r}
          fill="currentColor"
          fillOpacity={d.opacity}
        />
      ))}
      {Array.from({ length: dotCount }, (_, i) => (
        <circle
          key={i}
          ref={(el) => {
            circleRefs.current[i] = el;
          }}
          fill="currentColor"
        />
      ))}
    </svg>
  );
};

export default DotIcon;
DotIcon.displayName = "DotIcon";
