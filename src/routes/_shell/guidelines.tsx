import { createFileRoute } from "@tanstack/react-router";
import styles from "../../index.module.css";

export const Route = createFileRoute("/_shell/guidelines")({
  component: () => (
    <>
      <h1>Guidelines</h1>
      <p>
        Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam, quos.
      </p>
    </>
  ),
});
