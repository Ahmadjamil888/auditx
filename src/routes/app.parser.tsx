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
    console.log("[AuditX] Opening AI workspace for user:", user.id);
    setFailure(null);

    console.log("[AuditX] Looking for existing chat threads...");
    const { data: existing, error: listError } = await supabase
      .from("chat_threads")
      .select("id")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (listError) {
      console.error("[AuditX] Failed to list chat threads:", listError.message, listError);
    } else {
      console.log("[AuditX] Existing chat threads:", existing?.length ?? 0);
    }

    const found = existing?.[0]?.id;
    if (found) {
      console.log("[AuditX] Found existing thread, navigating to:", found);
      navigate({ to: "/app/parser/$threadId", params: { threadId: found }, replace: true });
      return;
    }

    // RLS requires org_id to be one of the caller's organisations, so resolve it first.
    console.log("[AuditX] No existing thread found, resolving org_id...");
    let orgId = profile?.org_id ?? null;
    console.log("[AuditX] Profile org_id:", orgId);
    
    if (!orgId) {
      console.log("[AuditX] No org_id in profile, fetching from database...");
      const { data: prof, error: profError } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (profError) {
        console.error("[AuditX] Failed to fetch profile:", profError.message, profError);
      } else {
        console.log("[AuditX] Profile from database:", prof);
      }
      
      orgId = prof?.org_id ?? null;
      console.log("[AuditX] Org_id from database:", orgId);
      
      if (!orgId) {
        console.log("[AuditX] Still no org_id, triggering profile refresh...");
        // Trigger self-provisioning of organisation + profile, then re-read.
        await refreshProfile();
        console.log("[AuditX] Profile refresh completed, retrying profile fetch...");
        const { data: retry, error: retryError } = await supabase
          .from("profiles")
          .select("org_id")
          .eq("user_id", user.id)
          .maybeSingle();
        
        if (retryError) {
          console.error("[AuditX] Failed to retry profile fetch:", retryError.message, retryError);
        } else {
          console.log("[AuditX] Retry profile result:", retry);
        }
        
        orgId = retry?.org_id ?? null;
        console.log("[AuditX] Org_id after retry:", orgId);
      }
    }

    if (!orgId) {
      console.error("[AuditX] Could not resolve org_id after all attempts");
      started.current = false;
      setFailure("We couldn't find your workspace organisation yet. Try again in a moment.");
      return;
    }

    console.log("[AuditX] Creating new chat thread with org_id:", orgId);
    const { data: created, error } = await supabase
      .from("chat_threads")
      .insert({ user_id: user.id, org_id: orgId, title: "New audit" } as never)
      .select("id")
      .single();

    if (error || !created) {
      console.error("[AuditX] Failed to create chat thread:", error?.message, error);
      started.current = false;
      setFailure(error?.message ?? listError?.message ?? "Could not open the AI workspace.");
      return;
    }

    console.log("[AuditX] Chat thread created successfully, id:", created.id);
    navigate({ to: "/app/parser/$threadId", params: { threadId: created.id }, replace: true });
  }, [user, profile?.org_id, navigate, refreshProfile]);

  useEffect(() => {
    console.log("[AuditX] ParserIndex useEffect - loading:", loading, "user:", !!user, "started:", started.current);
    if (loading || !user || started.current) return;
    console.log("[AuditX] ParserIndex starting open()...");
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
