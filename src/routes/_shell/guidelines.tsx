import { createFileRoute } from "@tanstack/react-router";
import styles from "../../index.module.css";
import { ExposeProps } from "#/components/ExposeProps/ExposeProps";
import DotIcon from "#/components/DotIcon/DotIcon";
export const Route = createFileRoute("/_shell/guidelines")({
  component: () => (
    <main className={styles.prose}>
      <h1>Guidelines</h1>

      <p>
        The Stacks AI icon is a state-machine icon built on a dynamic 3D
        coordinate system, rendered as SVG.
      </p>

      <h1>Properties</h1>
      <ul>
        <li>
          <code>state</code> one of <code>dormant</code>, <code>thinking</code>,{" "}
          <code>loading</code>.
          <ExposeProps className={styles.prop} ignoreProps={["grid", "size"]}>
            <DotIcon size={24} state={"dormant"} grid={4} />
            <DotIcon size={24} state={"thinking"} grid={4} />
            <DotIcon size={24} state={"processing"} grid={4} />
          </ExposeProps>
        </li>
        <li>
          <code>grid</code> integer N for an N×N grid. Treat <strong>3</strong>{" "}
          as the small tier, <strong>4</strong> as the default, and{" "}
          <strong>5+</strong> when you need a denser or more custom mark. Do not
          go above <strong>7</strong> as the code is not optimized for higher
          grids.
          <ExposeProps className={styles.prop} ignoreProps={["state", "size"]}>
            <DotIcon size={24} grid={3} />
            <DotIcon size={24} grid={7} />
          </ExposeProps>
        </li>
        <li>
          <code>size</code> width/height in pixels (default 200 in the component
          API; the playground uses other sizes in examples).
          <ExposeProps className={styles.prop} ignoreProps={["state", "grid"]}>
            <DotIcon size={12} state={"thinking"} grid={3} />
            <DotIcon size={24} state={"thinking"} grid={4} />
          </ExposeProps>
        </li>
        <li>
          <code>color</code> <strong>(optional)</strong>. Defaults to
          currentColor & inherits the color of the parent. Use for explicit
          color control.
          <ExposeProps
            className={styles.prop}
            ignoreProps={["state", "grid", "size"]}
          >
            <DotIcon
              size={24}
              state={"loading"}
              grid={4}
              color="light-dark(#011D28, #9EEBFF)"
            />
            <DotIcon size={24} state={"loading"} grid={4} color="#1E91AF" />
            <DotIcon size={24} state={"loading"} grid={4} />
          </ExposeProps>
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
