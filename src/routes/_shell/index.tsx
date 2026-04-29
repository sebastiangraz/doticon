import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import ExposeProps from "#/components/ExposeProps/ExposeProps";
import DotIcon, {
  getStateLabel,
  STATE_KEYS,
  type StateKey,
} from "#/components/DotIcon/DotIcon";
import AIChat from "#/components/sequence/AIChat";
import styles from "../../index.module.css";
import { isDevStateEnabled } from "#/env";

export const Route = createFileRoute("/_shell/")({
  component: () => {
    const defaultGridSizeOptions = [3, 4, 7];
    const devGridSizeOptions = [3, 4, 5, 6, 7, 8, 10];
    const GRID_SIZE_OPTIONS = isDevStateEnabled
      ? devGridSizeOptions
      : defaultGridSizeOptions;
    const [iconState, seticonState] = useState<StateKey>("dormant");
    const [gridSize, setGridSize] = useState(4);
    const [gridSizeInput, setGridSizeInput] = useState(gridSize);
    const previewRef = useRef<HTMLDivElement | null>(null);
    const [didCopy, setDidCopy] = useState(false);

    useEffect(() => {
      const t = window.setTimeout(() => {
        setGridSize(gridSizeInput);
      }, 140);

      return () => window.clearTimeout(t);
    }, [gridSizeInput]);

    const gridSizeSliderIndex = Math.max(
      0,
      GRID_SIZE_OPTIONS.indexOf(
        gridSizeInput as (typeof GRID_SIZE_OPTIONS)[number],
      ),
    );

    const copySvg = async () => {
      const svg = previewRef.current?.querySelector("svg");
      if (!svg) return;

      const svgText = new XMLSerializer().serializeToString(svg);

      try {
        await navigator.clipboard.writeText(svgText);
        setDidCopy(true);
        window.setTimeout(() => setDidCopy(false), 900);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = svgText;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setDidCopy(true);
        window.setTimeout(() => setDidCopy(false), 900);
      }
    };

    return (
      <>
        <div className={styles.controlsRow}>
          <div className={styles.previewRow}>
            <div className={styles.previewWrap} ref={previewRef}>
              <DotIcon size={100} state={iconState} grid={gridSize} />

              <button
                type="button"
                className={styles["copySvgButton"]}
                onClick={copySvg}
              >
                {didCopy ? "COPIED" : "COPY"}
              </button>
            </div>
            <DotIcon size={20} state={iconState} grid={gridSize} />
          </div>
          <div className={styles.stateButtons}>
            {STATE_KEYS.map((key: StateKey) => {
              const active = iconState === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => seticonState(key)}
                  className={styles.stateButton}
                  data-active={active ? "true" : "false"}
                >
                  <span className={styles.stateButtonLabel}>
                    {getStateLabel(key)}
                  </span>
                </button>
              );
            })}
          </div>
          <label htmlFor="grid-size" className={styles.gridControl}>
            Grid
            <input
              id="grid-size"
              type="range"
              min={0}
              max={GRID_SIZE_OPTIONS.length - 1}
              step={1}
              value={gridSizeSliderIndex}
              onChange={(e) =>
                setGridSizeInput(
                  GRID_SIZE_OPTIONS[Number.parseInt(e.target.value, 10) ?? 0] ??
                    GRID_SIZE_OPTIONS[0],
                )
              }
              className={styles.gridSlider}
            />
            <span className={styles.gridValue}>
              {gridSizeInput}×{gridSizeInput}
            </span>
          </label>
        </div>
        <div className={`${styles.row} ${styles.inSitu}`}>
          <div className={`${styles.column} ${styles.card}`} data-label="CTA">
            <button type="button" className={styles.button}>
              <DotIcon size={16} state={iconState} grid={4} />
              Generate
            </button>
          </div>

          <div
            className={`${styles.column} ${styles.card} ${styles.cardTable}`}
            data-label="Table"
          >
            <table className={styles.table}>
              <tbody>
                <tr>
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                </tr>
                <tr>
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                </tr>
                <tr>
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                </tr>
                <tr>
                  <th />
                  <th>Name</th>
                  <th>Status</th>
                  <th>Amt</th>
                  <th />
                </tr>
                <tr>
                  <td />
                  <td>Invoice #041</td>
                  <td>
                    <span className={styles.cell}>
                      <DotIcon size={12} state={iconState} grid={3} />
                      Active
                    </span>
                  </td>
                  <td>$1,200</td>
                  <td />
                </tr>
                <tr>
                  <td />
                  <td>Invoice #040</td>
                  <td>
                    <span style={{ color: "var(--ui-tertiary)" }}>Closed</span>
                  </td>
                  <td>$800</td>
                  <td />
                </tr>
                <tr>
                  <td />
                  <td>Invoice #039</td>
                  <td>
                    <span style={{ color: "var(--ui-tertiary)" }}>Closed</span>
                  </td>
                  <td>$3,400</td>
                  <td />
                </tr>
                <tr>
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                </tr>
                <tr>
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                </tr>
                <tr>
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          <div
            className={`${styles.column} ${styles.card} ${styles.cardSocial}`}
            data-label="Social"
          >
            <DotIcon size={100} state={iconState} grid={7} />
          </div>

          <AIChat data-label="Chat" />

          <div
            className={`${styles.column} ${styles.card}`}
            data-label="Gradient"
          ></div>
          <div
            className={`${styles.column} ${styles.card}`}
            data-label="Color"
          ></div>
        </div>

        <ExposeProps
          className={`${styles.grid}`}
          ignoreProps={["grid", "size"]}
        >
          <DotIcon size={72} state={"dormant"} />
          <DotIcon size={24} state={"dormant"} />
          <DotIcon size={16} state={"dormant"} grid={3} />

          <DotIcon size={72} state={"hover"} />
          <DotIcon size={24} state={"hover"} />
          <DotIcon size={16} state={"hover"} grid={3} />

          <DotIcon size={72} state={"thinking"} />
          <DotIcon size={24} state={"thinking"} />
          <DotIcon size={16} state={"thinking"} grid={3} />

          <DotIcon size={72} state={"compiling"} />
          <DotIcon size={24} state={"compiling"} />
          <DotIcon size={16} state={"compiling"} grid={3} />

          <DotIcon size={72} state={"organizing"} />
          <DotIcon size={24} state={"organizing"} />
          <DotIcon size={16} state={"organizing"} grid={3} />

          <DotIcon size={72} state={"loading"} />
          <DotIcon size={24} state={"loading"} />
          <DotIcon size={16} state={"loading"} grid={3} />

          <DotIcon size={72} state={"indexing"} />
          <DotIcon size={24} state={"indexing"} />
          <DotIcon size={16} state={"indexing"} grid={3} />

          <DotIcon size={72} state={"success"} />
          <DotIcon size={24} state={"success"} />
          <DotIcon size={16} state={"success"} grid={3} />

          <DotIcon size={72} state={"error"} />
          <DotIcon size={24} state={"error"} />
          <DotIcon size={16} state={"error"} grid={3} />
        </ExposeProps>
      </>
    );
  },
});
