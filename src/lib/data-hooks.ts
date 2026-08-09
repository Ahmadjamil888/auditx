// ─── React Query hooks for real Supabase data ─────────────────────────────────

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { Transaction } from "./demo-data";

// ── Transactions ──────────────────────────────────────────────────────────────

export function useTransactions(orgId: string | undefined) {
  return useQuery({
    queryKey: ["transactions", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      console.log("[useTransactions] Fetching transactions for org:", orgId);
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("org_id", orgId!)
        .order("trade_date", { ascending: false });

      if (error) {
        console.error("[useTransactions] Error fetching transactions:", error);
        throw new Error(error.message);
      }

      console.log("[useTransactions] Fetched", data?.length || 0, "transactions");
      return (data ?? []).map((row) => ({
        id:               row.id,
        ticker:           row.ticker,
        action:           row.action as Transaction["action"],
        quantity:         Number(row.quantity),
        price:            Number(row.price),
        fees:             Number(row.fees),
        wht:              Number(row.wht),
        trade_date:       row.trade_date,
        ref_id:           row.ref_id,
        confidence_score: Number(row.confidence_score),
        status:           row.status as Transaction["status"],
        broker:           row.broker,
        exchange:         row.exchange as Transaction["exchange"],
      })) as Transaction[];
    },
    staleTime: 0, // Always fetch fresh data to ensure UI shows latest state
  });
}

// ── Reconciliation flags ──────────────────────────────────────────────────────

export function useReconciliationFlags(orgId: string | undefined) {
  return useQuery({
    queryKey: ["reconciliation_flags", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reconciliation_flags")
        .select("*")
        .eq("org_id", orgId!)
        .eq("status", "open")
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      return (data ?? []).map((row) => ({
        id:                   row.id,
        flag_type:            row.flag_type,
        severity:             row.severity as "ok" | "warn" | "bad",
        ticker:               row.ticker,
        ref_id:               row.ref_id,
        expected:             typeof row.expected === "number" ? row.expected : 0,
        actual:               typeof row.actual === "number" ? row.actual : 0,
        description:          row.description,
        suggested_resolution: row.suggested_resolution,
      }));
    },
    staleTime: 30_000,
  });
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export function useAuditLog(orgId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: ["audit_log", orgId, limit],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw new Error(error.message);

      return data ?? [];
    },
    staleTime: 15_000,
  });
}

// ── Subscription / plan ───────────────────────────────────────────────────────

export function useSubscription(orgId: string | undefined) {
  return useQuery({
    queryKey: ["subscription", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("org_id", orgId!)
        .single();

      if (error) return { plan: "free", status: "active", current_period_end: null };
      return data;
    },
    staleTime: 60_000,
  });
}

// ── Resolve flag mutation ─────────────────────────────────────────────────────

export function useResolveFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ flagId, orgId }: { flagId: string; orgId: string }) => {
      const { error } = await supabase
        .from("reconciliation_flags")
        .update({ status: "resolved" })
        .eq("id", flagId)
        .eq("org_id", orgId);

      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, { orgId }) => {
      qc.invalidateQueries({ queryKey: ["reconciliation_flags", orgId] });
    },
  });
}
