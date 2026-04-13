import { createFileRoute } from "@tanstack/react-router";
import styles from "../../index.module.css";

export const Route = createFileRoute("/_shell/guidelines")({
  component: () => (
    <main className={styles.guidelinesPage} aria-label="Guidelines" />
  ),
});
