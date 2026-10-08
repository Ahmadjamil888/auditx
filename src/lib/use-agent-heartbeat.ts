// ─── useAgentHeartbeat ────────────────────────────────────────────────────────
// Called once per app session (from AppShell).
// Fires the heartbeat API route which idempotently enqueues scheduled jobs
// and pokes the agent-runner Edge Function to process pending work.
// Throttled to once per 5 minutes per browser tab via sessionStorage.

import { useEffect } from "react";
import { supabase } from "./supabase";

const THROTTLE_KEY = "auditx.heartbeat.last";
const THROTTLE_MS  = 5 * 60 * 1000; // 5 minutes

export function useAgentHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    // Throttle: skip if called recently in this tab
    const lastStr = sessionStorage.getItem(THROTTLE_KEY);
    if (lastStr) {
      const last = parseInt(lastStr, 10);
      if (!isNaN(last) && Date.now() - last < THROTTLE_MS) return;
    }

    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const res = await fetch("/api/agent/heartbeat", {
          method:  "POST",
          headers: {
            Authorization:  `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        });

        if (res.ok) {
          sessionStorage.setItem(THROTTLE_KEY, String(Date.now()));
        }
      } catch {
        // Heartbeat is best-effort — never block the app
      }
    })();
  }, [enabled]);
}
