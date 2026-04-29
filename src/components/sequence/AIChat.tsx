import { useEffect, useState } from "react";
import { motion } from "motion/react";
import DotIcon, { type StateKey } from "#/components/DotIcon/DotIcon";
import { ScrambleText } from "#/components/ScrambleText/ScrambleText";
import styles from "../../index.module.css";
import { useSequence, type SequenceStep } from "./useSequence";

const USER_PROMPT = "Summarise my last three files";
const AI_RESPONSE = "Here are the highlights from your last three files…";

type StepId =
  | "idle"
  | "user"
  | "dormant"
  | "thinking"
  | "typing"
  | "settle"
  | "success"
  | "end";

const STEPS: readonly SequenceStep<StepId>[] = [
  { id: "idle", duration: 1000 },
  { id: "user", duration: 800 },
  { id: "dormant", duration: 1000 },
  { id: "thinking", duration: 700 },
  { id: "typing", duration: 1700 },
  { id: "settle", duration: 1000 },
  { id: "success", duration: 2000 },
  { id: "end", duration: 3500 },
];

// During `idle` we keep the icon at `success` so the AI bubble can fade out
// with the content it had at the end of the cycle. `user` resets to dormant
// while the bubble is still fully invisible, so the next cycle fades back
// in with a fresh state.
const ICON_FOR_STEP: Record<StepId, StateKey> = {
  idle: "dormant",
  user: "dormant",
  dormant: "hover",
  thinking: "thinking",
  typing: "thinking",
  settle: "ping",
  success: "success",
  end: "success",
};

const bubbleTransition = {
  duration: 0.24,
  ease: "easeOut",
} as const;

const HIDDEN = { opacity: 0, y: 6, scale: 0.99 };
const SHOWN = { opacity: 1, y: 0, scale: 1 };

const AIChat = () => {
  const { id, isAtOrAfter } = useSequence(STEPS);

  // Remount `ScrambleText` at the start of each new cycle so it resets to
  // its scrambled initial state before the bubble fades back in. We
  // increment on `user`, which happens while the AI bubble is still fully
  // invisible — the remount is never visible to the user.
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    if (id === "user") setCycle((c) => c + 1);
  }, [id]);

  const userVisible = id !== "idle" && isAtOrAfter("user");
  const aiVisible = id !== "idle" && isAtOrAfter("dormant");
  const iconState = ICON_FOR_STEP[id];
  const revealText = id !== "idle" && isAtOrAfter("typing");

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
          <ScrambleText
            key={cycle}
            text={AI_RESPONSE}
            inView={revealText}
            staggerDelay={60}
            maxCharDelay={300}
          />
        </motion.div>
      </div>
    </div>
  );
};

export default AIChat;
AIChat.displayName = "AIChat";
