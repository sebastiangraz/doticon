import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import DotIcon from "../components/DotIcon/DotIcon";
import DotIcon3D, {
  getStateLabel,
  STATE_KEYS,
  type StateKey,
} from "../components/DotIcon3D/DotIcon3D";
import styles from "../index.module.css";

const mono = "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace" as const;

export const Route = createFileRoute("/")({
  component: () => {
    const [icon3dState, setIcon3dState] = useState<StateKey>("dormant");

    return (
      <>
        <div
          className={styles.container}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 32,
            fontFamily: mono,
            color: "currentColor",
          }}
        >
          {" "}
          <h1>Dot Icon</h1>
          <DotIcon3D size={100} state={icon3dState} />
          <AnimatePresence mode="wait">
            <motion.div
              key={icon3dState}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              style={{
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                opacity: 0.45,
                userSelect: "none",
              }}
            >
              {getStateLabel(icon3dState)}
            </motion.div>
          </AnimatePresence>
          <div style={{ display: "flex", gap: 8 }}>
            {STATE_KEYS.map((key) => {
              const active = icon3dState === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setIcon3dState(key)}
                  style={{
                    padding: "6px 14px",
                    fontSize: 11,
                    fontFamily: "inherit",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    border: "1px solid",
                    borderColor: active
                      ? "currentColor"
                      : "rgba(128,128,128,0.3)",
                    background: active ? "currentColor" : "transparent",
                    borderRadius: 4,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    color: "inherit",
                  }}
                >
                  <span
                    style={{
                      mixBlendMode: active ? "difference" : "normal",
                      color: active ? "#fff" : "inherit",
                      opacity: active ? 1 : 0.5,
                    }}
                  >
                    {getStateLabel(key)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </>
    );
  },
});
