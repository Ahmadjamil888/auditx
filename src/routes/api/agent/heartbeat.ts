// ─── Agent Heartbeat Route ────────────────────────────────────────────────────
// Called on app load (from useAgentHeartbeat hook).
// Invokes schedule_heartbeat() which idempotently enqueues nightly / monthly
// jobs when the clock window matches — no pg_cron required.
// Then pokes the agent-runner Edge Function to process any pending jobs.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/agent/heartbeat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }

        const supabaseUrl = process.env["SUPABASE_URL"]
          ?? (import.meta.env["VITE_SUPABASE_URL"] as string | undefined)
          ?? "";
        const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"]
          ?? (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined)
          ?? (import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined)
          ?? "";

        const db = createClient<Database>(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: auth } },
          auth:   { persistSession: false, autoRefreshToken: false },
        });

        // Verify session
        const { data: { user }, error: authErr } = await db.auth.getUser();
        if (authErr || !user) return new Response("Unauthorized", { status: 401 });

        // Call the schedule function (idempotent — safe to call frequently)
        const { data: scheduleResult, error: schedErr } = await db.rpc("schedule_heartbeat");
        if (schedErr) {
          console.warn("[heartbeat] schedule_heartbeat error:", schedErr.message);
        }

        // Poke the agent-runner to process any pending jobs (fire-and-forget)
        const runnerUrl = supabaseUrl.replace("supabase.co", "supabase.co/functions/v1/agent-runner");
        const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
        if (serviceKey) {
          fetch(runnerUrl, {
            method:  "POST",
            headers: {
              Authorization:  `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ trigger: "heartbeat" }),
          }).catch((e: unknown) => console.warn("[heartbeat] runner poke failed:", e));
        }

        return new Response(
          JSON.stringify({ ok: true, schedule: scheduleResult ?? null }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    } as never,
  },
});
