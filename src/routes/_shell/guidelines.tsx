import { createFileRoute } from "@tanstack/react-router";
import styles from "../../index.module.css";
import { ExposeProps } from "#/components/ExposeProps/ExposeProps";
import DotIcon from "#/components/DotIcon/DotIcon";
export const Route = createFileRoute("/_shell/guidelines")({
  component: () => (
    <main className={styles.prose}>
      <h1>Intro</h1>

      <p>
        A state-machine icon built on a dynamic 3D coordinate system, rendered
        as SVG.
      </p>

      <h1>Props you actually set</h1>
      <ExposeProps className={styles.prop}>
        <DotIcon size={32} state={"dormant"} grid={4} />
      </ExposeProps>
      <ul>
        <li>
          <code>state</code> — one of: dormant, thinking, loading. Pick the one
          that matches the moment (idle, working, in progress).
        </li>
        <li>
          <code>grid</code> — integer N for an N×N grid. Treat <code>3</code> as
          the small tier, <code>4</code> as the default, and <code>5+</code>{" "}
          when you need a denser or more custom mark. Do not go above{" "}
          <code>7</code> as the code is not optimized for higher grids.
        </li>
        <li>
          <code>size</code> — width/height in pixels (default 200 in the
          component API; the playground uses other sizes in examples).
        </li>
        <li>
          <code>color</code> — optional. Dots use currentColor, so wrapping the
          icon in text with your UI color is usually enough.
        </li>
      </ul>

      <h1>When to use which state</h1>
      <ul>
        <li>
          <code>dormant</code> — static logotype-style mark; use for idle,
          success, or “ready” surfaces.
        </li>
        <li>
          <code>thinking</code> — slow sphere motion; use for open-ended work or
          “assistant is considering.”
        </li>
        <li>
          <code>loading</code> — column fill sweep; use for determinate or
          indeterminate progress where a crisp “working” read is enough.
        </li>
      </ul>

      <h1>Embedding and assets</h1>
      <p>
        The playground can copy the current SVG to the clipboard — useful for
        mocks, specs, or one-off assets. For product UI, prefer the React
        component so state and grid stay in sync with your app.
      </p>

      <h1>Exports</h1>
      <p>
        Use the exported types and helpers — StateKey, STATE_KEYS, getStateLabel
        — when building menus, tests, or documentation that list states in one
        place.
      </p>
    </main>
  ),
});
