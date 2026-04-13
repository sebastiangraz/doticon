import { createFileRoute } from "@tanstack/react-router";
import styles from "../../index.module.css";
export const Route = createFileRoute("/_shell/guidelines")({
  component: () => (
    <main className={styles.prose}>
      <h1>DotIcon — usage guidelines</h1>

      <p>
        DotIcon is a small stateful icon: an N×N dot grid drawn as SVG, driven
        by a fixed set of visual states. Use it anywhere you need a consistent
        “AI / activity” indicator next to labels, buttons, tables, or chat.
      </p>

      <h1>Props you actually set</h1>
      <ul>
        <li>
          <code>state</code> — one of: dormant, thinking, loading. Pick the one
          that matches the moment (idle, working, in progress). A dev layout
          exists for engineering builds only; in production it behaves like
          dormant unless explicitly enabled.
        </li>
        <li>
          <code>grid</code> — integer N for an N×N grid (default 4). Treat 3 as
          the small tier, 4 as the default, and 5+ when you need a denser or
          more custom mark. Note: dormant at grid 3 uses an internal 4×4 dot
          layout for the logo pattern, so switching between dormant and other
          states at grid 3 is a full layout change, same as changing grid size.
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
