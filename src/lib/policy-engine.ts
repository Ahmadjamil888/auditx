// ─── AuditX Policy Engine ─────────────────────────────────────────────────────
// Classifies every agent action into AUTO | NOTIFY | REVIEW | STOP.
// This is pure deterministic code — the LLM never makes tier decisions.

import { supabase } from "./supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PolicyTier = "AUTO" | "NOTIFY" | "REVIEW" | "STOP";

export interface AgentAction {
  /** Tool name e.g. 'insert_transaction', 'run_fifo', 'delete_transaction' */
  tool: string;
  /** 0–1 confidence from the extraction/classification model */
  confidence: number;
  /** What the action touches */
  affects: "source" | "ledger" | "flag" | "report" | "classification";
  /** Whether this deletes or overwrites user data */
  isDestructive: boolean;
  /** Whether the affected period is locked (before never_touch_closed_periods_before) */
  isClosedPeriod: boolean;
  /** Monetary size of the change in USD-equivalent for amount-based rules */
  amountUsd?: number;
}

export interface OrgPolicyConfig {
  auto_fix_duplicate_under_amount: number | null;
  never_touch_closed_periods_before: string | null;
  confidence_threshold_auto: number;
  confidence_threshold_notify: number;
  allowed_auto_actions: string[];
  daily_token_budget: number | null;
  daily_cost_budget_usd: number | null;
}

export interface PolicyContext {
  config: OrgPolicyConfig;
  runId: string;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_POLICY: OrgPolicyConfig = {
  auto_fix_duplicate_under_amount:   null,
  never_touch_closed_periods_before: null,
  confidence_threshold_auto:         0.90,
  confidence_threshold_notify:       0.75,
  allowed_auto_actions:              ["flag_anomaly", "run_fifo", "categorize", "remove_duplicate"],
  daily_token_budget:                null,
  daily_cost_budget_usd:             null,
};

// ── PolicyViolationError ──────────────────────────────────────────────────────

export class PolicyViolationError extends Error {
  constructor(
    public readonly tier: PolicyTier,
    public readonly tool: string,
    message: string,
  ) {
    super(message);
    this.name = "PolicyViolationError";
  }
}

// ── SchemaValidationError (exported here for convenience) ─────────────────────

export class SchemaValidationError extends Error {
  constructor(message: string, public readonly raw?: unknown) {
    super(message);
    this.name = "SchemaValidationError";
  }
}

// ── Core classifier ───────────────────────────────────────────────────────────

export function classifyAction(action: AgentAction, ctx: PolicyContext): PolicyTier {
  const cfg = ctx.config;

  // ── STOP: hard overrides (order matters) ──────────────────────────────────
  if (action.isDestructive)              return "STOP";
  if (action.affects === "source")       return "STOP";
  if (action.isClosedPeriod)             return "STOP";
  if (action.tool === "export_tax_report") return "STOP";
  if (action.tool === "delete_transaction") return "STOP";
  if (action.tool === "overwrite_source")   return "STOP";

  // ── AUTO: fast-path for allowed tools at high confidence ──────────────────
  const inAllowedList    = cfg.allowed_auto_actions.includes(action.tool);
  const aboveAutoConf    = action.confidence >= cfg.confidence_threshold_auto;
  const underAmountLimit =
    action.amountUsd == null ||
    cfg.auto_fix_duplicate_under_amount == null ||
    action.amountUsd < cfg.auto_fix_duplicate_under_amount;

  if (inAllowedList && aboveAutoConf && underAmountLimit) return "AUTO";

  // ── NOTIFY: confident but not in auto list, or just below auto threshold ──
  const aboveNotifyConf = action.confidence >= cfg.confidence_threshold_notify;
  if (aboveNotifyConf) return "NOTIFY";

  // ── REVIEW: low confidence or unrecognised tool ───────────────────────────
  return "REVIEW";
}

// ── Assert that a STOP action has prior approval ──────────────────────────────

export function assertApproved(tier: PolicyTier, tool: string): void {
  if (tier === "STOP") {
    throw new PolicyViolationError(
      "STOP",
      tool,
      `Tool '${tool}' requires explicit human approval (STOP tier). Insert an agent_approvals row first.`,
    );
  }
}

// ── Load org policy from Supabase ─────────────────────────────────────────────

export async function loadOrgPolicy(orgId: string): Promise<OrgPolicyConfig> {
  const { data, error } = await supabase
    .from("org_policy_config")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !data) return { ...DEFAULT_POLICY };

  return {
    auto_fix_duplicate_under_amount:   data.auto_fix_duplicate_under_amount ?? null,
    never_touch_closed_periods_before: data.never_touch_closed_periods_before ?? null,
    confidence_threshold_auto:         Number(data.confidence_threshold_auto ?? 0.9),
    confidence_threshold_notify:       Number(data.confidence_threshold_notify ?? 0.75),
    allowed_auto_actions:              (data.allowed_auto_actions as string[]) ?? DEFAULT_POLICY.allowed_auto_actions,
    daily_token_budget:                data.daily_token_budget ?? null,
    daily_cost_budget_usd:             data.daily_cost_budget_usd ?? null,
  };
}

// ── Check whether autonomous agent is enabled for an org ─────────────────────

export async function isAutonomousEnabled(orgId: string): Promise<boolean> {
  const { data } = await supabase
    .from("org_feature_flags")
    .select("autonomous_agent")
    .eq("org_id", orgId)
    .maybeSingle();
  return data?.autonomous_agent === true;
}

// ── Check whether a trade date falls in a closed period ──────────────────────

export function isInClosedPeriod(
  tradeDate: string,
  config: OrgPolicyConfig,
): boolean {
  if (!config.never_touch_closed_periods_before) return false;
  return tradeDate < config.never_touch_closed_periods_before;
}
