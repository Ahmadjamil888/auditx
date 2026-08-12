import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const [failure, setFailure] = useState<string | null>(null);

  const open = useCallback(async () => {
    if (!user) return;
    setFailure(null);

    const { data: existing, error: listError } = await supabase
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

    const payload: { user_id: string; title: string; org_id?: string } = {
      user_id: user.id,
      title: "New audit",
    };
    if (profile?.org_id) payload.org_id = profile.org_id;

    const { data: created, error } = await supabase
      .from("chat_threads")
      .insert(payload as never)
      .select("id")
      .single();

    if (error || !created) {
      started.current = false;
      setFailure(error?.message ?? listError?.message ?? "Could not open the AI workspace.");
      return;
    }
    navigate({ to: "/app/parser/$threadId", params: { threadId: created.id }, replace: true });
  }, [user, profile?.org_id, navigate]);

  useEffect(() => {
    // Don't wait on organisation provisioning — a thread only needs the user.
    if (loading || !user || started.current) return;
    started.current = true;
    void open();
  }, [loading, user, open]);

  if (failure) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm" style={{ color: "var(--ink-2)" }}>
          {failure}
        </p>
        <button
          type="button"
          onClick={() => {
            started.current = true;
            void open();
          }}
          className="rounded-full px-4 py-2 text-xs font-semibold text-white"
          style={{ background: "var(--color-accent)" }}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[70vh] items-center justify-center">
      <Shimmer>Opening your AI workspace…</Shimmer>
    </div>
  );
}
