import { createFileRoute } from "@tanstack/react-router";
import DotIcon from "../components/DotIcon/DotIcon";

export const Route = createFileRoute("/")({
  component: () => (
    <>
      <DotIcon />
    </>
  ),
});
