// ─── AuditX OneDrive Poller — Supabase Edge Function ─────────────────────────
// Polls connected OneDrive sources for file changes using Microsoft Graph.
// Uses eTag / SHA-256 hash diff — only enqueues a job when content changes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function sha256(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const buf     = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface TokenStore {
  access_token:  string;
  refresh_token: string;
  expires_at:    number;
}

async function refreshToken(tokenStore: TokenStore): Promise<TokenStore | null> {
  const clientId     = Deno.env.get("MICROSOFT_CLIENT_ID")     ?? "";
  const clientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET") ?? "";
  const tenantId     = Deno.env.get("MICROSOFT_TENANT_ID")     ?? "common";

  if (!clientId || !clientSecret || !tokenStore.refresh_token) return null;

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        refresh_token: tokenStore.refresh_token,
        grant_type:    "refresh_token",
        scope:         "Files.Read Files.Read.All offline_access",
      }),
    },
  );
  if (!res.ok) return null;

  const data = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token ?? tokenStore.refresh_token,
    expires_at:    Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

async function fetchDriveItemContent(
  fileId:       string,
  accessToken:  string,
): Promise<string | null> {
  // Get download URL
  const metaRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`,
    {
      headers:  { Authorization: `Bearer ${accessToken}` },
      redirect: "manual",
    },
  );

  // Graph returns 302 with download URL in Location
  const downloadUrl = metaRes.headers.get("location") ?? "";
  if (!downloadUrl) return null;

  const fileRes = await fetch(downloadUrl);
  if (!fileRes.ok) return null;

  return await fileRes.text();
}

Deno.serve(async (_req: Request) => {
  const { data: sources } = await db
    .from("connected_sources")
    .select("id,org_id,external_id,last_hash,paused,oauth_token_encrypted")
    .eq("source_type", "onedrive")
    .eq("paused", false);

  let enqueued = 0;
  let skipped  = 0;

  for (const source of sources ?? []) {
    try {
      const rawToken = source.oauth_token_encrypted as string | null;
      if (!rawToken) { skipped++; continue; }

      let tokenStore: TokenStore = JSON.parse(rawToken);

      // Refresh token if expired
      if (Date.now() > tokenStore.expires_at - 60_000) {
        const refreshed = await refreshToken(tokenStore);
        if (!refreshed) { skipped++; continue; }
        tokenStore = refreshed;
        // Persist refreshed token
        await db
          .from("connected_sources")
          .update({ oauth_token_encrypted: JSON.stringify(tokenStore), updated_at: new Date().toISOString() } as never)
          .eq("id", source.id);
      }

      // external_id format: "onedrive:email" for drive root, or "item:<fileId>" for a specific file
      const externalId = source.external_id as string;
      const fileId     = externalId.startsWith("item:") ? externalId.slice(5) : null;
      if (!fileId) { skipped++; continue; } // no specific file chosen yet

      const content = await fetchDriveItemContent(fileId, tokenStore.access_token);
      if (!content) { skipped++; continue; }

      const newHash = await sha256(content);
      const oldHash = source.last_hash as string | null;

      if (newHash === oldHash) { skipped++; continue; }

      const idempotencyKey = `onedrive:${source.id as string}:${newHash}`;
      await db.from("agent_jobs").insert({
        org_id:          source.org_id,
        trigger_type:    "sheet_change",
        trigger_payload: { source_id: source.id, csv: content, new_hash: newHash, source_type: "onedrive" } as never,
        idempotency_key: idempotencyKey,
        next_run_at:     new Date(Date.now() + 8_000).toISOString(),
      } as never).then(
        () => undefined,
        (e: unknown) => {
          if ((e as { code?: string })?.code !== "23505") console.warn("[onedrive-poller]", e);
        },
      );

      await db
        .from("connected_sources")
        .update({ last_hash: newHash, last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() } as never)
        .eq("id", source.id);

      enqueued++;
    } catch (e) {
      console.warn("[onedrive-poller] source", source.id, (e as Error)?.message);
    }
  }

  return new Response(JSON.stringify({ enqueued, skipped }), { status: 200 });
});
