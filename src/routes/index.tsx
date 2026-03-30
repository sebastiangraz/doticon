import { createFileRoute } from "@tanstack/react-router";
import DotIcon from "../components/DotIcon/DotIcon";
import DotIcon3D from "../components/DotIcon3D/DotIcon3D";
export const Route = createFileRoute("/")({
  component: () => (
    <>
      <DotIcon />
      <h1>DotIcon3D</h1>
      <DotIcon3D size={100} />
    </>
  ),
});
