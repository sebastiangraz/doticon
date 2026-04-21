import { useEffect, useLayoutEffect, useState } from "react";
import { motion } from "motion/react";
import DotIcon, { type StateKey } from "#/components/DotIcon/DotIcon";
import styles from "../../index.module.css";
import { useSequence, type SequenceStep } from "./useSequence";

const USER_PROMPT = "Summarise my last three files";
const AI_RESPONSE = "Here are the highlights from your last three files…";

const TYPING_MS = 1600;

type StepId =
  | "idle"
  | "user"
  | "dormant"
  | "thinking"
  | "typing"
  | "settle"
  | "success";

const STEPS: readonly SequenceStep<StepId>[] = [
  { id: "idle", duration: 700 },
  { id: "user", duration: 800 },
  { id: "dormant", duration: 500 },
  { id: "thinking", duration: 700 },
  { id: "typing", duration: TYPING_MS + 120 },
  { id: "settle", duration: 1000 },
  { id: "success", duration: 1500 },
];

// During `idle` we keep the icon at `success` so the AI bubble can fade out
// with the content it had at the end of the cycle. `user` resets to dormant
// while the bubble is still fully invisible, so the next cycle fades back
// in with a fresh state.
const ICON_FOR_STEP: Record<StepId, StateKey> = {
  idle: "success",
  user: "dormant",
  dormant: "dormant",
  thinking: "thinking",
  typing: "thinking",
  settle: "thinking",
  success: "success",
};

const bubbleTransition = {
  duration: 0.24,
  ease: "easeOut",
} as const;

const HIDDEN = { opacity: 0, y: 6, scale: 0.96 };
const SHOWN = { opacity: 1, y: 0, scale: 1 };

const AIChat = () => {
  const { id, isAtOrAfter } = useSequence(STEPS);
  const [typedCount, setTypedCount] = useState(0);

  // Reset synchronously before paint when entering `typing`, so the first
  // rendered frame never shows residual text from the prior cycle.
  useLayoutEffect(() => {
    if (id === "typing") setTypedCount(0);
  }, [id]);

  useEffect(() => {
    if (id !== "typing") return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / TYPING_MS);
      setTypedCount(Math.floor(t * AI_RESPONSE.length));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [id]);

  const userVisible = id !== "idle" && isAtOrAfter("user");
  const aiVisible = id !== "idle" && isAtOrAfter("dormant");
  const iconState = ICON_FOR_STEP[id];

  // Text derivation mirrors the icon logic: preserve the full response
  // during `idle` (fade-out) and clear during `user` (still invisible) so
  // the next cycle starts empty.
  const shownText =
    id === "typing"
      ? AI_RESPONSE.slice(0, typedCount)
      : id === "settle" || id === "success" || id === "idle"
        ? AI_RESPONSE
        : "";

  return (
    <div className={`${styles.column} ${styles.card}`}>
      <div className={styles.chat}>
        <motion.div
          className={`${styles.bubble} ${styles.user}`}
          initial={HIDDEN}
          animate={userVisible ? SHOWN : HIDDEN}
          transition={bubbleTransition}
          layout="position"
        >
          {USER_PROMPT}
        </motion.div>
        <motion.div
          className={styles.bubble}
          initial={HIDDEN}
          animate={aiVisible ? SHOWN : HIDDEN}
          transition={bubbleTransition}
          layout="position"
        >
          <DotIcon size={16} state={iconState} grid={4} />
          <div>
            {shownText}
            {id === "typing" ? (
              <motion.span
                aria-hidden
                animate={{ opacity: [1, 0, 1] }}
                transition={{
                  duration: 0.9,
                  repeat: Infinity,
                  ease: "linear",
                }}
                style={{
                  display: "inline-block",
                  marginLeft: 1,
                }}
              >
                ▍
              </motion.span>
            ) : null}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default AIChat;
AIChat.displayName = "AIChat";
