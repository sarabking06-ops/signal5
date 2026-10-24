import { createFileRoute } from "@tanstack/react-router";
import { Scanner } from "@/components/scanner";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <Scanner />;
}
