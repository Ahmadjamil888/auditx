// ─── Agent Approval Endpoint ──────────────────────────────────────────────────
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/agent/approve")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

        const body = await request.json() as { approval_id?: string; decision?: string };
        const { approval_id, decision } = body;

        if (!approval_id || !["approved", "rejected", "skipped"].includes(decision ?? "")) {
          return new Response("approval_id and decision are required", { status: 400 });
        }

        const supabaseUrl = process.env["SUPABASE_URL"] ?? (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) ?? "";
        const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined) ?? (import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined) ?? "";
        const db = createClient<Database>(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: auth } },
          auth:   { persistSession: false, autoRefreshToken: false },
        });

        const { data: { user }, error: authErr } = await db.auth.getUser();
        if (authErr || !user) return new Response("Unauthorized", { status: 401 });

        // Verify the approval belongs to this user's org
        const { data: prof } = await db.from("profiles").select("org_id,role").eq("user_id", user.id).maybeSingle();
        if (!prof || !["owner","admin"].includes(prof.role)) {
          return new Response("Forbidden — owner or admin required", { status: 403 });
        }

        const { error: updateErr } = await db
          .from("agent_approvals")
          .update({
            status:     decision,
            decided_by: user.id,
            decided_at: new Date().toISOString(),
          } as never)
          .eq("id", approval_id)
          .eq("org_id", prof.org_id);

        if (updateErr) return new Response(updateErr.message, { status: 500 });

        // If approved, apply the action payload (simplified — full impl in Edge Fn)
        if (decision === "approved") {
          const { data: approval } = await db
            .from("agent_approvals")
            .select("action_type, action_payload")
            .eq("id", approval_id)
            .maybeSingle();

          if (approval?.action_type === "insert_transaction" && approval.action_payload) {
            const p = approval.action_payload as Record<string, unknown>;
            await db.from("transactions").insert({
              ...p,
              org_id: prof.org_id,
              source: { via: "human_approved", approved_by: user.email ?? user.id } as never,
            } as never).then(() => undefined, () => undefined);
          }
        }

        return new Response(JSON.stringify({ ok: true, decision }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    } as never,
  },
});
