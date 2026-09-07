import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/")({
  beforeLoad: () => {
    throw redirect({ to: "/app/parser", replace: true });
  },
  component: () => null,
});
