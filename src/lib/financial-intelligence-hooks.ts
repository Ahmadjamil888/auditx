// ─── Financial Intelligence Hooks ─────────────────────────────────────────────
// React Query hooks for the Financial Intelligence Layer.
// All data from Supabase + deterministic engines.

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./auth-context";
import { useTransactions, useReconciliationFlags } from "./data-hooks";
import {
  computePortfolioSummary,
  computeHealthScore,
  computePriorities,
  buildAIContext,
  fetchFinancialEvents,
  fetchFinancialInsights,
  type FinancialContext,
  type HealthScoreBreakdown,
  type PortfolioSummary,
  type Priority,
  type FinancialEvent,
  type FinancialInsight,
} from "./financial-intelligence";

// ── Portfolio Summary ─────────────────────────────────────────────────────────

export function usePortfolioSummary() {
  const { profile } = useAuth();
  const jurisdiction = (profile?.jurisdiction as "PSX" | "NSE") ?? "PSX";
  const { data: transactions = [], isLoading } = useTransactions(profile?.org_id);
  const { data: flags = [] } = useReconciliationFlags(profile?.org_id);

  const summary = computePortfolioSummary(transactions, jurisdiction, "2025");
  const summaryWithFlags: PortfolioSummary = {
    ...summary,
    openFlags: flags.length,
  };

  return { summary: summaryWithFlags, isLoading };
}

// ── Financial Health Score ────────────────────────────────────────────────────

export function useHealthScore(): { score: HealthScoreBreakdown; isLoading: boolean } {
  const { profile } = useAuth();
  const { data: transactions = [], isLoading } = useTransactions(profile?.org_id);
  const { data: flags = [] } = useReconciliationFlags(profile?.org_id);

  const criticalFlags = flags.filter((f) => f.severity === "bad").length;
  const score = computeHealthScore(transactions, flags.length, criticalFlags);

  return { score, isLoading };
}

// ── Financial Events ──────────────────────────────────────────────────────────

export function useFinancialEvents(limit = 20) {
  const { profile } = useAuth();
  return useQuery<FinancialEvent[]>({
    queryKey: ["financial_events", profile?.org_id, limit],
    enabled: !!profile?.org_id,
    queryFn: () => fetchFinancialEvents(profile!.org_id, limit),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ── Financial Insights ────────────────────────────────────────────────────────

export function useFinancialInsights(limit = 10) {
  const { profile } = useAuth();
  return useQuery<FinancialInsight[]>({
    queryKey: ["financial_insights", profile?.org_id, limit],
    enabled: !!profile?.org_id,
    queryFn: () => fetchFinancialInsights(profile!.org_id, limit),
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
}

// ── Priorities ────────────────────────────────────────────────────────────────

export function usePriorities(): { priorities: Priority[]; isLoading: boolean } {
  const { profile } = useAuth();
  const { data: transactions = [], isLoading: txLoading } = useTransactions(profile?.org_id);
  const { data: flags = [], isLoading: flagsLoading } = useReconciliationFlags(profile?.org_id);
  const { data: insights = [] } = useFinancialInsights();

  const priorities = computePriorities(transactions, flags, insights);

  return { priorities, isLoading: txLoading || flagsLoading };
}

// ── AI Context ────────────────────────────────────────────────────────────────

export function useAIContext(pageMeta?: {
  page: string;
  entityId?: string;
  taxYear?: string;
}): { context: FinancialContext | null; isLoading: boolean } {
  const { profile } = useAuth();
  const { summary, isLoading: summaryLoading } = usePortfolioSummary();
  const { score } = useHealthScore();
  const { data: events = [] } = useFinancialEvents(5);
  const { data: insights = [] } = useFinancialInsights(5);

  if (!profile?.org_id || summaryLoading) {
    return { context: null, isLoading: true };
  }

  const context = buildAIContext(
    profile.org_id,
    summary,
    score.total,
    events,
    insights,
    pageMeta,
  );

  return { context, isLoading: false };
}

// ── Daily Briefing Data ───────────────────────────────────────────────────────

export interface DailyBriefingData {
  userName: string;
  portfolioChange: number;
  portfolioChangePct: number;
  reconciledToday: number;
  newDiscrepancies: number;
  taxChange: number;
  criticalIssues: number;
  topPriority: Priority | null;
  healthScore: number;
  jurisdiction: string;
}

export function useDailyBriefing(): { briefing: DailyBriefingData | null; isLoading: boolean } {
  const { profile } = useAuth();
  const { summary, isLoading } = usePortfolioSummary();
  const { score } = useHealthScore();
  const { priorities } = usePriorities();
  const { data: transactions = [] } = useTransactions(profile?.org_id);

  if (!profile || isLoading) return { briefing: null, isLoading: true };

  // Count today's reconciled transactions
  const today = new Date().toISOString().slice(0, 10);
  const reconciledToday = transactions.filter(
    (t) => t.trade_date === today && t.status === "posted",
  ).length;

  const briefing: DailyBriefingData = {
    userName: profile.full_name || "there",
    portfolioChange: 0, // requires snapshot comparison
    portfolioChangePct: 0,
    reconciledToday,
    newDiscrepancies: summary.openFlags,
    taxChange: 0, // requires snapshot comparison
    criticalIssues: priorities.filter((p) => p.severity === "CRITICAL").length,
    topPriority: priorities[0] ?? null,
    healthScore: score.total,
    jurisdiction: profile.jurisdiction ?? "PSX",
  };

  return { briefing, isLoading: false };
}
