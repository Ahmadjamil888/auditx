import { createFileRoute } from "@tanstack/react-router";
// import { ParserWorkspace } from "@/components/agent/ParserWorkspace";

export const Route = createFileRoute("/app/parser/$threadId")({
  head: () => ({
    meta: [
      { title: "Audit Workspace | AuditX" },
      { name: "description", content: "Review broker documents, reconcile trades, and approve ledger updates with the AuditX agent." },
      { property: "og:title", content: "Audit Workspace | AuditX" },
      { property: "og:description", content: "AI-assisted trade reconciliation with approval-gated ledger execution." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  return /* <ParserWorkspace key={threadId} threadId={threadId} /> */;
}