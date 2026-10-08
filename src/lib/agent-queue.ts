// ─── AuditX Agent Queue Client ────────────────────────────────────────────────
// Client-side helpers for enqueuing and monitoring agent jobs.
// The actual job runner lives in supabase/functions/agent-runner/.

import { supabase } from "./supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

export type JobTriggerType =
  | "upload"
  | "sheet_change"
  | "email"
  | "cron_nightly"
  | "cron_monthly"
  | "manual"
  | "ingestion";

export type JobStatus =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "failed_invariant"
  | "dead_letter";

export interface AgentJob {
  id:              string;
  org_id:          string;
  trigger_type:    JobTriggerType;
  trigger_payload: Record<string, unknown>;
  status:          JobStatus;
  run_id:          string | null;
  idempotency_key: string;
  attempt_count:   number;
  max_attempts:    number;
  next_run_at:     string;
  error_message:   string | null;
  result_summary:  Record<string, unknown> | null;
  created_at:      string;
  updated_at:      string;
}

// ── Enqueue a job (idempotent) ────────────────────────────────────────────────

export async function enqueueJob(
  orgId:          string,
  triggerType:    JobTriggerType,
  triggerPayload: Record<string, unknown> = {},
  idempotencyKey: string,
): Promise<AgentJob | null> {
  const { data, error } = await supabase
    .from("agent_jobs")
    .insert({
      org_id:          orgId,
      trigger_type:    triggerType,
      trigger_payload: triggerPayload as never,
      idempotency_key: idempotencyKey,
    } as never)
    .select()
    .single();

  if (error) {
    // 23505 = unique_violation → already enqueued, not an error
    if (error.code === "23505") return null;
    throw new Error(`enqueueJob failed: ${error.message}`);
  }

  // Trigger the runner Edge Function immediately (fire-and-forget)
  supabase.functions.invoke("agent-runner", { body: { job_id: data.id } })
    .catch((e: unknown) => console.warn("[AuditX] agent-runner invoke failed:", e));

  return data as AgentJob;
}

// ── Fetch recent jobs for an org ──────────────────────────────────────────────

export async function fetchRecentJobs(
  orgId: string,
  limit = 50,
): Promise<AgentJob[]> {
  const { data, error } = await supabase
    .from("agent_jobs")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as AgentJob[];
}

// ── Fetch pending approvals ───────────────────────────────────────────────────

export interface AgentApproval {
  id:             string;
  org_id:         string;
  job_id:         string | null;
  run_id:         string | null;
  action_type:    string;
  action_payload: Record<string, unknown>;
  policy_tier:    "REVIEW" | "STOP";
  status:         "pending" | "approved" | "rejected" | "skipped";
  decided_by:     string | null;
  decided_at:     string | null;
  created_at:     string;
}

export async function fetchPendingApprovals(orgId: string): Promise<AgentApproval[]> {
  const { data, error } = await supabase
    .from("agent_approvals")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as AgentApproval[];
}

// ── Approve / reject / skip ───────────────────────────────────────────────────

export async function decideApproval(
  approvalId: string,
  decision:   "approved" | "rejected" | "skipped",
  userId:     string,
): Promise<void> {
  const { error } = await supabase
    .from("agent_approvals")
    .update({
      status:     decision,
      decided_by: userId,
      decided_at: new Date().toISOString(),
    } as never)
    .eq("id", approvalId);

  if (error) throw new Error(error.message);
}

// ── Revert a run via the Postgres function ────────────────────────────────────

export async function revertRun(runId: string): Promise<number> {
  const { data, error } = await supabase.rpc("revert_run", { p_run_id: runId });
  if (error) throw new Error(`revertRun failed: ${error.message}`);
  return (data as number) ?? 0;
}

// ── Trigger an immediate manual run ──────────────────────────────────────────

export async function triggerManualRun(
  orgId:   string,
  payload: Record<string, unknown> = {},
): Promise<AgentJob | null> {
  const key = `manual:${orgId}:${Date.now()}`;
  return enqueueJob(orgId, "manual", payload, key);
}
