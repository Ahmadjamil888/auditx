// ─── AuditX Policy Learner ────────────────────────────────────────────────────
// After 3 consecutive approvals / rejections of the same action pattern,
// this module updates org_policy_config to bake the decision in permanently.

import { supabase } from "./supabase";
import type { OrgPolicyConfig } from "./policy-engine";

interface ApprovalRecord {
  action_type: string;
  policy_tier: string;
  status:      string;
}

export async function learnFromDecision(
  orgId:      string,
  actionType: string,
  decision:   "approved" | "rejected",
): Promise<void> {
  // Count recent decisions of the same type
  const { data: recent } = await supabase
    .from("agent_approvals")
    .select("action_type, policy_tier, status")
    .eq("org_id", orgId)
    .eq("action_type", actionType)
    .eq("status", decision)
    .order("created_at", { ascending: false })
    .limit(5);

  const streak = (recent ?? []).filter((r: ApprovalRecord) => r.status === decision).length;
  if (streak < 3) return;

  // Load current config
  const { data: cfg } = await supabase
    .from("org_policy_config")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();

  if (!cfg) return;

  if (decision === "approved") {
    // Add to allowed_auto_actions if not already present
    const current: string[] = (cfg.allowed_auto_actions as string[]) ?? [];
    if (!current.includes(actionType)) {
      await supabase
        .from("org_policy_config")
        .update({ allowed_auto_actions: [...current, actionType], updated_at: new Date().toISOString() } as never)
        .eq("org_id", orgId);
    }
  } else if (decision === "rejected") {
    // Remove from allowed_auto_actions
    const current: string[] = (cfg.allowed_auto_actions as string[]) ?? [];
    await supabase
      .from("org_policy_config")
      .update({
        allowed_auto_actions: current.filter((a) => a !== actionType),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("org_id", orgId);
  }
}
