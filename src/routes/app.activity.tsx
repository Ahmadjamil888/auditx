// ─── Activity Feed ────────────────────────────────────────────────────────────
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  RefreshCw,
  RotateCcw,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { useAgentJobs, useRevertRun } from "@/lib/data-hooks";
import type { AgentJob } from "@/lib/agent-queue";

export const Route = createFileRoute("/app/activity")({
  component: ActivityFeed,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  AUTO:   "var(--ok)",
  NOTIFY: "var(--warn)",
  REVIEW: "var(--color-accent)",
  STOP:   "var(--bad)",
};

const TIER_BG: Record<string, string> = {
  AUTO:   "rgba(31,157,99,0.1)",
  NOTIFY: "rgba(201,138,26,0.1)",
  REVIEW: "rgba(115,66,226,0.1)",
  STOP:   "rgba(214,69,69,0.1)",
};

const STATUS_ICON: Record<string, React.FC<{ size?: number; style?: React.CSSProperties }>> = {
  done:              CheckCircle2,
  running:           Loader2,
  pending:           Clock,
  failed:            AlertTriangle,
  failed_invariant:  AlertTriangle,
  dead_letter:       AlertTriangle,
};

function TierBadge({ tier }: { tier: string }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: TIER_BG[tier] ?? "rgba(0,0,0,0.06)", color: TIER_COLORS[tier] ?? "var(--ink-2)" }}
    >
      {tier}
    </span>
  );
}

function triggerLabel(type: string): string {
  const map: Record<string, string> = {
    upload:         "Document upload",
    sheet_change:   "Google Sheet changed",
    email:          "Email ingestion",
    cron_nightly:   "Nightly reconciliation",
    cron_monthly:   "Monthly tax run",
    manual:         "Manual run",
    ingestion:      "Source ingestion",
  };
  return map[type] ?? type;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Job Row ───────────────────────────────────────────────────────────────────

function JobRow({ job, orgId }: { job: AgentJob; orgId: string }) {
  const revertMutation = useRevertRun();
  const [reverted, setReverted] = useState(false);
  const Icon = STATUS_ICON[job.status] ?? Info;
  const isRunning = job.status === "running" || job.status === "pending";
  const isFailed  = job.status.startsWith("failed") || job.status === "dead_letter";
  const canRevert = job.status === "done" && !reverted && !!job.run_id;

  const summary = job.result_summary as Record<string, unknown> | null;

  async function handleRevert() {
    if (!job.run_id) return;
    try {
      const count = await revertMutation.mutateAsync({ runId: job.run_id, orgId });
      setReverted(true);
      toast.success(`Reverted ${count} change${count !== 1 ? "s" : ""}`);
    } catch (e) {
      toast.error((e as Error).message ?? "Revert failed");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl"
      style={{ border: "1px solid var(--hairline)", background: "#fff" }}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Status icon */}
        <span
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: isFailed
              ? "rgba(214,69,69,0.08)"
              : job.status === "done"
              ? "rgba(31,157,99,0.08)"
              : "rgba(115,66,226,0.08)",
          }}
        >
          <Icon
            size={15}
            strokeWidth={1.75}
            style={{
              color: isFailed ? "var(--bad)" : job.status === "done" ? "var(--ok)" : "var(--color-accent)",
            }}
            className={isRunning ? "animate-spin" : ""}
          />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{triggerLabel(job.trigger_type)}</span>
            <span className="text-xs" style={{ color: "var(--ink-3)" }}>{timeAgo(job.created_at)}</span>
            {summary && Object.keys(summary).length > 0 && (
              <span className="text-xs" style={{ color: "var(--ink-2)" }}>
                {summary["processed"] != null && `${summary["processed"]} rows`}
                {summary["flags"] != null && ` · ${summary["flags"]} flag(s)`}
                {summary["inserted"] != null && ` · ${summary["inserted"]} inserted`}
              </span>
            )}
          </div>

          {job.error_message && (
            <p className="mt-1 text-xs" style={{ color: "var(--bad)" }}>{job.error_message}</p>
          )}

          {reverted && (
            <p className="mt-1 text-xs font-medium" style={{ color: "var(--ok)" }}>✓ Reverted</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Status badge */}
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{
              background: isFailed
                ? "rgba(214,69,69,0.1)"
                : job.status === "done"
                ? "rgba(31,157,99,0.1)"
                : "rgba(115,66,226,0.1)",
              color: isFailed ? "var(--bad)" : job.status === "done" ? "var(--ok)" : "var(--color-accent)",
            }}
          >
            {job.status.replace("_", " ")}
          </span>

          {canRevert && (
            <button
              type="button"
              onClick={handleRevert}
              disabled={revertMutation.isPending}
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-black/5 disabled:opacity-50"
              style={{ borderColor: "var(--hairline)", color: "var(--ink-2)" }}
              title="Revert all changes from this run"
            >
              {revertMutation.isPending ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <RotateCcw size={11} />
              )}
              Revert
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function ActivityFeed() {
  const { profile } = useAuth();
  const orgId = profile?.org_id;
  const { data: jobs, isLoading, refetch, isFetching } = useAgentJobs(orgId, 100);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Activity Feed</h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--ink-2)" }}>
            Every autonomous action AuditX has taken, in order. Revert any run instantly.
          </p>
        </div>
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

      {/* Legend */}
      <div className="mb-4 flex flex-wrap gap-3">
        {Object.entries(TIER_COLORS).map(([tier, color]) => (
          <span key={tier} className="flex items-center gap-1.5 text-xs" style={{ color }}>
            <Zap size={11} />
            {tier}
          </span>
        ))}
      </div>

      {/* Jobs list */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: "var(--color-accent)" }} />
        </div>
      ) : !jobs?.length ? (
        <div
          className="flex flex-col items-center justify-center rounded-2xl py-16 text-center"
          style={{ border: "1px dashed var(--hairline)" }}
        >
          <CheckCircle2 size={32} style={{ color: "var(--ink-3)" }} />
          <p className="mt-3 text-sm font-medium">No agent activity yet</p>
          <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
            Connect a data source or upload a document to get started.
          </p>
        </div>
      ) : (
        <AnimatePresence>
          <div className="space-y-3">
            {(jobs ?? []).map((job) => (
              <JobRow key={job.id} job={job} orgId={orgId ?? ""} />
            ))}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}
