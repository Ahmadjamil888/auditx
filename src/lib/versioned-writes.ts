// ─── AuditX Versioned Writes ──────────────────────────────────────────────────
// Every agent write snapshots the row before mutating it.
// revertRun restores all snapshots for a run atomically via a Postgres function.

import { supabase } from "./supabase";
import type { PolicyTier } from "./policy-engine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SourceProvenance {
  document_id?:   string;
  document_page?: number;
  source_type?:   string;
  trigger_type?:  string;
  agent_run_id?:  string;
}

// ── Snapshot + write ──────────────────────────────────────────────────────────
// 1. Reads the current row to capture a before-snapshot
// 2. Inserts a transaction_versions row
// 3. Applies the update
// Returns the updated transaction row.

export async function snapshotAndWrite(
  orgId:       string,
  runId:       string,
  policyTier:  PolicyTier,
  txId:        string,
  updates:     Record<string, unknown>,
  provenance:  SourceProvenance = {},
): Promise<Record<string, unknown>> {
  // 1. Fetch current row for snapshot
  const { data: current, error: fetchErr } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", txId)
    .eq("org_id", orgId)
    .single();

  if (fetchErr || !current) {
    throw new Error(`snapshotAndWrite: transaction ${txId} not found`);
  }

  // 2. Insert version row
  const { error: verErr } = await supabase
    .from("transaction_versions")
    .insert({
      transaction_id:    txId,
      org_id:            orgId,
      run_id:            runId,
      snapshot:          current as never,
      policy_tier:       policyTier,
      source_provenance: { ...provenance, agent_run_id: runId } as never,
    });

  if (verErr) {
    throw new Error(`snapshotAndWrite: version insert failed — ${verErr.message}`);
  }

  // 3. Apply update (tag source with run_id for loop prevention)
  const sourceTag = {
    ...(typeof current["source"] === "object" && current["source"] !== null
      ? (current["source"] as Record<string, unknown>)
      : {}),
    agent_run_id: runId,
    policy_tier:  policyTier,
  };

  const { data: updated, error: updateErr } = await supabase
    .from("transactions")
    .update({ ...updates, source: sourceTag } as never)
    .eq("id", txId)
    .eq("org_id", orgId)
    .select()
    .single();

  if (updateErr || !updated) {
    throw new Error(`snapshotAndWrite: update failed — ${updateErr?.message}`);
  }

  return updated as Record<string, unknown>;
}

// ── Revert a single run via the Postgres function ─────────────────────────────

export async function revertRun(runId: string): Promise<number> {
  const { data, error } = await supabase.rpc("revert_run", { p_run_id: runId });
  if (error) throw new Error(`revertRun failed: ${error.message}`);
  return (data as number) ?? 0;
}

// ── Write audit log entry ─────────────────────────────────────────────────────

export async function writeAuditEntry(
  orgId:      string,
  actor:      string,
  action:     string,
  entityType: string,
  entityId:   string,
  payload:    Record<string, unknown>,
  runId?:     string,
  policyTier?: PolicyTier,
): Promise<void> {
  const encoded  = new TextEncoder().encode(`${Date.now()}-${action}-${entityId}-${actor}`);
  const digest   = await crypto.subtle.digest("SHA-256", encoded);
  const hash     = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  await supabase
    .from("audit_log")
    .insert({
      org_id:      orgId,
      actor,
      action,
      entity_type: entityType,
      entity_id:   entityId,
      payload:     payload as never,
      prev_hash:   "",
      hash,
      run_id:      runId ?? null,
      policy_tier: policyTier ?? null,
    } as never)
    .then(() => undefined, (e: unknown) => {
      console.warn("[AuditX] audit_log insert failed (non-fatal):", e);
    });
}
