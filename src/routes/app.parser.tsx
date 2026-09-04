import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/parser")({
  head: () => ({
    meta: [
      { title: "AI Workspace | AuditX" },
      {
        name: "description",
        content: "Chat with the AuditX agent to parse broker documents, reconcile trades and update your ledger.",
      },
      { property: "og:title", content: "AI Workspace | AuditX" },
      { property: "og:description", content: "Agentic trade reconciliation with approval-gated ledger writes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <Outlet />,
});
