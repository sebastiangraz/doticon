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
    <>
      <div className={`${styles.column} ${styles.card}`} data-label={label}>
        <motion.div
          className={styles.chatbox}
          initial={{ opacity: 0, y: 5 }}
          animate={wrapVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 5 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <span className={styles.chatboxInner}>
            Ask anything
            <motion.div
              className={styles.chatboxSend}
              animate={isPressed ? { scale: 0.82 } : { scale: 1 }}
              transition={{ duration: 0.1, ease: "easeInOut" }}
            >
              <DotIcon size={20} state={iconState} grid={4} />
            </motion.div>
          </span>
          <div className={styles.chatboxGradient}></div>
        </motion.div>
        <motion.span
          className={styles.chatboxError}
          initial={{ opacity: 0, y: -4 }}
          animate={isError ? { opacity: 1, y: 0 } : { opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          Error, not connected
        </motion.span>
      </div>
      <svg
        style={{
          position: "absolute",
          width: 0,
          height: 0,
          overflow: "hidden",
        }}
      >
        <defs>
          <filter
            id="pillSoftEdge"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.11" />
          </filter>
          <mask id="pillRingMask" maskContentUnits="objectBoundingBox">
            {/* White pill = visible area */}
            <rect width="1" height="1" rx="0" fill="#fff" />
            {/* Black inner pill = transparent center, blurred for soft edge */}
            <rect
              x="0.07"
              y="0.16"
              width="0.86"
              height="0.68"
              rx="0.1"
              fill="#000"
              filter="url(#pillSoftEdge)"
            />
          </mask>
        </defs>
      </svg>
    </>
  );
};

export default Chatbox;
Chatbox.displayName = "Chatbox";
