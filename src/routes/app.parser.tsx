import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";

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
  component: ParserIndex,
});

function ParserIndex() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (loading || !user || !profile?.org_id || started.current) return;
    started.current = true;

    void (async () => {
      const { data: existing } = await supabase
        .from("chat_threads")
        .select("id")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1);

      const found = existing?.[0]?.id;
      if (found) {
        navigate({ to: "/app/parser/$threadId", params: { threadId: found }, replace: true });
        return;
      }

      const { data: created, error } = await supabase
        .from("chat_threads")
        .insert({ org_id: profile.org_id, user_id: user.id, title: "New audit" })
        .select("id")
        .single();

      if (error || !created) {
        started.current = false;
        toast.error(error?.message ?? "Could not open the AI workspace");
        return;
      }
      navigate({ to: "/app/parser/$threadId", params: { threadId: created.id }, replace: true });
    })();
  }, [loading, user, profile?.org_id, navigate]);

  return (
    <div className="flex h-[70vh] items-center justify-center">
      <Shimmer>Opening your AI workspace…</Shimmer>
    </div>
  );
}
