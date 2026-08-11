// ─── React Query hooks for real Supabase data ─────────────────────────────────

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseDocument, parseTextDocument } from "./ai-service";
import { supabase } from "./supabase";
import type { Transaction } from "./demo-data";

// ── Transactions ──────────────────────────────────────────────────────────────

export function useTransactions(orgId: string | undefined) {
  return useQuery({
    queryKey: ["transactions", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("org_id", orgId!)
        .order("trade_date", { ascending: false });

      if (error) throw new Error(error.message);

      return (data ?? []).map((row) => ({
        id: row.id,
        ticker: row.ticker,
        action: row.action as Transaction["action"],
        quantity: Number(row.quantity),
        price: Number(row.price),
        fees: Number(row.fees),
        wht: Number(row.wht),
        trade_date: row.trade_date,
        ref_id: row.ref_id,
        confidence_score: Number(row.confidence_score),
        status: row.status as Transaction["status"],
        broker: row.broker,
        exchange: row.exchange as Transaction["exchange"],
      })) as Transaction[];
    },
    staleTime: 0,
  });
}

export interface TransactionInput {
  ticker: string;
  action: "BUY" | "SELL" | "DIV";
  quantity: number;
  price: number;
  fees: number;
  wht: number;
  trade_date: string;
  ref_id: string;
  broker: string;
  exchange: string;
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, values }: { orgId: string; values: TransactionInput }) => {
      const { data, error } = await supabase
        .from("transactions")
        .insert({
          org_id: orgId,
          ...values,
          ticker: values.ticker.toUpperCase(),
          confidence_score: 1,
          status: "posted",
        } as never)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_d, { orgId }) => qc.invalidateQueries({ queryKey: ["transactions", orgId] }),
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      orgId,
      values,
    }: {
      id: string;
      orgId: string;
      values: Partial<TransactionInput> & { status?: string };
    }) => {
      const { error } = await supabase
        .from("transactions")
        .update(values as never)
        .eq("id", id)
        .eq("org_id", orgId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, { orgId }) => qc.invalidateQueries({ queryKey: ["transactions", orgId] }),
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, orgId }: { id: string; orgId: string }) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id).eq("org_id", orgId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, { orgId }) => qc.invalidateQueries({ queryKey: ["transactions", orgId] }),
  });
}

/** Number of transactions created in the current calendar month (plan metering). */
export function useMonthlyTransactionCount(orgId: string | undefined) {
  return useQuery({
    queryKey: ["transactions_month", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const { count, error } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId!)
        .gte("created_at", start.toISOString());
      if (error) return 0;
      return count ?? 0;
    },
    staleTime: 30_000,
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
        id: row.id,
        flag_type: row.flag_type,
        severity: row.severity as "ok" | "warn" | "bad",
        ticker: row.ticker,
        ref_id: row.ref_id,
        expected: typeof row.expected === "number" ? row.expected : 0,
        actual: typeof row.actual === "number" ? row.actual : 0,
        description: row.description,
        suggested_resolution: row.suggested_resolution,
      }));
    },
    staleTime: 30_000,
  });
}

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
    onSuccess: (_d, { orgId }) => qc.invalidateQueries({ queryKey: ["reconciliation_flags", orgId] }),
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
        .maybeSingle();
      if (error || !data) return { plan: "free", status: "active", current_period_end: null };
      return data;
    },
    staleTime: 60_000,
  });
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface AppNotification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
}

export function useNotifications(userId: string | undefined) {
  return useQuery({
    queryKey: ["notifications", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, type, message, read, created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw new Error(error.message);
      return (data ?? []) as AppNotification[];
    },
    refetchInterval: 60_000,
    staleTime: 15_000,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, id }: { userId: string; id?: string }) => {
      let query = supabase.from("notifications").update({ read: true }).eq("user_id", userId);
      if (id) query = query.eq("id", id);
      else query = query.eq("read", false);
      const { error } = await query;
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, { userId }) => qc.invalidateQueries({ queryKey: ["notifications", userId] }),
  });
}

export async function pushNotification(input: {
  orgId: string;
  userId: string;
  type: string;
  message: string;
}) {
  await supabase
    .from("notifications")
    .insert({ org_id: input.orgId, user_id: input.userId, type: input.type, message: input.message })
    .then(() => undefined, () => undefined);
}

// ── Broker accounts ───────────────────────────────────────────────────────────

export interface BrokerInput {
  name: string;
  broker_name: string;
  currency: string;
  exchange: string;
  external_ref?: string | undefined;
}

export function useBrokerConnections(orgId: string | undefined) {
  return useQuery({
    queryKey: ["broker_connections", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("broker_accounts")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useConnectBroker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, broker }: { orgId: string; broker: BrokerInput }) => {
      const { data, error } = await supabase
        .from("broker_accounts")
        .insert({
          org_id: orgId,
          name: broker.name,
          broker_name: broker.broker_name,
          currency: broker.currency,
          exchange: broker.exchange,
          external_ref: broker.external_ref ?? null,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_d, { orgId }) => qc.invalidateQueries({ queryKey: ["broker_connections", orgId] }),
  });
}

export function useDeleteBroker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, orgId }: { id: string; orgId: string }) => {
      const { error } = await supabase.from("broker_accounts").delete().eq("id", id).eq("org_id", orgId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, { orgId }) => qc.invalidateQueries({ queryKey: ["broker_connections", orgId] }),
  });
}

// ── Organisation ──────────────────────────────────────────────────────────────

export function useDeleteOrganization() {
  return useMutation({
    mutationFn: async ({ orgId }: { orgId: string }) => {
      const { error } = await supabase.from("organizations").delete().eq("id", orgId);
      if (error) throw new Error(error.message);
    },
  });
}

// ── Universal file import ─────────────────────────────────────────────────────

export function useUniversalImport() {
  return useMutation({
    mutationFn: async ({ file }: { file: File; orgId: string }) => {
      const isText =
        file.type.includes("text") || file.type.includes("csv") || file.name.endsWith(".csv");

      if (isText) return parseTextDocument(await file.text(), file.name);

      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.readAsDataURL(file);
      });
      return parseDocument(base64, file.type || "application/pdf", file.name);
    },
  });
}
