import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import ExposeProps from "#/components/ExposeProps/ExposeProps";
import DotIcon, {
  getStateLabel,
  STATE_KEYS,
  type StateKey,
} from "#/components/DotIcon/DotIcon";
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
          <svg
            width="32"
            viewBox="0 0 140 140"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fill-rule="evenodd"
              clip-rule="evenodd"
              d="M13.098 5.67312C25.0098 3.26184 37.1906 1.59277 49.5906 0.716196C50.9941 1.26145 52.5251 1.90677 54.1789 2.67049C65.0282 7.67985 81.2359 17.8098 101.712 38.2864C122.189 58.7629 132.319 74.9706 137.328 85.82C138.092 87.4748 138.738 89.0061 139.284 90.4107C138.407 102.81 136.738 114.991 134.327 126.902L13.098 5.67312ZM133.022 6.99757C137.503 26.8743 139.909 47.5369 140 68.746C133.532 58.2634 123.795 45.5191 109.137 30.8616C94.4804 16.2046 81.7368 6.46761 71.2546 0C92.4633 0.0913534 113.126 2.49717 133.002 6.978V6.99757H133.022ZM0.716267 49.5891C1.59287 37.1898 3.26195 25.0094 5.67308 13.098L126.902 134.327C114.99 136.738 102.809 138.407 90.4094 139.284C89.0055 138.738 87.4749 138.093 85.8208 137.329C74.9718 132.32 58.7641 122.19 38.2876 101.713C17.8108 81.2369 7.68083 65.0292 2.67147 54.1802C1.90736 52.5253 1.26173 50.9937 0.716267 49.5891ZM68.7454 140C58.2632 133.532 45.5196 123.795 30.8624 109.138C16.2049 94.4807 6.46761 81.7363 0 71.2542C0.0912834 92.4632 2.49713 113.126 6.978 133.002H6.99757V133.022C26.874 137.503 47.5363 139.909 68.7454 140Z"
              fill="black"
            />
          </svg>
          <DotIcon size={100} state={icon3dState} />
          <div style={{ display: "flex", gap: 8 }}>
            {STATE_KEYS.map((key: StateKey) => {
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
          <div style={{ display: "flex", gap: "0.5rlh", maxWidth: "48rlh" }}>
            <ExposeProps className={styles.prop}>
              <DotIcon size={32} state={"dormant"} />
              <DotIcon size={16} state={"dormant"} />
            </ExposeProps>
            <ExposeProps className={styles.prop}>
              <DotIcon size={32} state={"thinking"} />
              <DotIcon size={16} state={"thinking"} />
            </ExposeProps>
            <ExposeProps className={styles.prop}>
              <DotIcon size={32} state={"loading"} />
              <DotIcon size={16} state={"loading"} />
            </ExposeProps>
          </div>
        </div>
      </>
    );
  },
});
