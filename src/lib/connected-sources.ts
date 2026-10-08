// ─── AuditX Connected Sources ─────────────────────────────────────────────────
// Client-side CRUD for connected_sources table.
// OAuth token encryption happens server-side via Supabase Vault.

import { supabase } from "./supabase";

export type SourceType = "google_sheets" | "onedrive" | "email_inbox" | "folder";

export interface ConnectedSource {
  id:            string;
  org_id:        string;
  source_type:   SourceType;
  external_id:   string;
  display_name:  string;
  last_etag:     string | null;
  last_hash:     string | null;
  watch_expiry:  string | null;
  paused:        boolean;
  rules:         SourceRules;
  last_synced_at: string | null;
  created_at:    string;
  updated_at:    string;
}

export interface SourceRules {
  auto_import?:                  boolean;
  confidence_threshold_override?: number;
  never_overwrite_before_date?:  string;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function fetchConnectedSources(orgId: string): Promise<ConnectedSource[]> {
  const { data, error } = await supabase
    .from("connected_sources")
    .select("id,org_id,source_type,external_id,display_name,last_etag,last_hash,watch_expiry,paused,rules,last_synced_at,created_at,updated_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as ConnectedSource[];
}

export async function updateSourceRules(
  sourceId: string,
  rules:    SourceRules,
): Promise<void> {
  const { error } = await supabase
    .from("connected_sources")
    .update({ rules: rules as never, updated_at: new Date().toISOString() } as never)
    .eq("id", sourceId);
  if (error) throw new Error(error.message);
}

export async function pauseSource(sourceId: string, paused: boolean): Promise<void> {
  const { error } = await supabase
    .from("connected_sources")
    .update({ paused, updated_at: new Date().toISOString() } as never)
    .eq("id", sourceId);
  if (error) throw new Error(error.message);
}

export async function deleteSource(sourceId: string): Promise<void> {
  const { error } = await supabase
    .from("connected_sources")
    .delete()
    .eq("id", sourceId);
  if (error) throw new Error(error.message);
}

// ── Google Sheets OAuth helper (client side — opens popup) ───────────────────
// The actual OAuth exchange happens server-side in /api/auth/google/callback.
export function startGoogleOAuth(orgId: string): void {
  const params = new URLSearchParams({
    org_id:        orgId,
    redirect_back: window.location.pathname,
  });
  window.location.href = `/api/auth/google/start?${params.toString()}`;
}

// ── OneDrive OAuth helper ─────────────────────────────────────────────────────
export function startOneDriveOAuth(orgId: string): void {
  const params = new URLSearchParams({
    org_id:        orgId,
    redirect_back: window.location.pathname,
  });
  window.location.href = `/api/auth/onedrive/start?${params.toString()}`;
}
