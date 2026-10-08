// ─── AuditX Sheets Poller — Supabase Edge Function ───────────────────────────
// Polls every connected Google Sheet for content changes.
// Uses SHA-256 hash diff — only enqueues a job when content actually changes.
// Loop prevention: skips sheets whose latest hash was produced by an agent run.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Hash a string using Web Crypto (available in Deno/Edge) ──────────────────
async function sha256(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const buf     = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Fetch CSV from a Google Sheet (must be shared publicly) ──────────────────
async function fetchSheetCSV(externalId: string, token?: string): Promise<string | null> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // Try export URL (works for sheets shared as "Anyone with link")
  const exportUrl = `https://docs.google.com/spreadsheets/d/${externalId}/export?format=csv`;

  try {
    const res = await fetch(exportUrl, { headers, redirect: "follow" });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("csv") && !ct.includes("text")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ── Check loop-prevention: was the last hash produced by an agent write? ──────
async function wasAgentWrite(orgId: string, hash: string): Promise<boolean> {
  const { data } = await db
    .from("agent_jobs")
    .select("result_summary")
    .eq("org_id", orgId)
    .eq("status", "done")
    .gte("updated_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .limit(20);

  return (data ?? []).some(
    (j) => (j.result_summary as Record<string, unknown> | null)?.["output_hash"] === hash,
  );
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (_req: Request) => {
  const { data: sources, error } = await db
    .from("connected_sources")
    .select("id,org_id,external_id,last_hash,paused,rules")
    .eq("source_type", "google_sheets")
    .eq("paused", false);

  if (error) {
    console.error("[sheets-poller] fetch sources:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let enqueued = 0;
  let skipped  = 0;

  for (const source of sources ?? []) {
    try {
      const csv = await fetchSheetCSV(source.external_id as string);
      if (!csv) { skipped++; continue; }

      const newHash = await sha256(csv);
      const oldHash = source.last_hash as string | null;

      // No change
      if (newHash === oldHash) { skipped++; continue; }

      // Loop prevention: this hash was produced by an agent write
      if (await wasAgentWrite(source.org_id as string, newHash)) {
        await db
          .from("connected_sources")
          .update({ last_hash: newHash, updated_at: new Date().toISOString() } as never)
          .eq("id", source.id);
        skipped++;
        continue;
      }

      // Enqueue ingestion job (idempotent on source_id:hash)
      const idempotencyKey = `sheet:${source.id as string}:${newHash}`;
      await db.from("agent_jobs").insert({
        org_id:          source.org_id,
        trigger_type:    "sheet_change",
        trigger_payload: { source_id: source.id, csv, new_hash: newHash } as never,
        idempotency_key: idempotencyKey,
        next_run_at:     // 8-second debounce
          new Date(Date.now() + 8_000).toISOString(),
      } as never).then(
        () => undefined,
        (e: unknown) => {
          const code = (e as { code?: string })?.code;
          if (code !== "23505") console.warn("[sheets-poller] enqueue err:", e);
        },
      );

      // Update stored hash immediately so the next tick sees the new baseline
      await db
        .from("connected_sources")
        .update({ last_hash: newHash, last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() } as never)
        .eq("id", source.id);

      enqueued++;
    } catch (e) {
      console.warn("[sheets-poller] source", source.id, (e as Error)?.message);
    }
  }

  return new Response(JSON.stringify({ enqueued, skipped }), { status: 200 });
});
