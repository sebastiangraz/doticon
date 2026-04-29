import { motion } from "motion/react";
import DotIcon, { type StateKey } from "#/components/DotIcon/DotIcon";
import styles from "../../index.module.css";
import { useSequence, type SequenceStep } from "./useSequence";

type StepId =
  | "idle"
  | "fadein"
  | "ready"
  | "pressing"
  | "compiling"
  | "error"
  | "fadeout"
  | "end";

const STEPS: readonly SequenceStep<StepId>[] = [
  { id: "idle", duration: 500 },
  { id: "fadein", duration: 400 },
  { id: "ready", duration: 900 },
  { id: "pressing", duration: 200 },
  { id: "compiling", duration: 2200 },
  { id: "error", duration: 2200 },
  { id: "fadeout", duration: 600 },
  { id: "end", duration: 300 },
];

const ICON_FOR_STEP: Record<StepId, StateKey> = {
  idle: "dormant",
  fadein: "dormant",
  ready: "hover",
  pressing: "hover",
  compiling: "compiling",
  error: "error",
  fadeout: "error",
  end: "dormant",
};

const Chatbox = ({ "data-label": label }: { "data-label"?: string }) => {
  const { id, isAtOrAfter } = useSequence(STEPS);

  const wrapVisible = isAtOrAfter("fadein") && !isAtOrAfter("fadeout");
  const isGradient = isAtOrAfter("compiling") && !isAtOrAfter("error");
  const isError = isAtOrAfter("error");
  const isPressed = isAtOrAfter("pressing") && !isAtOrAfter("compiling");

  const iconState = ICON_FOR_STEP[id];

  const outerClass = [
    styles.chatboxOuter,
    isGradient ? styles.chatboxGradient : "",
    isError ? styles.chatboxErrorBorder : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`${styles.column} ${styles.card}`} data-label={label}>
      <motion.div
        className={styles.chatboxWrap}
        initial={{ opacity: 0, y: 5 }}
        animate={wrapVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 5 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <div className={outerClass}>
          <div className={styles.chatboxInner}>
            <span className={styles.chatboxPlaceholder}>Ask anything…</span>
            <motion.button
              className={styles.chatboxSend}
              animate={isPressed ? { scale: 0.82 } : { scale: 1 }}
              transition={{ duration: 0.1, ease: "easeInOut" }}
            >
              <DotIcon size={20} state={iconState} grid={4} />
            </motion.button>
          </div>
        </div>
        <motion.span
          className={styles.chatboxErrorLabel}
          initial={{ opacity: 0, y: -4 }}
          animate={
            isError ? { opacity: 1, y: 0 } : { opacity: 0, y: -4 }
          }
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          Error, not connected
        </motion.span>
      </motion.div>
    </div>
  );
};

export default Chatbox;
Chatbox.displayName = "Chatbox";
