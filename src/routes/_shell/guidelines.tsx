import { createFileRoute } from "@tanstack/react-router";
import styles from "../../index.module.css";
import { ExposeProps } from "#/components/ExposeProps/ExposeProps";
import DotIcon, {
  STATE_KEYS,
  getStateUsage,
} from "#/components/DotIcon/DotIcon";

const StateKeyList = () => {
  const filteredStates = STATE_KEYS.filter((key) => key !== "dev");
  return (
    <>
      {filteredStates.map((key, i) => (
        <span key={key}>
          {i === 0 ? "" : i === filteredStates.length - 1 ? ", or " : ", "}
          <strong>{key}</strong>
        </span>
      ))}
    </>
  );
};

const GuidelinesPage = () => {
  return (
    <main className={styles.prose}>
      <h1>Guidelines</h1>

      <p>
        The Stacks AI icon is a state-machine icon built on a dynamic 3D
        coordinate system, rendered as SVG. Works as a single state, but
        supports motion transitions between any two states.
      </p>

      <h1>Properties</h1>
      <ul>
        <li>
          <code>state</code> can be set to <StateKeyList />.
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
          <code>size</code> width/height in pixels, defaults to{" "}
          <strong>24px</strong>.
          <ExposeProps className={styles.prop} ignoreProps={["state", "grid"]}>
            <DotIcon size={16} state={"loading"} grid={4} />
            <DotIcon state={"loading"} grid={4} />
          </ExposeProps>
        </li>
        <li>
          <code>color</code> Defaults to currentColor which inherits the color
          of the parent. Set for explicit color control.
          <ExposeProps
            className={styles.prop}
            ignoreProps={["state", "grid", "size"]}
          >
            <DotIcon
              size={24}
              state={"thinking"}
              grid={4}
              color="light-dark(#011D28, #9EEBFF)"
            />
            <DotIcon size={24} state={"thinking"} grid={4} color="#1E91AF" />
            <DotIcon size={24} state={"thinking"} grid={4} />
          </ExposeProps>
        </li>
      </ul>

      <h1>States</h1>
      <ul>
        {STATE_KEYS.map((key) => (
          <li key={key}>
            <code>{key}</code> {getStateUsage(key)}
          </li>
        ))}
      </ul>

      <h1>Embedding & Assets</h1>
      <p>
        The playground can copy the current SVG to the clipboard — useful for
        mocks, specs, or one-off assets. For product UI, prefer the React
        component as it includes all motion logic.
      </p>

      <h1>Code Hygiene</h1>
      <ul>
        <li>
          Avoid changing icon state by replacing it with a new component
          instance. This will reset the animation phase and cause a jarring
          transition. For smooth transitions between two states, modify the{" "}
          <code>state</code> prop directly.
        </li>
        <li>
          Do not render more than <strong>10</strong> animated instances on the
          same page indefinitely. This is resource intensive and will cause
          performance issues. Once an animation is complete, it should revert to
          a static state such as <code>dormant</code>.
        </li>
        <li>
          Do not use high resolution grids (e.g. <strong>7</strong>) for product
          UI. It's illegible and resource intensive. Larger grid should only be
          used for introductory content or branding purposes.
        </li>
      </ul>

      <h1>Types & Helpers</h1>
      <p>
        Use the exported types and helpers — `StateKey`, `STATE_KEYS`,
        `getStateLabel`, `getStateUsage` — when building menus, tests, or
        documentation that list states in one place.
      </p>
    </main>
  );
};

export const Route = createFileRoute("/_shell/guidelines")({
  component: GuidelinesPage,
});
