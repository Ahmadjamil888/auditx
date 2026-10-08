// ─── Review Inbox ─────────────────────────────────────────────────────────────
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Shield,
  SkipForward,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { usePendingApprovals, useDecideApproval } from "@/lib/data-hooks";
import { learnFromDecision } from "@/lib/policy-learner";
import type { AgentApproval } from "@/lib/agent-queue";

export const Route = createFileRoute("/app/review")({
  component: ReviewInbox,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function confidenceColor(c: number): string {
  if (c >= 0.9) return "var(--ok)";
  if (c >= 0.75) return "var(--warn)";
  return "var(--bad)";
}

function formatField(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Approval Card ─────────────────────────────────────────────────────────────

function ApprovalCard({
  approval,
  orgId,
  userId,
  onDecision,
}: {
  approval:   AgentApproval;
  orgId:      string;
  userId:     string;
  onDecision: () => void;
}) {
  const decideMutation = useDecideApproval();
  const [deciding, setDeciding] = useState<"approved" | "rejected" | "skipped" | null>(null);

  const payload    = approval.action_payload as Record<string, unknown>;
  const confidence = typeof payload["confidence"] === "number" ? (payload["confidence"] as number) : null;
  const isStop     = approval.policy_tier === "STOP";

  async function handle(decision: "approved" | "rejected" | "skipped") {
    setDeciding(decision);
    try {
      await decideMutation.mutateAsync({ approvalId: approval.id, decision, userId, orgId });
      // Learn from repeated decisions (fire-and-forget)
      learnFromDecision(orgId, approval.action_type, decision === "approved" ? "approved" : "rejected")
        .catch(() => undefined);
      toast.success(
        decision === "approved" ? "Change applied" :
        decision === "rejected" ? "Change rejected" : "Skipped for now",
      );
      onDecision();
    } catch (e) {
      toast.error((e as Error).message ?? "Decision failed");
      setDeciding(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="overflow-hidden rounded-2xl"
      style={{
        border: `1px solid ${isStop ? "rgba(214,69,69,0.25)" : "rgba(115,66,226,0.18)"}`,
        background: isStop ? "rgba(214,69,69,0.03)" : "#fff",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 border-b px-4 py-3"
        style={{ borderColor: "var(--hairline)" }}
      >
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: isStop ? "rgba(214,69,69,0.1)" : "rgba(115,66,226,0.1)",
          }}
        >
          {isStop
            ? <Shield size={14} strokeWidth={1.75} style={{ color: "var(--bad)" }} />
            : <AlertTriangle size={14} strokeWidth={1.75} style={{ color: "var(--color-accent)" }} />
          }
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">
            {formatField(approval.action_type)}
          </p>
          <p className="text-xs" style={{ color: "var(--ink-3)" }}>
            {isStop ? "Requires explicit approval" : "Low confidence — needs your review"}
            {" · "}
            {new Date(approval.created_at).toLocaleString()}
          </p>
        </div>

        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{
            background: isStop ? "rgba(214,69,69,0.1)" : "rgba(115,66,226,0.1)",
            color: isStop ? "var(--bad)" : "var(--color-accent)",
          }}
        >
          {approval.policy_tier}
        </span>
      </div>

      {/* Fields */}
      <div className="px-4 py-3">
        {confidence !== null && (
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--ink-3)" }}>Confidence</span>
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full"
              style={{ background: "var(--hairline)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width:      `${Math.round(confidence * 100)}%`,
                  background: confidenceColor(confidence),
                }}
              />
            </div>
            <span
              className="text-xs font-semibold tabular-nums"
              style={{ color: confidenceColor(confidence) }}
            >
              {Math.round(confidence * 100)}%
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
          {Object.entries(payload)
            .filter(([k]) => !["confidence", "org_id", "source", "agent_run_id"].includes(k))
            .map(([key, val]) => (
              <div key={key}>
                <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
                  {formatField(key)}
                </p>
                <p className="truncate text-sm font-medium">
                  {val == null ? "—" : String(val)}
                </p>
              </div>
            ))}
        </div>
      </div>

      {/* Action bar */}
      <div
        className="flex items-center justify-end gap-2 border-t px-4 py-3"
        style={{ borderColor: "var(--hairline)", background: "rgba(25,40,55,0.02)" }}
      >
        <button
          type="button"
          onClick={() => void handle("skipped")}
          disabled={!!deciding}
          className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/5 disabled:opacity-40"
          style={{ borderColor: "var(--hairline)", color: "var(--ink-2)" }}
        >
          {deciding === "skipped"
            ? <Loader2 size={11} className="animate-spin" />
            : <SkipForward size={11} />}
          Skip
        </button>

        <button
          type="button"
          onClick={() => void handle("rejected")}
          disabled={!!deciding}
          className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/5 disabled:opacity-40"
          style={{ borderColor: "rgba(214,69,69,0.3)", color: "var(--bad)" }}
        >
          {deciding === "rejected"
            ? <Loader2 size={11} className="animate-spin" />
            : <X size={11} />}
          Reject
        </button>

        <button
          type="button"
          onClick={() => void handle("approved")}
          disabled={!!deciding}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: isStop ? "var(--bad)" : "var(--color-accent)" }}
        >
          {deciding === "approved"
            ? <Loader2 size={11} className="animate-spin" />
            : <Check size={11} />}
          {isStop ? "Approve & apply" : "Apply"}
        </button>
      </div>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function ReviewInbox() {
  const { profile, user } = useAuth();
  const orgId  = profile?.org_id ?? "";
  const userId = user?.id ?? "";

  const { data: approvals, isLoading, refetch, isFetching } = usePendingApprovals(orgId || undefined);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = (approvals ?? []).filter((a) => !dismissed.has(a.id));

  function markDone(id: string) {
    setDismissed((prev) => new Set([...prev, id]));
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Review Inbox</h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--ink-2)" }}>
            Items that need your decision before AuditX can proceed.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {visible.length > 0 && (
            <span
              className="flex size-6 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: "var(--bad)" }}
            >
              {visible.length}
            </span>
          )}
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-50"
            style={{ borderColor: "var(--hairline)" }}
          >
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: "var(--color-accent)" }} />
        </div>
      ) : visible.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-2xl py-20 text-center"
          style={{ border: "1px dashed var(--hairline)" }}
        >
          <CheckCircle2 size={36} style={{ color: "var(--ok)" }} />
          <p className="mt-3 text-sm font-semibold">Inbox is clear</p>
          <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
            No items waiting for your review right now.
          </p>
        </div>
      ) : (
        <AnimatePresence>
          <div className="space-y-4">
            {visible.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                orgId={orgId}
                userId={userId}
                onDecision={() => markDone(approval.id)}
              />
            ))}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}
