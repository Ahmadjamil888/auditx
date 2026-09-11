// ─── AuditX Intelligence Tool Layer ──────────────────────────────────────────
// Modular, intent-based tools that power the AI Explanation Layer.
// AI calls these functions — never raw DB queries.
// ALL returned numbers are deterministic — never AI-generated.

import { supabase } from "./supabase";
import { computeTax, suggestHarvesting } from "./tax";
import { computePortfolioSummary, computeHealthScore } from "./financial-intelligence";
import type { Transaction } from "./demo-data";

// ── Tool Result ───────────────────────────────────────────────────────────────

export interface ToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  source: "DETERMINISTIC" | "DATABASE" | "AI_INTERPRETATION";
  confidence: number;
}

// ── Context for every tool call ───────────────────────────────────────────────

export interface IntelligenceToolContext {
  orgId: string;
  jurisdiction: "PSX" | "NSE";
  taxYear: string;
  currentTransactionId?: string | undefined;
  currentPage?: string | undefined;
}

// ── Tool: Get Portfolio Summary ───────────────────────────────────────────────

export async function getPortfolioSummary(
  ctx: IntelligenceToolContext,
): Promise<ToolResult> {
  const { data: txRows, error } = await supabase
    .from("transactions")
    .select("id,ticker,action,quantity,price,fees,wht,trade_date,ref_id,confidence_score,status,broker,exchange")
    .eq("org_id", ctx.orgId)
    .order("trade_date", { ascending: false });

  if (error) return { ok: false, error: error.message, source: "DATABASE", confidence: 0 };

  const txs = (txRows ?? []) as Transaction[];
  const summary = computePortfolioSummary(txs, ctx.jurisdiction, ctx.taxYear);

  return {
    ok: true,
    data: summary,
    source: "DETERMINISTIC",
    confidence: 1.0,
  };
}

// ── Tool: Get Tax Liability ───────────────────────────────────────────────────

export async function getTaxLiability(
  ctx: IntelligenceToolContext,
): Promise<ToolResult> {
  const { data: txRows, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("org_id", ctx.orgId);

  if (error) return { ok: false, error: error.message, source: "DATABASE", confidence: 0 };

  const txs = (txRows ?? []) as Transaction[];
  const tax = computeTax(txs, {
    jurisdiction: ctx.jurisdiction,
    filerStatus: "Filer",
    taxYear: ctx.taxYear,
  });

  return {
    ok: true,
    data: {
      estimatedTaxDue: tax.estimatedTaxDue,
      shortTermTax: tax.shortTermTax,
      longTermTax: tax.longTermTax,
      shortTermGain: tax.shortTermGain,
      longTermGain: tax.longTermGain,
      dividendWHT: tax.dividendWHT,
      totalGain: tax.totalGain,
      jurisdiction: tax.jurisdiction,
      taxYear: tax.taxYear,
      lots: tax.lots.slice(0, 20), // top 20 lots
    },
    source: "DETERMINISTIC",
    confidence: 1.0,
  };
}

// ── Tool: Get Unreconciled Transactions ──────────────────────────────────────

export async function getUnreconciledTransactions(
  ctx: IntelligenceToolContext,
  limit = 20,
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id,ticker,action,quantity,price,fees,trade_date,ref_id,confidence_score,broker")
    .eq("org_id", ctx.orgId)
    .eq("status", "needs_review")
    .order("confidence_score", { ascending: true })
    .limit(limit);

  if (error) return { ok: false, error: error.message, source: "DATABASE", confidence: 0 };

  return {
    ok: true,
    data: { transactions: data ?? [], count: data?.length ?? 0 },
    source: "DATABASE",
    confidence: 1.0,
  };
}

// ── Tool: Get Critical Anomalies ─────────────────────────────────────────────

export async function getCriticalAnomalies(
  ctx: IntelligenceToolContext,
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from("reconciliation_flags")
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("status", "open")
    .eq("severity", "bad")
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: error.message, source: "DATABASE", confidence: 0 };

  return {
    ok: true,
    data: { flags: data ?? [], count: data?.length ?? 0 },
    source: "DATABASE",
    confidence: 1.0,
  };
}

// ── Tool: Get Transaction Details ────────────────────────────────────────────

export async function getTransactionDetails(
  ctx: IntelligenceToolContext,
  transactionId: string,
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Transaction not found", source: "DATABASE", confidence: 0 };
  }

  // Fetch related reconciliation flags
  const refId = (data as Record<string, unknown>)["ref_id"] as string;
  const { data: flags } = await supabase
    .from("reconciliation_flags")
    .select("flag_type,severity,description,expected,actual,suggested_resolution")
    .eq("org_id", ctx.orgId)
    .eq("ref_id", refId)
    .eq("status", "open");

  return {
    ok: true,
    data: { transaction: data, relatedFlags: flags ?? [] },
    source: "DATABASE",
    confidence: 1.0,
  };
}

// ── Tool: Get Broker Discrepancies ───────────────────────────────────────────

export async function getBrokerDiscrepancies(
  ctx: IntelligenceToolContext,
): Promise<ToolResult> {
  const { data: flags, error } = await supabase
    .from("reconciliation_flags")
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("status", "open")
    .in("flag_type", ["Fee Surcharge", "WHT Mismatch", "Duplicate Entry", "Unmatched Fill"])
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: error.message, source: "DATABASE", confidence: 0 };

  // Calculate total financial impact
  const totalImpact = (flags ?? []).reduce((sum, f) => {
    const expected = typeof f.expected === "number" ? f.expected : 0;
    const actual = typeof f.actual === "number" ? f.actual : 0;
    return sum + Math.abs(actual - expected);
  }, 0);

  return {
    ok: true,
    data: {
      flags: flags ?? [],
      count: flags?.length ?? 0,
      totalImpact,
      currency: ctx.jurisdiction === "PSX" ? "PKR" : "INR",
    },
    source: "DATABASE",
    confidence: 1.0,
  };
}

// ── Tool: Get Missing Documents ──────────────────────────────────────────────

export async function getMissingDocuments(
  ctx: IntelligenceToolContext,
): Promise<ToolResult> {
  // Transactions without a document_id
  const { data: txs, error } = await supabase
    .from("transactions")
    .select("id,ticker,action,quantity,price,trade_date,ref_id")
    .eq("org_id", ctx.orgId)
    .is("document_id", null)
    .limit(30);

  if (error) return { ok: false, error: error.message, source: "DATABASE", confidence: 0 };

  return {
    ok: true,
    data: {
      transactions: txs ?? [],
      count: txs?.length ?? 0,
    },
    source: "DATABASE",
    confidence: 1.0,
  };
}

// ── Tool: Get Tax Harvesting Opportunities ────────────────────────────────────

export async function getTaxHarvestingOpportunities(
  ctx: IntelligenceToolContext,
): Promise<ToolResult> {
  const { data: txRows, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("org_id", ctx.orgId);

  if (error) return { ok: false, error: error.message, source: "DATABASE", confidence: 0 };

  const txs = (txRows ?? []) as Transaction[];
  const tax = computeTax(txs, {
    jurisdiction: ctx.jurisdiction,
    filerStatus: "Filer",
    taxYear: ctx.taxYear,
  });
  const suggestions = suggestHarvesting(txs, tax.totalGain);

  return {
    ok: true,
    data: {
      suggestions,
      currentRealizedGain: tax.totalGain,
      estimatedSaving: suggestions.reduce((s, x) => s + x.potentialOffset * 0.15, 0),
      currency: ctx.jurisdiction === "PSX" ? "PKR" : "INR",
    },
    source: "DETERMINISTIC",
    confidence: 0.85, // market prices are hardcoded estimates
  };
}

// ── Tool: Get Financial Health ────────────────────────────────────────────────

export async function getFinancialHealth(
  ctx: IntelligenceToolContext,
): Promise<ToolResult> {
  const [txRes, flagRes] = await Promise.all([
    supabase.from("transactions").select("id,status,confidence_score,ref_id,document_id").eq("org_id", ctx.orgId),
    supabase.from("reconciliation_flags").select("id,severity").eq("org_id", ctx.orgId).eq("status", "open"),
  ]);

  if (txRes.error) return { ok: false, error: txRes.error.message, source: "DATABASE", confidence: 0 };

  const rawTxs = txRes.data ?? [];
  const flags = flagRes.data ?? [];
  const critical = flags.filter((f) => f.severity === "bad").length;

  // computeHealthScore only needs status, confidence_score, ref_id — cast safely
  const txs = rawTxs as unknown as Transaction[];
  const score = computeHealthScore(txs, flags.length, critical);

  return {
    ok: true,
    data: score,
    source: "DETERMINISTIC",
    confidence: 1.0,
  };
}

// ── Tool: Get Daily Priorities ────────────────────────────────────────────────

export async function getDailyPriorities(
  ctx: IntelligenceToolContext,
): Promise<ToolResult> {
  const [txRes, flagRes] = await Promise.all([
    supabase
      .from("transactions")
      .select("id,ticker,status,confidence_score,trade_date")
      .eq("org_id", ctx.orgId)
      .limit(200),
    supabase
      .from("reconciliation_flags")
      .select("id,flag_type,severity,description,ticker")
      .eq("org_id", ctx.orgId)
      .eq("status", "open"),
  ]);

  const txs = txRes.data ?? [];
  const flags = flagRes.data ?? [];

  const priorities = [];

  const unreconciled = txs.filter((t) => t.status === "needs_review").length;
  if (unreconciled > 0) {
    priorities.push({
      priority: "HIGH",
      title: `${unreconciled} unreconciled transactions`,
      action: "Review in Reconciliation",
      link: "/app/reconciliation",
    });
  }

  const critical = flags.filter((f) => f.severity === "bad");
  if (critical.length > 0) {
    priorities.push({
      priority: "CRITICAL",
      title: `${critical.length} critical flags require action`,
      details: critical[0]?.description,
      action: "Investigate",
      link: "/app/reconciliation",
    });
  }

  return {
    ok: true,
    data: { priorities, totalIssues: priorities.length },
    source: "DETERMINISTIC",
    confidence: 1.0,
  };
}

// ── Tool: Compare Financial Periods ──────────────────────────────────────────

export async function compareFinancialPeriods(
  ctx: IntelligenceToolContext,
  yearA: string,
  yearB: string,
): Promise<ToolResult> {
  const { data: txRows, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("org_id", ctx.orgId);

  if (error) return { ok: false, error: error.message, source: "DATABASE", confidence: 0 };

  const txs = (txRows ?? []) as Transaction[];
  const taxA = computeTax(txs, { jurisdiction: ctx.jurisdiction, filerStatus: "Filer", taxYear: yearA });
  const taxB = computeTax(txs, { jurisdiction: ctx.jurisdiction, filerStatus: "Filer", taxYear: yearB });

  return {
    ok: true,
    data: {
      periodA: { year: yearA, tax: taxA.estimatedTaxDue, gains: taxA.totalGain, lots: taxA.lots.length },
      periodB: { year: yearB, tax: taxB.estimatedTaxDue, gains: taxB.totalGain, lots: taxB.lots.length },
      delta: {
        tax: taxB.estimatedTaxDue - taxA.estimatedTaxDue,
        gains: taxB.totalGain - taxA.totalGain,
      },
    },
    source: "DETERMINISTIC",
    confidence: 1.0,
  };
}

// ── Intent Router ─────────────────────────────────────────────────────────────
// Routes user intents to the correct tool(s)

export type AIIntent =
  | "TAX_CHANGE_EXPLANATION"
  | "PORTFOLIO_ANALYSIS"
  | "RECONCILIATION_STATUS"
  | "ANOMALY_EXPLANATION"
  | "TRANSACTION_EXPLANATION"
  | "BROKER_DISCREPANCY"
  | "TAX_OPPORTUNITY"
  | "FINANCIAL_HEALTH"
  | "DAILY_PRIORITIES"
  | "PERIOD_COMPARISON"
  | "GENERAL";

export function detectIntent(prompt: string, page?: string): AIIntent {
  const lower = prompt.toLowerCase();

  if (lower.includes("tax") && (lower.includes("change") || lower.includes("increase") || lower.includes("why"))) {
    return "TAX_CHANGE_EXPLANATION";
  }
  if (lower.includes("tax") && lower.includes("opportun")) return "TAX_OPPORTUNITY";
  if (lower.includes("portfolio") || lower.includes("holding") || lower.includes("position")) return "PORTFOLIO_ANALYSIS";
  if (lower.includes("reconcil") || lower.includes("unmatched")) return "RECONCILIATION_STATUS";
  if (lower.includes("anomal") || lower.includes("discrepanc") || lower.includes("mismatch")) return "ANOMALY_EXPLANATION";
  if (lower.includes("broker") || lower.includes("fee") || lower.includes("overcharge")) return "BROKER_DISCREPANCY";
  if (lower.includes("health") || lower.includes("score") || lower.includes("status")) return "FINANCIAL_HEALTH";
  if (lower.includes("priorit") || lower.includes("attention") || lower.includes("today")) return "DAILY_PRIORITIES";
  if (lower.includes("compare") || lower.includes("vs") || lower.includes("period")) return "PERIOD_COMPARISON";
  if (page === "transaction") return "TRANSACTION_EXPLANATION";
  return "GENERAL";
}

// ── Build AI prompt from tool results ────────────────────────────────────────

export function buildIntelligencePrompt(
  userQuery: string,
  intent: AIIntent,
  toolResults: ToolResult[],
  context: {
    jurisdiction: string;
    currentPage?: string;
    transactionId?: string;
    taxYear?: string;
  },
): string {
  const currency = context.jurisdiction === "PSX" ? "PKR" : "INR";

  const dataSection = toolResults
    .filter((r) => r.ok)
    .map((r, i) => `## Tool Result ${i + 1} (Source: ${r.source}, Confidence: ${(r.confidence * 100).toFixed(0)}%)\n${JSON.stringify(r.data, null, 2)}`)
    .join("\n\n");

  return `You are AuditX, a financial intelligence system for ${context.jurisdiction} investors.

CRITICAL RULES:
- NEVER invent or estimate financial numbers
- Use ONLY the data from the Tool Results below
- Clearly mark every number with its source
- Distinguish between: FACT (from DB), CALCULATION (deterministic engine), INTERPRETATION (your analysis)
- Currency: ${currency}
- Tax Year: ${context.taxYear ?? "2025"}
- Current page context: ${context.currentPage ?? "unknown"}
${context.transactionId ? `- Current transaction: ${context.transactionId}` : ""}

User Query: "${userQuery}"
Detected Intent: ${intent}

${dataSection ? `TOOL RESULTS (deterministic data — these numbers are exact):\n${dataSection}` : "No tool data available for this query."}

Respond with a structured explanation:
1. Direct answer to the question (2-3 sentences)
2. Key numbers with labels (mark source: FACT / CALCULATION / INTERPRETATION)  
3. What caused any changes (reference specific transactions/events)
4. Recommended action if applicable

Keep response concise and professional. Use markdown for structure. End with confidence level.`;
}
