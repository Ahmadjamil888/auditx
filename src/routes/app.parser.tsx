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
  const { user, profile, loading, refreshProfile } = useAuth();
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

    // RLS requires org_id to be one of the caller's organisations, so resolve it first.
    let orgId = profile?.org_id ?? null;
    if (!orgId) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("user_id", user.id)
        .maybeSingle();
      orgId = prof?.org_id ?? null;
      if (!orgId) {
        // Trigger self-provisioning of organisation + profile, then re-read.
        await refreshProfile();
        const { data: retry } = await supabase
          .from("profiles")
          .select("org_id")
          .eq("user_id", user.id)
          .maybeSingle();
        orgId = retry?.org_id ?? null;
      }
    }

    if (!orgId) {
      started.current = false;
      setFailure("We couldn't find your workspace organisation yet. Try again in a moment.");
      return;
    }

    const { data: created, error } = await supabase
      .from("chat_threads")
      .insert({ user_id: user.id, org_id: orgId, title: "New audit" } as never)
      .select("id")
      .single();

    if (error || !created) {
      started.current = false;
      setFailure(error?.message ?? listError?.message ?? "Could not open the AI workspace.");
      return;
    }
    navigate({ to: "/app/parser/$threadId", params: { threadId: created.id }, replace: true });
  }, [user, profile?.org_id, navigate, refreshProfile]);

  useEffect(() => {
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
